/**
 * ABSTRACAO DE PERSISTENCIA DE REPLAY
 *
 * Unifica duas estrategias de armazenamento do SessionLog NDJSON:
 *
 *   1. Disco local (`DiskReplayStorage`) - mantem o comportamento anterior;
 *   2. S3 (`S3ReplayStorage`) - espelha o arquivo local em um bucket S3
 *      a cada `MICROFIRMA_REPLAY_SYNC_MS` milissegundos.
 *
 * A estrategia e escolhida pela presenca de `MICROFIRMA_REPLAY_S3_BUCKET`.
 * Quando S3 esta ativo, o disco ainda e usado como spool de gravacao;
 * o S3 funciona como copia autoritativa e cold-storage. Na carga, se o
 * arquivo local nao existe, ele e baixado do S3.
 *
 * Por que manter spool local para S3:
 *   - S3 nao permite append; cada sync sobrescreve o objeto.
 *   - Fechar e reabrir o stream a cada sync perderia a referencia que
 *     `OfficeSession` guarda. O `RotatingWritable` esconde essa rotacao.
 */

import { createWriteStream, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import nodePath from 'node:path';
import { Writable } from 'node:stream';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { SessionLogHeader } from '@microfirma/contracts';
import { desserializarLinha } from '@microfirma/contracts';

export interface ReplayStorage {
  /** Lista todos os replays disponiveis (headers) para carregamento. */
  listar(): Promise<{ tenantId: string; header: SessionLogHeader }[]>;
  /** Abre um stream de escrita NDJSON para o tenant. */
  abrirEscrita(tenantId: string, _header?: SessionLogHeader): NodeJS.WritableStream;
  /** Abre um stream de leitura do replay finalizado (ou spool local). */
  abrirLeitura(tenantId: string): NodeJS.ReadableStream | undefined;
  /** Sincroniza o spool local com o backend (no-op para disco). */
  sync?(): Promise<void>;
}

/** Helper: nome do arquivo/spool para um tenant. */
function nomeArquivo(tenantId: string): string {
  return `${tenantId}.ndjson`;
}

/** Implementacao em disco - preserva o comportamento original. */
export class DiskReplayStorage implements ReplayStorage {
  protected readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  private caminho(tenantId: string): string {
    return nodePath.join(this.dir, nomeArquivo(tenantId));
  }

  async listar(): Promise<{ tenantId: string; header: SessionLogHeader }[]> {
    if (!existsSync(this.dir)) return [];
    const resultados: { tenantId: string; header: SessionLogHeader }[] = [];
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.ndjson')) continue;
      const full = nodePath.join(this.dir, f);
      const linhas = readFileSync(full, 'utf-8').split('\n');
      const primeira = linhas.find((l) => l.trim() !== '');
      if (!primeira) continue;
      const parsed = desserializarLinha(primeira);
      if (!parsed || parsed.kind !== 'header') continue;
      resultados.push({ tenantId: f.replace('.ndjson', ''), header: parsed.data });
    }
    return resultados;
  }

  abrirEscrita(tenantId: string, _header?: SessionLogHeader): NodeJS.WritableStream {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    return createWriteStream(this.caminho(tenantId), { flags: 'a' });
  }

  abrirLeitura(tenantId: string): NodeJS.ReadableStream | undefined {
    const p = this.caminho(tenantId);
    return existsSync(p) ? createReadStream(p) : undefined;
  }
}

/** Writable que rotaciona o arquivo local e dispara upload para o S3. */
class RotatingWritable extends Writable {
  private readonly path: string;
  private readonly onRotate: () => Promise<void>;
  private inner: ReturnType<typeof createWriteStream> | null = null;
  private locked = false;

  constructor(path: string, onRotate: () => Promise<void>) {
    super();
    this.path = path;
    this.onRotate = onRotate;
    this.abrir();
  }

  private abrir(): void {
    this.inner = createWriteStream(this.path, { flags: 'a' });
  }

  override _write(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (!this.inner) {
      callback(new Error('stream de replay fechado'));
      return;
    }
    this.inner.write(chunk as Parameters<typeof this.inner['write']>[0], callback);
  }

