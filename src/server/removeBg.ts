import type { OutputFormat, RemoveErrorPayload, RemoveSize } from "../shared/types";

const REMOVE_BG_BASE = "https://api.remove.bg/v1.0";

export type RemoveBgClient = {
  removeBackground(input: {
    image: File;
    apiKey: string;
    size: RemoveSize;
    format: OutputFormat;
  }): Promise<Response>;
};

export function createRemoveBgClient(fetcher: typeof fetch = fetch): RemoveBgClient {
  return {
    removeBackground: ({ image, apiKey, size, format }) => {
      const body = new FormData();
      body.set("image_file", image);
      body.set("size", size);
      body.set("format", format);

      return fetcher(`${REMOVE_BG_BASE}/removebg`, {
        method: "POST",
        headers: { "X-Api-Key": apiKey },
        body
      });
    }
  };
}

export async function readRemoveBgError(response: Response): Promise<RemoveErrorPayload> {
  const status = response.status;
  const text = await response.text();

  try {
    const parsed = JSON.parse(text) as { errors?: Array<{ title?: string; code?: string }> };
    const first = parsed.errors?.[0];
    return {
      error: first?.title ?? response.statusText ?? "remove.bg request failed",
      status,
      details: first?.code ?? text
    };
  } catch {
    return {
      error: response.statusText || "remove.bg request failed",
      status,
      details: text || undefined
    };
  }
}
