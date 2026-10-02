/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API server (no trailing slash). Configure via .env or VITE_API_ORIGIN. */
  readonly VITE_API_ORIGIN?: string;
}
