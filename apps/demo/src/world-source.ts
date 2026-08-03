/**
 * FONTE DE MUNDO - de onde a interface recebe quadros.
 *
 * Esta abstracao existe para responder a uma pergunta do ADR-0006: "quando o
 * engine sair do navegador, quanto da interface muda?". A resposta correta e
 * "nada, exceto uma linha que escolhe a fonte". Este arquivo torna isso
 * verdade ao dar as duas implementacoes a MESMA forma:
 *
 *   - `criarFonteLocal`  - simula no navegador (Fase 0). Zero servidor.
 *   - `criarFonteRemota` - recebe do servidor autoritativo por WebSocket.
 *
 * `App.tsx` e o renderer nao sabem qual das duas esta em uso. Nenhum `if`
 * espalhado, nenhum tipo condicional: a diferenca fica confinada aqui.
 *
 * Nota sobre o modo local: ele NAO e codigo descartavel. Ele continua sendo o
 * caminho de demo offline (feira, avião, cliente sem rede) e a base dos testes
 * de regressao visual. Manter os dois vivos e o que garante que a fronteira
 * nao apodreca.
 */

import type {
  ClientCommand,
  DomainEvent,
  OfficeLayout,
  SessionWelcome,
  ServerMessage,
  WorldDelta,
  WorldSnapshot,
} from '@microfirma/contracts';
import {
  WorldEngine,
  planSpaceProgram,
  solveLayout,
  validarLayout,
  type Violacao,
} from '@microfirma/world-engine';
import { SyntheticStream, colaboracaoDoElenco } from '@microfirma/synthetic';

/** Passo de simulacao: 10 Hz. Mesmo valor no navegador e no servidor. */
export const PASSO_MS = 100;

export type EstadoConexao = 'local' | 'conectando' | 'conectado' | 'reconectando' | 'falhou';

export interface QuadroRecebido {
  quadro: WorldSnapshot | WorldDelta;
  /** Eventos de dominio correspondentes, quando a fonte os conhece.
   *  O servidor NAO envia eventos crus (privacidade + banda): o historico
   *  textual do painel remoto e derivado do proprio quadro. */
  eventos: DomainEvent[];
}

/**
 * Contrato unico que a interface consome. Note o que NAO esta aqui: nada de
 * `engine`, `stream`, `socket`. Se a interface precisasse de um desses, ela
 * estaria acoplada ao transporte.
 */
