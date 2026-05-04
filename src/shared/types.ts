export type OutputFormat = "webp" | "png";
export type RemoveSize = "auto" | "preview";

export type RemoveOptions = {
  apiKey: string;
  size: RemoveSize;
  format: OutputFormat;
};

export type ApiKeySlot = {
  id: string;
  label: string;
  key: string;
  processedCount: number;
  lastStatus?: "ok" | "error" | "unknown";
};

export type RemoveErrorPayload = {
  error: string;
  status?: number;
  details?: string;
};
