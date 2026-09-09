import { useState, type FormEvent } from 'react';
import {
  conectarCodigo,
  onboardEmpresa,
  snippetOtlp,
  urlDemoComToken,
  type RespostaPonte,
} from './api';

export type FaseOnboarding = 'escolher' | 'nova' | 'codigo' | 'ponte';

type Props = {
  fase: FaseOnboarding;
  sessao: RespostaPonte | null;
  onFase: (fase: FaseOnboarding) => void;
  onSessao: (s: RespostaPonte) => void;
};

export default function Onboarding({ fase, sessao, onFase, onSessao }: Props) {
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  async function copiar(rotulo: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(rotulo);
      window.setTimeout(() => setCopiado(null), 1600);
    } catch {
      setErro('nao foi possivel copiar');
    }
  }

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await onboardEmpresa(nome);
      onSessao(r);
      onFase('ponte');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'falha ao criar');
    } finally {
      setEnviando(false);
    }
  }

  async function conectar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await conectarCodigo(codigo);
      onSessao(r);
      onFase('ponte');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'codigo nao encontrado');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="onboard" role="dialog" aria-labelledby="onboard-titulo">
      {fase === 'escolher' && (
        <>
          <h2 id="onboard-titulo">Entrar no escritorio</h2>
          <p className="onboard-lead">
            Identifique a empresa ou cole o codigo. A telemetria so entra depois
            desta ponte.
          </p>
          <div className="onboard-portas">
            <button type="button" className="onboard-btn" onClick={() => onFase('nova')}>
              Nova empresa
            </button>
            <button type="button" className="onboard-btn onboard-btn--ghost" onClick={() => onFase('codigo')}>
              Ja tenho codigo
            </button>
          </div>
        </>
      )}

      {fase === 'nova' && (
        <form onSubmit={criar}>
          <h2 id="onboard-titulo">Nova empresa</h2>
          <p className="onboard-lead">Um nome. O servidor gera o codigo e a sessao.</p>
          <label className="onboard-label" htmlFor="empresa">
            Nome da empresa
          </label>
          <input
            id="empresa"
            className="onboard-input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoFocus
            required
            minLength={1}
            placeholder="Acme"
          />
          {erro && <p className="onboard-erro">{erro}</p>}
          <div className="onboard-acoes">
            <button type="button" className="onboard-btn onboard-btn--ghost" onClick={() => onFase('escolher')}>
              voltar
            </button>
            <button type="submit" className="onboard-btn" disabled={enviando}>
              {enviando ? 'criando…' : 'criar escritorio'}
            </button>
          </div>
        </form>
      )}

      {fase === 'codigo' && (
        <form onSubmit={conectar}>
          <h2 id="onboard-titulo">Ja tenho codigo</h2>
          <p className="onboard-lead">O codigo e o tenantId — o mesmo de x-tenant-id no OTLP.</p>
          <label className="onboard-label" htmlFor="codigo">
            Codigo
          </label>
          <input
            id="codigo"
            className="onboard-input"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            autoFocus
            required
            placeholder="tenantId"
            autoComplete="off"
          />
          {erro && <p className="onboard-erro">{erro}</p>}
          <div className="onboard-acoes">
            <button type="button" className="onboard-btn onboard-btn--ghost" onClick={() => onFase('escolher')}>
              voltar
            </button>
            <button type="submit" className="onboard-btn" disabled={enviando}>
              {enviando ? 'conectando…' : 'conectar'}
            </button>
          </div>
        </form>
      )}

      {fase === 'ponte' && sessao && (
        <>
          <h2 id="onboard-titulo">Ponte pronta</h2>
          <p className="onboard-lead">
            Escritorio de <strong>{sessao.tenant.displayName}</strong> no ar.
            Telemetria so aparece quando o cliente enviar spans.
          </p>
          <dl className="onboard-dl">
            <div>
              <dt>Codigo</dt>
              <dd>
                <code>{sessao.tenant.tenantId}</code>
                <button
                  type="button"
                  className="onboard-copy"
                  onClick={() => void copiar('codigo', sessao.tenant.tenantId)}
                >
                  {copiado === 'codigo' ? 'copiado' : 'copiar'}
                </button>
              </dd>
            </div>
            <div>
              <dt>OTLP</dt>
              <dd>
                <pre>{snippetOtlp(sessao.tenant.tenantId)}</pre>
                <button
                  type="button"
                  className="onboard-copy"
                  onClick={() => void copiar('otlp', snippetOtlp(sessao.tenant.tenantId))}
                >
                  {copiado === 'otlp' ? 'copiado' : 'copiar'}
                </button>
              </dd>
            </div>
          </dl>
          {erro && <p className="onboard-erro">{erro}</p>}
          <a className="onboard-btn onboard-btn--link" href={urlDemoComToken(sessao.token)}>
            entrar no escritorio
          </a>
        </>
      )}
    </div>
  );
}
