/**
 * FASE 0 - DEMONSTRACAO SINTETICA
 *
 * Esta tela existe para matar o maior risco do projeto (percepcao de brinquedo)
 * em semanas, e nao em meses. Ela usa a arquitetura DEFINITIVA:
 *
 *   telemetria -> eventos de dominio -> Narrative Scheduler -> World Engine -> render
 *
 * A unica peca provisoria e a origem da telemetria (gerador sintetico em vez de
 * OTLP). Quando o ingest real entrar, este arquivo praticamente nao muda - e
 * essa e a prova de que as fronteiras estao nos lugares certos.
 *
 * O painel lateral nao e decoracao: ele e o caminho ACESSIVEL para toda
 * informacao que o canvas comunica visualmente (ADR-0009). Nada no mundo 2.5D
 * e exclusivo do canvas.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ActorState, DomainEvent, WorldKpis } from '@microfirma/contracts';
import { validarLayout, type Violacao } from '@microfirma/world-engine';
import { criarRenderer, type RendererHandle } from './office-renderer-2d';
import {
  criarFonteLocal,
  criarFonteRemota,
  type EstadoConexao,
  type WorldSource,
} from './world-source';
import { useI18n } from './use-i18n';
import { IDIOMAS, ROTULO_IDIOMA, type Idioma } from './i18n';
import { simular, type SimularResult } from './api';

/**
 * Endereco do servidor autoritativo. Ausente = simula no navegador.
 * Essa e a UNICA linha desta tela que sabe da existencia de um servidor
 * (ADR-0006): o resto do arquivo consome `WorldSource` e nao faz ideia se o
 * mundo veio de um socket ou de um `setInterval` ao lado.
 */
const URL_SERVIDOR = import.meta.env.VITE_MICROFIRMA_WS as string | undefined;

const CHAVE_CONEXAO: Record<EstadoConexao, string> = {
  local: 'conexao.local',
  conectando: 'conexao.conectando',
  conectado: 'conexao.conectado',
  reconectando: 'conexao.reconectando',
  falhou: 'conexao.falhou',
};

interface EstadoPainel {
  kpis: WorldKpis;
  atores: ActorState[];
  historico: string[];
  tickAtual: number;
}

const CHAVE_ATIVIDADE: Record<ActorState['activity'], string> = {
  idle: 'atividade.idle',
  walking: 'atividade.walking',
  working: 'atividade.working',
  resting: 'atividade.resting',
  waiting_approval: 'atividade.waiting_approval',
  blocked: 'atividade.blocked',
  sweeping: 'atividade.sweeping',
  repairing: 'atividade.repairing',
  talking: 'atividade.talking',
};

