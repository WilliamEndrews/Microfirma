/**
 * Debugpreview — bancada isolada para colar temas do lab no blueprint.
 */

import { useState, type FormEvent } from 'react';
import { PreviewStage } from './PreviewStage';
import { montarAgencia, type AgenciaMontada } from './montar-agencia';
import type { PedidoGeracao } from './selecionar-pedido';

export default function App() {
  const [salas, setSalas] = useState(1);
  const [copas, setCopas] = useState(0);
  const [agencia, setAgencia] = useState<AgenciaMontada | null>(null);
  const [vazioSemTemas, setVazioSemTemas] = useState(false);

  function onGerar(ev: FormEvent) {
    ev.preventDefault();
    const pedido: PedidoGeracao = {
      salas: Math.max(0, Math.floor(Number(salas)) || 0),
      copas: Math.max(0, Math.floor(Number(copas)) || 0),
    };
    const montada = montarAgencia(pedido);
    setAgencia(montada);
    setVazioSemTemas(montada !== null && montada.slots.length === 0);
  }

  function onResetar() {
    setSalas(1);
    setCopas(0);
    setAgencia(null);
    setVazioSemTemas(false);
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
              min={0}
              step={1}
              value={salas}
              onChange={(e) => setSalas(Number(e.target.value))}
            />
          </label>
          <label className="dash-field">
            <span className="dash-q">Quantas copas?</span>
            <input
              className="dash-input"
              type="number"
              name="copas"
              min={0}
              step={1}
              value={copas}
              onChange={(e) => setCopas(Number(e.target.value))}
            />
          </label>
          <button className="dash-gerar" type="submit">
            Gerar
          </button>
          <button className="dash-reset" type="button" onClick={onResetar}>
            Resetar
          </button>
        </form>
      </header>
      <main className="stage-wrap">
        <PreviewStage agencia={agencia} vazioSemTemas={vazioSemTemas} />
      </main>
    </div>
  );
}
