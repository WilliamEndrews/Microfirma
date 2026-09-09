/**
 * Debugpreview — bancada isolada para colar temas do lab no blueprint.
 */

import { useRef, useState, type FormEvent } from 'react';
import { PreviewStage } from './PreviewStage';
import {
  assinaturaAgencia,
  montarAgenciaGeracao,
  type AgenciaMontada,
} from './montar-agencia';
import { saltAleatorio, type PedidoGeracao } from './selecionar-pedido';
import type { Historia } from './tarefa-especial/historias';
import { sortearHistoria } from './tarefa-especial/sortear';

const HISTORICO_MAX = 8;
const TENTATIVAS_MAX = 12;

export default function App() {
  const [salas, setSalas] = useState(1);
  const [agencia, setAgencia] = useState<AgenciaMontada | null>(null);
  const [vazioSemTemas, setVazioSemTemas] = useState(false);
  const [geracao, setGeracao] = useState(0);
  const [tarefaEspecial, setTarefaEspecial] = useState<Historia | null>(null);
  const historicoRef = useRef<string[]>([]);

  function gerarAgencia(pedido: PedidoGeracao, proxima: number): AgenciaMontada | null {
    let escolhida: AgenciaMontada | null = null;
    for (let t = 0; t < TENTATIVAS_MAX; t++) {
      const salt = saltAleatorio();
      const candidata = montarAgenciaGeracao(pedido, proxima, salt);
      if (!candidata) {
        escolhida = null;
        break;
      }
      if (candidata.slots.length === 0) {
        escolhida = candidata;
        break;
      }
      const sig = assinaturaAgencia(candidata);
      if (!historicoRef.current.includes(sig) || t === TENTATIVAS_MAX - 1) {
        escolhida = candidata;
        historicoRef.current = [sig, ...historicoRef.current].slice(0, HISTORICO_MAX);
        break;
      }
    }
    return escolhida;
  }

  function onGerar(ev: FormEvent) {
    ev.preventDefault();
    const pedido: PedidoGeracao = {
      salas: Math.max(1, Math.floor(Number(salas)) || 1),
    };
    setSalas(pedido.salas);
    setTarefaEspecial(null);

    const proxima = geracao + 1;
    setGeracao(proxima);

    const escolhida = gerarAgencia(pedido, proxima);
    setAgencia(escolhida);
    setVazioSemTemas(escolhida !== null && escolhida.slots.length === 0);
  }

  function onTarefaEspecial() {
    const pedido: PedidoGeracao = { salas: 3 };
    setSalas(3);
    const proxima = geracao + 1;
    setGeracao(proxima);

    const salt = saltAleatorio();
    const historia = sortearHistoria(salt);
    const escolhida = gerarAgencia(pedido, proxima);
    setTarefaEspecial(historia);
    setAgencia(escolhida);
    setVazioSemTemas(escolhida !== null && escolhida.slots.length === 0);
  }

  function onResetar() {
    setSalas(1);
    setAgencia(null);
    setVazioSemTemas(false);
    setGeracao(0);
    setTarefaEspecial(null);
    historicoRef.current = [];
  }

  return (
    <div className="shell">
      <header className="chrome">
        <div className="chrome-brand">
          <h1 className="brand">Debugpreview</h1>
          <p className="tagline">bancada de tilesets</p>
        </div>

        <form className="dash" onSubmit={onGerar} aria-label="Pedido de geracao">
          <label className="dash-field">
            <span className="dash-q">Quantas salas (escritorios)?</span>
            <input
              className="dash-input"
              type="number"
              name="salas"
              min={1}
              step={1}
              value={salas}
              onChange={(e) => setSalas(Number(e.target.value))}
            />
          </label>
          <p className="dash-hint" title="Leis fixas da agencia">
            1 Boss Room + 1 copa obrigatorias
          </p>
          <button className="dash-gerar" type="submit">
            Gerar
          </button>
          <button
            className="dash-tarefa"
            type="button"
            onClick={onTarefaEspecial}
            title="Sorteia uma historia colaborativa com 3 agentes"
          >
            Tarefa especial
          </button>
          <button className="dash-reset" type="button" onClick={onResetar}>
            Resetar
          </button>
        </form>
      </header>
      <main className="stage-wrap">
        <PreviewStage
          agencia={agencia}
          vazioSemTemas={vazioSemTemas}
          tarefaEspecial={tarefaEspecial}
        />
      </main>
    </div>
  );
}
