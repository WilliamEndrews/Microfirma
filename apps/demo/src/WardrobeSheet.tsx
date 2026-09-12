/**
 * Sheet gamificado de customizacao Klimmos.
 * O canvas continua o RAF por baixo — so aplicamos blur CSS no palco.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BODY_MAX,
  BOTTOM_MAX,
  HAIR_MAX,
  LOOK_LIMITES,
  SHOES_MAX,
  TOP_MAX,
  aleatorizarSlot,
  lookAleatorio,
  type LookKlimmos,
  type SlotLook,
} from '@microfirma/iso-characters';

export type CategoriaWardrobe = SlotLook | 'nome';

const CATEGORIAS: { id: CategoriaWardrobe; icone: string; rotuloKey: string }[] = [
  { id: 'body', icone: '🧍', rotuloKey: 'wardrobe.cat.body' },
  { id: 'hair', icone: '💇', rotuloKey: 'wardrobe.cat.hair' },
  { id: 'top', icone: '👕', rotuloKey: 'wardrobe.cat.top' },
  { id: 'bottom', icone: '🩳', rotuloKey: 'wardrobe.cat.bottom' },
  { id: 'shoes', icone: '👟', rotuloKey: 'wardrobe.cat.shoes' },
  { id: 'nome', icone: '🏷️', rotuloKey: 'wardrobe.cat.nome' },
];

type Props = {
  agentId: string;
  nomeAtual: string;
  lookAtual: LookKlimmos;
  aberto: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onFechar: () => void;
  onAplicar: (nome: string, look: LookKlimmos) => void | Promise<void>;
};

export function WardrobeSheet({
  agentId,
  nomeAtual,
  lookAtual,
  aberto,
  t,
  onFechar,
  onAplicar,
}: Props) {
  const tituloId = useId();
  const painelRef = useRef<HTMLDivElement | null>(null);
  const [categoria, setCategoria] = useState<CategoriaWardrobe>('top');
  const [lookDraft, setLookDraft] = useState<LookKlimmos>(lookAtual);
  const [nomeDraft, setNomeDraft] = useState(nomeAtual);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setLookDraft(lookAtual);
    setNomeDraft(nomeAtual);
    setCategoria('top');
  }, [aberto, agentId, lookAtual, nomeAtual]);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', onKey);
    painelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [aberto, onFechar]);

  const maxDaCategoria = useMemo(() => {
    if (categoria === 'nome') return 0;
    return LOOK_LIMITES[categoria];
  }, [categoria]);

  if (!aberto) return null;

  const aplicar = async () => {
    const nome = nomeDraft.trim().slice(0, 24) || nomeAtual;
    setSalvando(true);
    try {
      await onAplicar(nome, lookDraft);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="wardrobe-root" role="presentation">
      <button type="button" className="wardrobe-scrim" aria-label={t('wardrobe.fechar')} onClick={onFechar} />
      <div
        ref={painelRef}
        className="wardrobe-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
      >
        <header className="wardrobe-header">
          <div>
            <p className="wardrobe-eyebrow">{t('wardrobe.eyebrow')}</p>
            <h2 id={tituloId}>{t('wardrobe.titulo', { nome: nomeDraft || nomeAtual })}</h2>
          </div>
          <button type="button" className="wardrobe-fechar" onClick={onFechar}>
            {t('wardrobe.fechar')}
          </button>
        </header>

        <div className="wardrobe-corpo">
          <div className="wardrobe-preview" aria-hidden="true">
            <LookPreview look={lookDraft} />
            <p className="wardrobe-preview-meta">
              {lookDraft.body}/{BODY_MAX} · {lookDraft.hair}/{HAIR_MAX} · {lookDraft.top}/{TOP_MAX} ·{' '}
              {lookDraft.bottom}/{BOTTOM_MAX} · {lookDraft.shoes}/{SHOES_MAX}
            </p>
          </div>

          <div className="wardrobe-controles">
            <div className="wardrobe-cats" role="tablist" aria-label={t('wardrobe.categorias')}>
              {CATEGORIAS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={categoria === c.id}
                  className={categoria === c.id ? 'ativo' : ''}
                  onClick={() => setCategoria(c.id)}
                  title={t(c.rotuloKey)}
                >
                  <span aria-hidden="true">{c.icone}</span>
                  <span>{t(c.rotuloKey)}</span>
                </button>
              ))}
            </div>

            {categoria === 'nome' ? (
              <label className="wardrobe-campo">
                {t('wardrobe.nomeLabel')}
                <input
                  type="text"
                  maxLength={24}
                  value={nomeDraft}
                  onChange={(e) => setNomeDraft(e.target.value)}
                  placeholder={nomeAtual}
                />
              </label>
            ) : (
              <div className="wardrobe-opcoes" role="listbox" aria-label={t(CATEGORIAS.find((c) => c.id === categoria)!.rotuloKey)}>
                {Array.from({ length: maxDaCategoria }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="option"
                    aria-selected={lookDraft[categoria] === n}
                    className={lookDraft[categoria] === n ? 'ativo' : ''}
                    onClick={() => setLookDraft({ ...lookDraft, [categoria]: n })}
                  >
                    {n}
                    <span className="wardrobe-opcao-meta">
                      {n}/{maxDaCategoria}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="wardrobe-acoes-rapidas">
              <button
                type="button"
                onClick={() =>
                  setLookDraft(
                    categoria === 'nome' ? lookAleatorio() : aleatorizarSlot(lookDraft, categoria as SlotLook),
                  )
                }
              >
                {t(categoria === 'nome' ? 'wardrobe.aleatorioTudo' : 'wardrobe.aleatorioSlot')}
              </button>
              <button type="button" onClick={() => setLookDraft(lookAleatorio())}>
                {t('wardrobe.aleatorioTudo')}
              </button>
            </div>
          </div>
        </div>

        <footer className="wardrobe-footer">
          <button type="button" className="secundario" onClick={onFechar} disabled={salvando}>
            {t('wardrobe.cancelar')}
          </button>
          <button type="button" className="primario" onClick={() => void aplicar()} disabled={salvando}>
            {salvando ? t('wardrobe.salvando') : t('wardrobe.aplicar')}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Preview estatico por indices — evita rebake async a cada clique no draft. */
function LookPreview({ look }: { look: LookKlimmos }) {
  return (
    <div
      className="wardrobe-avatar"
      style={{
        background: `linear-gradient(160deg, hsl(${look.body * 40} 35% 42%), hsl(${look.top * 18} 45% 55%) 55%, hsl(${look.shoes * 24} 30% 35%))`,
      }}
    >
      <div className="wardrobe-avatar-hair" style={{ opacity: 0.35 + look.hair / 20 }} />
      <div className="wardrobe-avatar-body" />
      <div className="wardrobe-avatar-top" style={{ filter: `hue-rotate(${look.top * 18}deg)` }} />
      <div className="wardrobe-avatar-bottom" style={{ filter: `hue-rotate(${look.bottom * 24}deg)` }} />
      <div className="wardrobe-avatar-shoes" style={{ filter: `hue-rotate(${look.shoes * 30}deg)` }} />
    </div>
  );
}