  async rotate(): Promise<void> {
    if (this.locked) return;
    this.locked = true;
    const velho = this.inner;
    this.inner = null;
    if (velho) {
      await new Promise<void>((resolve, reject) => {
        velho.end((err?: Error | null) => (err ? reject(err) : resolve()));
      });
    }
    await this.onRotate();
    this.locked = false;
    this.abrir();
  }
}

/** Armazenamento em S3 com spool local. */
export class S3ReplayStorage extends DiskReplayStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly syncMs: number;
  private readonly rotators = new Map<string, RotatingWritable>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(localDir: string, bucket: string, prefix: string, syncMs = 30000, endpoint?: string) {
    super(localDir);
    this.bucket = bucket;
    this.prefix = prefix.replace(/\/$/, '') + '/';
    this.syncMs = syncMs;
    this.client = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1', endpoint });
    this.timer = setInterval(() => this.sync(), this.syncMs);
  }

  private chaveS3(tenantId: string): string {
    return `${this.prefix}${nomeArquivo(tenantId)}`;
  }

  private rotator(tenantId: string): RotatingWritable {
    let r = this.rotators.get(tenantId);
    if (!r) {
      r = new RotatingWritable(nodePath.join(this.dir, nomeArquivo(tenantId)), async () => {
        const p = nodePath.join(this.dir, nomeArquivo(tenantId));
        if (!existsSync(p)) return;
        await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: this.chaveS3(tenantId),
            Body: createReadStream(p),
            ContentType: 'application/x-ndjson',
          }),
        );
      });
      this.rotators.set(tenantId, r);
    }
    return r;
  }

  override abrirEscrita(tenantId: string, _header?: SessionLogHeader): NodeJS.WritableStream {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    return this.rotator(tenantId);
  }

  override async listar(): Promise<{ tenantId: string; header: SessionLogHeader }[]> {
    const res = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: this.prefix }),
    );
    const chaves = (res.Contents ?? []).map((c) => c.Key).filter((k): k is string => !!k);
    const resultados: { tenantId: string; header: SessionLogHeader }[] = [];
    for (const key of chaves) {
      if (!key.endsWith('.ndjson')) continue;
      const tenantId = nodePath.basename(key, '.ndjson');
      // Baixa para spool local se nao existir, para poder ler offline.
      const local = nodePath.join(this.dir, nomeArquivo(tenantId));
      if (!existsSync(local)) {
        const get = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
        if (!get.Body) continue;
        const chunks: Uint8Array[] = [];
        for await (const chunk of get.Body as unknown as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
        const buf = Buffer.concat(chunks);
        if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
        const fs = await import('node:fs/promises');
        await fs.writeFile(local, buf);
      }
      const linhas = readFileSync(local, 'utf-8').split('\n');
      const primeira = linhas.find((l) => l.trim() !== '');
      if (!primeira) continue;
      const parsed = desserializarLinha(primeira);
      if (!parsed || parsed.kind !== 'header') continue;
      resultados.push({ tenantId, header: parsed.data });
    }
    return resultados;
  }

  async sync(): Promise<void> {
    for (const r of this.rotators.values()) {
      await r.rotate();
    }
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

/** Fabrica: escolhe a implementacao de acordo com as variaveis de ambiente. */
export function criarReplayStorage(): ReplayStorage | undefined {
  const replayDir = process.env.MICROFIRMA_REPLAY_DIR;
  if (!replayDir) return undefined;
  const s3Bucket = process.env.MICROFIRMA_REPLAY_S3_BUCKET;
  if (!s3Bucket) return new DiskReplayStorage(replayDir);
  const prefix = process.env.MICROFIRMA_REPLAY_S3_PREFIX ?? 'replays';
  const syncMs = Number(process.env.MICROFIRMA_REPLAY_SYNC_MS ?? 30000);
  const endpoint = process.env.AWS_ENDPOINT_URL_S3 ?? process.env.MICROFIRMA_S3_ENDPOINT;
  return new S3ReplayStorage(replayDir, s3Bucket, prefix, syncMs, endpoint);
}
