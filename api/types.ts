export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: unknown }>;
  run(): Promise<{ success: boolean; meta: unknown }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<{ results: T[]; success: boolean; meta: unknown }[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export interface R2ObjectBody {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  writeHttpMetadata(headers: Headers): void;
}

export interface R2Bucket {
  put(key: string, value: ReadableStream | ArrayBuffer | string | Blob, options?: Record<string, unknown>): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ objects: Array<{ key: string; size: number }> }>;
}

export interface AiProvider {
  run(model: string, inputs: unknown): Promise<unknown>;
}

export interface AppEnv {
  DB: D1Database;
  JWT_SECRET: string;
  AI: AiProvider;
  FILES: R2Bucket;
  ALLOW_REGISTRATION?: string;
  CORS_ORIGIN?: string;
  CLIENT_IP?: string;
}
