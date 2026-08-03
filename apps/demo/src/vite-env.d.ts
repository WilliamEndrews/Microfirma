/// <reference types="vite/client" />

/**
 * Variaveis de ambiente da demo. Declaradas explicitamente porque
 * `import.meta.env` sem tipo e um convite a erro de digitacao silencioso.
 */
interface ImportMetaEnv {
  /**
   * Endereco do servidor autoritativo (ex.: ws://localhost:8787/mundo).
   * Ausente = a demo simula no proprio navegador (Fase 0).
   */
  readonly VITE_MICROFIRMA_WS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