export interface WorldSource {
  /** Layout inicial - necessario para construir o renderer. */
  readonly layout: OfficeLayout;
  /**
   * Semente que a sessao esta usando de fato. No modo remoto ela e a do
   * SERVIDOR, que pode divergir da que o usuario digitou - e a interface
   * precisa saber disso para pedir `reseed` em vez de mentir.
   */
  readonly seedSessao: number;
  /** Violacoes de invariante do layout servido. Vazio e o unico valor bom. */
  readonly violacoes: Violacao[];
  /** Estado da conexao, para o painel poder ser honesto com o humano. */
  estado(): EstadoConexao;
  /** Assina o fluxo de quadros. Retorna funcao de cancelamento. */
  onQuadro(ouvinte: (q: QuadroRecebido) => void): () => void;
  /** Notifica mudanca de estado de conexao. Retorna funcao de cancelamento. */
  onEstado(ouvinte: (e: EstadoConexao) => void): () => void;
  /** Envia um comando (aprovacao, pausa, reseed). No local, aplica direto. */
  enviar(comando: ClientCommand): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Utilitario interno: lista de ouvintes com cancelamento
// ---------------------------------------------------------------------------

function criarEmissor<T>() {
  const ouvintes = new Set<(v: T) => void>();
  return {
    assinar(o: (v: T) => void): () => void {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
    emitir(v: T): void {
      for (const o of ouvintes) o(v);
    },
    limpar(): void {
      ouvintes.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// FONTE LOCAL - simulacao no navegador (Fase 0)
// ---------------------------------------------------------------------------

export function criarFonteLocal(seed: number): WorldSource {
  const stream = new SyntheticStream({ seed, comRoteiro: true });
  const programa = planSpaceProgram(stream.agents, {
    officeId: `office-${seed}`,
    seed,
    collaboration: colaboracaoDoElenco(),
  });
  const layout = solveLayout(programa);
  const violacoes = validarLayout(layout);
  const engine = new WorldEngine({ layout, agents: stream.agents, seed });

  const quadros = criarEmissor<QuadroRecebido>();
  const estados = criarEmissor<EstadoConexao>();
  let pausado = false;

  // Primeiro quadro imediato: a tela nao deve ficar vazia esperando o timer.
  const inicial = engine.snapshot();

  const timer = window.setInterval(() => {
    if (pausado) return;
    const eventos = stream.poll(PASSO_MS);
    engine.ingest(eventos);
    quadros.emitir({ quadro: engine.tick(PASSO_MS), eventos });
  }, PASSO_MS);

  return {
    layout,
    seedSessao: seed,
    violacoes,
    estado: () => 'local',
    onQuadro: (o) => {
      // Entrega o snapshot inicial a quem acabou de assinar, para que o
      // renderer tenha algo para desenhar antes do primeiro tick.
      o({ quadro: inicial, eventos: [] });
      return quadros.assinar(o);
    },
    onEstado: (o) => estados.assinar(o),
    enviar: (comando) => {
      switch (comando.type) {
        case 'resolve_approval':
          engine.resolverAprovacao(comando.agentId);
          return;
        case 'set_paused':
          pausado = comando.paused;
          return;
        case 'reseed':
          // No modo local quem troca a seed e o React (remontando a fonte
          // inteira). Aqui seria reconstruir tudo por baixo do renderer, que
          // ja tem o layout antigo em maos - pior dos dois mundos.
          return;
      }
    },
    destroy: () => {
      window.clearInterval(timer);
      quadros.limpar();
      estados.limpar();
    },
  };
}

// ---------------------------------------------------------------------------
// FONTE REMOTA - servidor autoritativo por WebSocket
// ---------------------------------------------------------------------------

/**
 * Conecta e devolve a fonte SO depois do handshake (welcome + primeiro
 * snapshot), porque o renderer precisa do layout para existir. Um erro aqui e
 * um erro de verdade: rejeitar a promise permite que a interface caia para a
 * fonte local com uma mensagem honesta, em vez de mostrar tela preta - que foi
 * exatamente o modo de falha que mais custou tempo neste projeto.
 */
export async function criarFonteRemota(url: string, timeoutMs = 5000): Promise<WorldSource> {
  const quadros = criarEmissor<QuadroRecebido>();
  const estados = criarEmissor<EstadoConexao>();

  let socket: WebSocket | null = null;
  let estadoAtual: EstadoConexao = 'conectando';
  let boasVindas: SessionWelcome | null = null;
  let ultimoSnapshot: WorldSnapshot | null = null;
  let vivo = true;
  let tentativas = 0;
  let timerReconexao = 0;

  const mudarEstado = (e: EstadoConexao): void => {
    if (estadoAtual === e) return;
    estadoAtual = e;
    estados.emitir(e);
  };

  const tratarMensagem = (bruto: string): void => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(bruto) as ServerMessage;
    } catch {
      console.warn('[fonte] mensagem do servidor nao e JSON valido');
      return;
    }

    switch (msg.kind) {
      case 'welcome':
        boasVindas = msg;
        return;
      case 'snapshot':
        ultimoSnapshot = msg;
        quadros.emitir({ quadro: msg, eventos: [] });
        return;
      case 'delta':
        quadros.emitir({ quadro: msg, eventos: [] });
        return;
      case 'failure':
        // Falha do servidor e informacao para o humano, nao para o console.
        console.error(`[fonte] servidor recusou: ${msg.code} - ${msg.message}`);
        return;
    }
  };

  /**
   * Reconexao com recuo exponencial limitado. O mundo continua vivendo no
   * servidor enquanto o cliente esta fora; ao voltar, o primeiro snapshot
   * ressincroniza tudo - nao existe estado local para conciliar, que e
   * precisamente o beneficio de ter o engine no servidor.
   *
   * Resolve com { welcome, snapshot } para que o compilador possa rastrear
   * os tipos atraves do `await` - atribuicoes dentro de callbacks de socket
   * sao invisiveis para a analise de fluxo do TS.
   */
  const conectar = (): Promise<{ welcome: SessionWelcome; snapshot: WorldSnapshot }> =>
    new Promise((resolver, rejeitar) => {
      const s = new WebSocket(url);
      socket = s;
      let resolvido = false;

      const expirar = window.setTimeout(() => {
        if (resolvido) return;
        resolvido = true;
        s.close();
        rejeitar(new Error(`tempo esgotado ao conectar em ${url}`));
      }, timeoutMs);

      s.onmessage = (ev) => {
        tratarMensagem(String(ev.data));
        // Resolve no primeiro snapshot: e o momento em que ha layout para
        // desenhar. Antes disso a fonte nao serve para nada.
        if (!resolvido && boasVindas && ultimoSnapshot) {
          resolvido = true;
          window.clearTimeout(expirar);
          tentativas = 0;
          mudarEstado('conectado');
          resolver({ welcome: boasVindas, snapshot: ultimoSnapshot });
        }
      };

      s.onerror = () => {
        if (resolvido) return;
        resolvido = true;
        window.clearTimeout(expirar);
        rejeitar(new Error(`falha ao conectar em ${url}`));
      };

      s.onclose = () => {
        window.clearTimeout(expirar);
        if (!vivo) return;
        if (!resolvido) {
          resolvido = true;
          rejeitar(new Error(`conexao fechada antes do handshake (${url})`));
          return;
        }
        // Ja estivemos conectados: tenta voltar.
        mudarEstado('reconectando');
        const espera = Math.min(10_000, 500 * 2 ** tentativas++);
        timerReconexao = window.setTimeout(() => {
          if (!vivo) return;
          void conectar().catch(() => {
            if (tentativas > 6) mudarEstado('falhou');
          });
        }, espera);
      };
    });

  const handshake = await conectar();

  const layout = handshake.snapshot.layout;
  // O servidor ja valida o layout antes de servir (e se recusa a subir com um
  // invalido). Revalidar aqui e barato e protege contra versao divergente.
  const violacoes = validarLayout(layout);

  console.log(
    `[fonte] conectado a ${url} - sessao ${handshake.welcome.sessionId}, ` +
      `seed ${handshake.welcome.seed}, protocolo ${handshake.welcome.protocolVersion}`,
  );

  const snapshotInicial = handshake.snapshot;
  const bemVindo = handshake.welcome;

  return {
    layout,
    seedSessao: bemVindo.seed,
    violacoes,
    estado: () => estadoAtual,
    onQuadro: (o) => {
      o({ quadro: snapshotInicial, eventos: [] });
      return quadros.assinar(o);
    },
    onEstado: (o) => estados.assinar(o),
    enviar: (comando) => {
      if (socket?.readyState !== WebSocket.OPEN) {
        console.warn('[fonte] comando descartado: socket fechado', comando.type);
        return;
      }
      socket.send(JSON.stringify(comando));
    },
    destroy: () => {
      vivo = false;
      window.clearTimeout(timerReconexao);
      quadros.limpar();
      estados.limpar();
      socket?.close();
      socket = null;
    },
  };
}