export default function App() {
  const { t, idioma, setIdioma } = useI18n();

  useEffect(() => {
    document.documentElement.lang = idioma === 'pseudo' ? 'qps-ploc' : idioma;
  }, [idioma]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<RendererHandle | null>(null);
  const fonteRef = useRef<WorldSource | null>(null);

  const [seed, setSeed] = useState(20260802);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [painel, setPainel] = useState<EstadoPainel | null>(null);
  const [violacoes, setViolacoes] = useState<Violacao[]>([]);
  const [pausado, setPausado] = useState(false);
  const [conexao, setConexao] = useState<EstadoConexao>(URL_SERVIDOR ? 'conectando' : 'local');
  const [avisoFonte, setAvisoFonte] = useState<string | null>(null);

  const [simDuracao, setSimDuracao] = useState(5000);
  const [simCarga, setSimCarga] = useState(1);
  const [simToken, setSimToken] = useState(import.meta.env.VITE_MICROFIRMA_TOKEN as string | undefined ?? '');
  const [simResultado, setSimResultado] = useState<SimularResult | null>(null);
  const [simCarregando, setSimCarregando] = useState(false);
  const [simErro, setSimErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let handle: RendererHandle | null = null;
    let fonte: WorldSource | null = null;
    let cancelarQuadros: () => void = () => {};
    let cancelarEstado: () => void = () => {};

    void (async () => {
      // ---- escolha da fonte de mundo ----
      // Remota quando configurada; local caso contrario. Se o servidor estiver
      // fora do ar, cai para local COM AVISO VISIVEL - degradar em silencio
      // seria mentir para quem esta olhando a tela.
      let criada: WorldSource;
      if (URL_SERVIDOR) {
        try {
          criada = await criarFonteRemota(URL_SERVIDOR);
          setAvisoFonte(null);
        } catch (erro) {
          console.warn('[app] servidor indisponivel, caindo para simulacao local:', erro);
          setAvisoFonte(
            t('app.servidorIndisponivel', { url: URL_SERVIDOR }),
          );
          criada = criarFonteLocal(seed);
        }
      } else {
        criada = criarFonteLocal(seed);
      }

      if (!vivo) {
        criada.destroy();
        return;
      }
      fonte = criada;
      fonteRef.current = criada;
      setViolacoes(criada.violacoes);
      setConexao(criada.estado());
      cancelarEstado = criada.onEstado(setConexao);

      // A sessao remota pode estar servindo outra semente (ela e compartilhada
      // e vive independentemente deste navegador). Pedir `reseed` e a forma
      // honesta de alinhar: o servidor e a autoridade, nao a tela.
      if (URL_SERVIDOR && criada.seedSessao !== seed) {
        criada.enviar({ type: 'reseed', seed });
      }

      // ---- renderer, construido com o layout que a fonte entregou ----
      if (!canvasRef.current) return;
      handle = await criarRenderer(canvasRef.current, criada.layout);
      if (!vivo) {
        handle.destroy();
        return;
      }
      rendererRef.current = handle;
      let officeIdAtual = criada.layout.officeId;

      // ---- consumo de quadros ----
      const historico: string[] = [];
      let contador = 0;
      cancelarQuadros = criada.onQuadro(({ quadro, eventos }) => {
        // Planta trocada no servidor (reseed): o renderer tem a camada estatica
        // do escritorio ANTIGO em cache. Reconstruir e obrigatorio - desenhar
        // atores de uma planta sobre o piso de outra e o tipo de inconsistencia
        // que faz o usuario duvidar de tudo que a tela mostra.
        if (quadro.kind === 'snapshot' && quadro.layout.officeId !== officeIdAtual) {
          officeIdAtual = quadro.layout.officeId;
          const anterior = rendererRef.current;
          rendererRef.current = null;
          anterior?.destroy();
          setViolacoes(validarLayout(quadro.layout));
          void (async () => {
            if (!vivo || !canvasRef.current) return;
            const novo = await criarRenderer(canvasRef.current, quadro.layout);
            if (!vivo) {
              novo.destroy();
              return;
            }
            handle = novo;
            rendererRef.current = novo;
            novo.select(selecionadoRef.current);
            novo.push(quadro);
          })();
          return;
        }

        rendererRef.current?.push(quadro);

        // Fonte local conhece os eventos crus. A remota nao os recebe (o
        // servidor nao trafega evento de dominio por padrao - privacidade,
        // ADR-0007, e banda), entao o historico vem do `chatter` do quadro,
        // que ja e derivado de fato. Ver roadmap 1.2: um canal dedicado de
        // feed de eventos e trabalho separado.
        for (const e of eventos) {
          if (e.type === 'llm.completed' || e.type === 'tool.called') continue; // ruido de alta frequencia
          historico.unshift(descreverEvento(e, t));
        }
        if (eventos.length === 0 && quadro.kind === 'delta') {
          for (const c of quadro.chatter) historico.unshift(`${nomeCurto(c.agentId)}: ${c.text}`);
        }
        if (historico.length > 60) historico.length = 60;

        // O painel React atualiza a ~3 Hz. O canvas roda a 60 fps.
        // Separar as duas frequencias e o que evita re-render em cascata.
        if (++contador % 3 === 0) {
          setPainel({
            kpis: quadro.kpis,
            atores: quadro.actors,
            historico: [...historico.slice(0, 14)],
            tickAtual: quadro.tick,
          });
        }
      });
    })();

    return () => {
      vivo = false;
      cancelarQuadros();
      cancelarEstado();
      handle?.destroy();
      fonte?.destroy();
      rendererRef.current = null;
      fonteRef.current = null;
    };
  }, [seed]);

  // O renderer pode ser reconstruido a qualquer momento (reseed no servidor).
  // A selecao precisa sobreviver a isso, entao ela vive tambem num ref.
  const selecionadoRef = useRef<string | null>(null);
  selecionadoRef.current = selecionado;

  useEffect(() => {
    rendererRef.current?.select(selecionado);
    rendererRef.current?.focusAgent(selecionado);
  }, [selecionado]);

  const aprovacoes = useMemo(
    () => (painel?.atores ?? []).filter((a) => a.activity === 'waiting_approval'),
    [painel],
  );

  const clientes = (painel?.atores ?? []).filter((a) => !a.isInternal);
  const internos = (painel?.atores ?? []).filter((a) => a.isInternal);
  const custo = painel?.kpis.costUsdToday ?? 0;
  const orcamento = painel?.kpis.budgetUsdToday ?? 1;
  const percentualOrcamento = Math.min(100, (custo / orcamento) * 100);

  return (
    <div className="app">
      <aside className="painel">
        <header className="marca">
          <h1>{t('app.titulo')}</h1>
          <p>{t('app.subtitulo')}</p>
          <p className={`fonte fonte-${conexao}`}>
            {t('app.fonteMundo')}: <strong>{t(CHAVE_CONEXAO[conexao])}</strong>
          </p>
          {avisoFonte && <p className="erro">{avisoFonte}</p>}
          <div className="seletor-idioma">
            <label htmlFor="sel-idioma">{t('i18ma.seletor')}</label>
            <select
              id="sel-idioma"
              value={idioma}
              onChange={(e) => setIdioma(e.target.value as Idioma)}
            >
              {IDIOMAS.map((id) => (
                <option key={id} value={id}>{ROTULO_IDIOMA[id]}</option>
              ))}
            </select>
          </div>
        </header>

        <section aria-label="Indicadores">
          <div className="kpis">
            <Kpi rotulo={t('kpi.execucoesAtivas')} valor={String(painel?.kpis.activeRuns ?? 0)} />
            <Kpi rotulo={t('kpi.erros5min')} valor={String(painel?.kpis.errorsLast5Min ?? 0)} alerta={(painel?.kpis.errorsLast5Min ?? 0) > 4} />
            <Kpi rotulo={t('kpi.tokensMin')} valor={formatarNumero(painel?.kpis.tokensPerMinute ?? 0)} />
            <Kpi rotulo={t('kpi.aprovacoes')} valor={String(painel?.kpis.pendingApprovals ?? 0)} alerta={(painel?.kpis.pendingApprovals ?? 0) > 0} />
          </div>

          <div className="orcamento">
            <div className="orcamento-cabecalho">
              <span>{t('orcamento.custoDia')}</span>
              <strong>
                US$ {custo.toFixed(2)} / {orcamento.toFixed(2)}
              </strong>
            </div>
            <div className="barra" role="progressbar" aria-valuenow={Math.round(percentualOrcamento)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${percentualOrcamento}%`, background: percentualOrcamento > 85 ? '#d94f4f' : '#3f8f52' }} />
            </div>
            <p className="nota">
              {t('orcamento.nota')}
            </p>
          </div>
        </section>

        {aprovacoes.length > 0 && (
          <section className="aprovacoes" aria-label="Aprovacoes pendentes">
            <h2>{t('aprovacao.titulo')}</h2>
            {aprovacoes.map((a) => (
              <div key={a.agentId} className="aprovacao">
                <span>{t('aprovacao.bloqueado', { nome: nomeCurto(a.agentId) })}</span>
                <button
                  type="button"
                  onClick={() =>
                    fonteRef.current?.enviar({ type: 'resolve_approval', agentId: a.agentId })
                  }
                >
                  {t('aprovacao.liberar')}
                </button>
              </div>
            ))}
          </section>
        )}

        <section aria-label="Agentes do cliente">
          <h2>{t('agentes.titulo')} ({clientes.length})</h2>
          <ul className="lista">
            {clientes.map((a) => (
              <li key={a.agentId}>
                <button
                  type="button"
                  className={selecionado === a.agentId ? 'ativo' : ''}
                  aria-pressed={selecionado === a.agentId}
                  onClick={() => setSelecionado(selecionado === a.agentId ? null : a.agentId)}
                >
                  <span className={`ponto saude-${a.health}`} aria-hidden="true" />
                  <span className="nome">{nomeCurto(a.agentId)}</span>
                  <span className="atividade">{t(CHAVE_ATIVIDADE[a.activity])}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Equipe MicroFirma">
          <h2>{t('agentes.internaTitulo')}</h2>
          <ul className="lista compacta">
            {internos.map((a) => (
              <li key={a.agentId}>
                <span className="nome">{nomeCurto(a.agentId)}</span>
                <span className="atividade">{t(CHAVE_ATIVIDADE[a.activity])}</span>
              </li>
            ))}
          </ul>
          <p className="nota">
            {t('agentes.notaInterna')}
          </p>
        </section>

        <section aria-label="Fatos recentes">
          <h2>{t('fatos.titulo')}</h2>
          <ol className="ticker">
            {(painel?.historico ?? []).map((linha, i) => (
              <li key={`${linha}-${i}`}>{linha}</li>
            ))}
          </ol>
          <p className="nota">
            {t('fatos.nota')}
          </p>
        </section>

        <section aria-label="Controles">
          <h2>{t('controles.titulo')}</h2>
          <div className="controles">
            <button
              type="button"
              onClick={() => {
                const proximo = !pausado;
                setPausado(proximo);
                fonteRef.current?.enviar({ type: 'set_paused', paused: proximo });
              }}
            >
              {pausado ? t('controles.retomar') : t('controles.pausar')}
            </button>
            <button type="button" onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}>
              {t('controles.novoEscritorio')}
            </button>
          </div>
          <label className="campo">
            {t('controles.semente')}
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 0)}
            />
          </label>
          <p className="nota">
            {t('controles.notaSemente')}
          </p>
          {violacoes.length > 0 ? (
            <p className="erro">
              {t('controles.violacoes', { n: violacoes.length })}{' '}
              {violacoes.map((v) => v.regra).join(', ')}
            </p>
          ) : (
            <p className="ok">{t('controles.layoutValido')}</p>
          )}
        </section>

        <section aria-label="SimFirma" className="simfirma">
          <h2>{t('simfirma.titulo')}</h2>
          {!URL_SERVIDOR || !fonteRef.current?.tenantId ? (
            <p className="nota">{t('simfirma.requerRemoto')}</p>
          ) : (
            <>
              <label className="campo">
                {t('simfirma.duracao')}
                <input
                  type="number"
                  min={1000}
                  max={60000}
                  value={simDuracao}
                  onChange={(e) => setSimDuracao(Number(e.target.value) || 0)}
                />
              </label>
              <label className="campo">
                {t('simfirma.carga')}
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={simCarga}
                  onChange={(e) => setSimCarga(Number(e.target.value) || 1)}
                />
              </label>
              <label className="campo">
                {t('simfirma.token')}
                <input
                  type="password"
                  value={simToken}
                  onChange={(e) => setSimToken(e.target.value)}
                  placeholder="eyJ..."
                />
              </label>
              <button
                type="button"
                className="simfirma-rodar"
                disabled={simCarregando || !simToken}
                onClick={async () => {
                  const tenantId = fonteRef.current?.tenantId;
                  if (!URL_SERVIDOR || !tenantId) return;
                  setSimCarregando(true);
                  setSimErro(null);
                  setSimResultado(null);
                  try {
                    const r = await simular(URL_SERVIDOR, tenantId, simToken, simDuracao, simCarga);
                    if (r) setSimResultado(r);
                  } catch (err) {
                    setSimErro(err instanceof Error ? err.message : 'erro desconhecido');
                  } finally {
                    setSimCarregando(false);
                  }
                }}
              >
                {simCarregando ? t('simfirma.rodando') : t('simfirma.rodar')}
              </button>
              {simErro && <p className="erro">{simErro}</p>}
              {simResultado && (
                <div className="simfirma-resultado">
                  <p>
                    {simResultado.ticks} {t('simfirma.ticks')} / {simResultado.tMundoMs}ms {t('simfirma.tMundo')}
                  </p>
                  <div className="kpis simfirma-kpis">
                    <Kpi rotulo={t('kpi.execucoesAtivas')} valor={String(simResultado.kpis.activeRuns)} />
                    <Kpi rotulo={t('kpi.erros5min')} valor={String(simResultado.kpis.errorsLast5Min)} />
                    <Kpi rotulo={t('kpi.tokensMin')} valor={formatarNumero(simResultado.kpis.tokensPerMinute)} />
                    <Kpi rotulo={t('kpi.aprovacoes')} valor={String(simResultado.kpis.pendingApprovals)} />
                  </div>
                  <p className="nota">
                    US$ {simResultado.kpis.costUsdToday.toFixed(2)} / {simResultado.kpis.budgetUsdToday.toFixed(2)}
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </aside>

      <main className="palco">
        <canvas ref={canvasRef} aria-label={t('canvas.ariaLabel')} role="img" />
        <div className="controles-camera">
          <button onClick={() => rendererRef.current?.resetCamera()} title={t('camera.reset')}>
            {t('camera.reset')}
          </button>
          <span className="dica-camera">{t('camera.dica')}</span>
        </div>
        <div className="legenda">
          <span><i className="l-fila" /> {t('legenda.fila')}</span>
          <span><i className="l-calor" /> {t('legenda.calor')}</span>
          <span><i className="l-luz" /> {t('legenda.luz')}</span>
          <span><i className="l-lixo" /> {t('legenda.lixo')}</span>
        </div>
      </main>
    </div>
  );
}

function Kpi({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className={`kpi${alerta ? ' alerta' : ''}`}>
      <span>{rotulo}</span>
      <strong>{valor}</strong>
    </div>
  );
}

/** Descricao humana e factual de um evento. Sem adjetivos, sem invencao. */
function descreverEvento(
  e: DomainEvent,
  t: (chave: string, vars?: Record<string, string | number>) => string,
): string {
  switch (e.type) {
    case 'agent.discovered':
      return t('evento.discovered', { nome: e.agent.displayName, framework: e.agent.framework });
    case 'run.started':
      return t('evento.runStarted', { nome: nomeCurto(e.agentId), label: e.label ?? t('evento.execucao') });
    case 'run.finished':
      return t('evento.runFinished', { nome: nomeCurto(e.agentId), duracao: (e.durationMs / 1000).toFixed(1), status: e.status });
    case 'error.raised':
      return t('evento.errorRaised', { nome: nomeCurto(e.agentId), kind: e.kind, severity: e.severity });
    case 'approval.requested':
      return t('evento.approvalRequested', { nome: nomeCurto(e.agentId) });
    case 'queue.observed':
      return t('evento.queueObserved', { nome: nomeCurto(e.agentId), depth: e.depth });
    default:
      return e.type;
  }
}

function nomeCurto(agentId: string): string {
  const bruto = agentId.replace(/^agent-/, '').replace(/^microfirma-/, '');
  return bruto.charAt(0).toUpperCase() + bruto.slice(1);
}

function formatarNumero(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}
