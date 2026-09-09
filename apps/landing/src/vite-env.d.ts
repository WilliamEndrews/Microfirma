/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MICROFIRMA_API?: string;
  readonly VITE_MICROFIRMA_DEMO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
