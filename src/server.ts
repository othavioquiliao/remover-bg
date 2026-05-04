import { existsSync } from "node:fs";
import { join } from "node:path";
import { createRemoveBgClient, readRemoveBgError } from "./server/removeBg";
import type { RemoveErrorPayload } from "./shared/types";

const client = createRemoveBgClient();
const port = Number(process.env.PORT ?? 3000);
const distDir = join(import.meta.dir, "..", "dist");

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/remove-background" && request.method === "POST") {
      return handleRemoveBackground(request);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found", status: 404 }, 404);
    }

    return serveStatic(url.pathname);
  }
});

console.log(`Remover BG running at http://localhost:${port}`);

async function handleRemoveBackground(request: Request): Promise<Response> {
  const form = await request.formData();
  const image = form.get("image_file");
  const apiKey = String(form.get("apiKey") ?? "");
  const size = String(form.get("size") ?? "auto");
  const format = String(form.get("format") ?? "webp");

  if (!(image instanceof File)) return json({ error: "image_file is required", status: 400 }, 400);
  if (!apiKey.trim()) return json({ error: "apiKey is required", status: 400 }, 400);
  if (size !== "auto" && size !== "preview") return json({ error: "size must be auto or preview", status: 400 }, 400);
  if (format !== "webp" && format !== "png") return json({ error: "format must be webp or png", status: 400 }, 400);

  const response = await client.removeBackground({ image, apiKey: apiKey.trim(), size, format });
  if (!response.ok) return json(await readRemoveBgError(response), response.status);

  const headers = new Headers();
  headers.set("Content-Type", response.headers.get("Content-Type") ?? `image/${format}`);
  headers.set("Cache-Control", "no-store");
  copyHeader(response.headers, headers, "X-RateLimit-Limit");
  copyHeader(response.headers, headers, "X-RateLimit-Remaining");
  copyHeader(response.headers, headers, "X-Credits-Charged");

  return new Response(response.body, { status: 200, headers });
}

function serveStatic(pathname: string): Response {
  const path = pathname === "/" ? "/index.html" : pathname;
  const filePath = join(distDir, path);
  const fallback = join(distDir, "index.html");

  if (existsSync(filePath)) return new Response(Bun.file(filePath));
  if (existsSync(fallback)) return new Response(Bun.file(fallback));

  return new Response("Run `bun run build` first, or use Vite during development.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

function json(payload: RemoveErrorPayload | unknown, status: number): Response {
  return Response.json(payload, { status });
}

function copyHeader(from: Headers, to: Headers, name: string): void {
  const value = from.get(name);
  if (value) to.set(name, value);
}
