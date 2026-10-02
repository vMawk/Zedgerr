import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from "fs";
import { join, dirname, resolve, sep } from "path";

interface R2PutOptions {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

interface R2Object {
  key: string;
  size: number;
  httpMetadata: { contentType?: string };
  customMetadata: Record<string, string>;
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  writeHttpMetadata(headers: Headers): void;
}

interface R2ListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

interface R2Objects {
  objects: Array<{ key: string; size: number }>;
  truncated: boolean;
  cursor?: string;
}

function safePath(base: string, key: string): string {
  const root = resolve(base);
  const full = resolve(root, key);
  if (full !== root && !full.startsWith(root + sep)) throw new Error("Invalid storage key");
  return full;
}

function metaPath(key: string, base: string): string {
  return safePath(base, key + ".meta.json");
}

function filePath(key: string, base: string): string {
  return safePath(base, key);
}

export class NodeR2Bucket {
  constructor(private readonly base: string) {
    mkdirSync(base, { recursive: true });
  }

  async put(key: string, value: ReadableStream | ArrayBuffer | string | Blob | null, opts: R2PutOptions = {}): Promise<void> {
    const fp = filePath(key, this.base);
    mkdirSync(dirname(fp), { recursive: true });

    let buf: Buffer;
    if (value instanceof ReadableStream) {
      const chunks: Uint8Array[] = [];
      const reader = value.getReader();
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        chunks.push(chunk);
      }
      buf = Buffer.concat(chunks);
    } else if (value instanceof Blob) {
      buf = Buffer.from(await value.arrayBuffer());
    } else if (value instanceof ArrayBuffer) {
      buf = Buffer.from(value);
    } else if (typeof value === "string") {
      buf = Buffer.from(value, "utf-8");
    } else {
      buf = Buffer.alloc(0);
    }

    writeFileSync(fp, buf);
    const meta = {
      contentType: opts.httpMetadata?.contentType ?? "application/octet-stream",
      customMetadata: opts.customMetadata ?? {},
      size: buf.byteLength,
    };
    mkdirSync(dirname(metaPath(key, this.base)), { recursive: true });
    writeFileSync(metaPath(key, this.base), JSON.stringify(meta));
  }

  async get(key: string): Promise<R2Object | null> {
    const fp = filePath(key, this.base);
    if (!existsSync(fp)) return null;

    const rawMeta = existsSync(metaPath(key, this.base))
      ? JSON.parse(readFileSync(metaPath(key, this.base), "utf-8"))
      : { contentType: "application/octet-stream", customMetadata: {}, size: 0 };

    const data = readFileSync(fp);

    return {
      key,
      size: data.byteLength,
      httpMetadata: { contentType: rawMeta.contentType },
      customMetadata: rawMeta.customMetadata ?? {},
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(data));
          controller.close();
        },
      }),
      async arrayBuffer(): Promise<ArrayBuffer> {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      },
      async text(): Promise<string> {
        return data.toString("utf-8");
      },
      writeHttpMetadata(headers: Headers) {
        if (rawMeta.contentType) headers.set("Content-Type", rawMeta.contentType);
      },
    };
  }

  async delete(key: string): Promise<void> {
    const fp = filePath(key, this.base);
    const mp = metaPath(key, this.base);
    if (existsSync(fp)) unlinkSync(fp);
    if (existsSync(mp)) unlinkSync(mp);
  }

  async list(opts: R2ListOptions = {}): Promise<R2Objects> {
    const prefix = opts.prefix ?? "";
    const objects: Array<{ key: string; size: number }> = [];

    const walk = (dir: string, rel: string) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir)) {
        if (entry.endsWith(".meta.json")) continue;
        const full = join(dir, entry);
        const relPath = rel ? `${rel}/${entry}` : entry;
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full, relPath);
        } else if (relPath.startsWith(prefix)) {
          objects.push({ key: relPath, size: stat.size });
        }
      }
    };

    walk(this.base, "");
    return { objects, truncated: false };
  }
}
