/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Basis-URL van de Worker-API (geen trailing slash). Zie .env / Cloudflare Pages. */
  readonly VITE_API_ORIGIN?: string;
}
