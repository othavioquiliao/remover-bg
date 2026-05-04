import React, { ChangeEvent, DragEvent, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import {
  CheckCircle2,
  Download,
  Eye,
  ImagePlus,
  KeyRound,
  Link2,
  Loader2,
  Plus,
  RefreshCcw,
  Trash2,
  UploadCloud,
  XCircle
} from "lucide-react";
import type { ApiKeySlot, OutputFormat, RemoveSize } from "../shared/types";
import "./styles.css";

type QueueStatus = "queued" | "processing" | "done" | "error";

type QueueItem = {
  id: string;
  file: File;
  sourceUrl: string;
  resultUrl?: string;
  status: QueueStatus;
  error?: string;
  keyId?: string;
  contentType?: string;
  outputFormat?: OutputFormat;
};

const STORAGE_KEY = "remover-bg.api-keys";

function App() {
  const [keys, setKeys] = useLocalStorage<ApiKeySlot[]>(STORAGE_KEY, []);
  const [activeKeyId, setActiveKeyId] = useState(keys[0]?.id ?? "");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [format, setFormat] = useState<OutputFormat>("webp");
  const [size, setSize] = useState<RemoveSize>("auto");
  const [isRunning, setIsRunning] = useState(false);

  const activeKey = useMemo(
    () => keys.find((key) => key.id === activeKeyId) ?? keys[0],
    [activeKeyId, keys]
  );

  const stats = useMemo(() => {
    const done = queue.filter((item) => item.status === "done").length;
    const errors = queue.filter((item) => item.status === "error").length;
    return { total: queue.length, done, errors, pending: queue.length - done - errors };
  }, [queue]);

  const completedItems = useMemo(() => queue.filter((item) => item.status === "done" && item.resultUrl), [queue]);

  function addKey() {
    if (!apiKey.trim()) return;

    const nextKey: ApiKeySlot = {
      id: crypto.randomUUID(),
      label: label.trim() || `Chave ${keys.length + 1}`,
      key: apiKey.trim(),
      processedCount: 0,
      lastStatus: "unknown"
    };

    setKeys([...keys, nextKey]);
    setActiveKeyId(nextKey.id);
    setLabel("");
    setApiKey("");
  }

  function removeKey(id: string) {
    const next = keys.filter((key) => key.id !== id);
    setKeys(next);
    if (activeKeyId === id) setActiveKeyId(next[0]?.id ?? "");
  }

  function addFiles(files: FileList | File[]) {
    const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
    const items = images.map((file) => ({
      id: crypto.randomUUID(),
      file,
      sourceUrl: URL.createObjectURL(file),
      status: "queued" as const
    }));
    setQueue((current) => [...items, ...current]);
  }

  async function processQueue() {
    if (!activeKey || isRunning) return;
    setIsRunning(true);

    try {
      const pending = queue.filter((item) => item.status === "queued" || item.status === "error");
      for (const item of pending) {
        await processItem(item.id, activeKey);
      }
    } finally {
      setIsRunning(false);
    }
  }

  async function processItem(itemId: string, key: ApiKeySlot = activeKey) {
    if (!key) return;

    const item = queue.find((candidate) => candidate.id === itemId);
    if (!item) return;

    setQueue((current) =>
      current.map((candidate) =>
        candidate.id === itemId ? { ...candidate, status: "processing", error: undefined, keyId: key.id } : candidate
      )
    );

    const body = new FormData();
    body.set("image_file", item.file);
    body.set("apiKey", key.key);
    body.set("size", size);
    body.set("format", format);

    let response: Response;
    try {
      response = await fetch("/api/remove-background", { method: "POST", body });
    } catch {
      setQueue((current) =>
        current.map((candidate) =>
          candidate.id === itemId
            ? { ...candidate, status: "error", error: "Falha de rede ao chamar o servidor local" }
            : candidate
        )
      );
      updateKey(key.id, { lastStatus: "error" });
      return;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Erro ao remover fundo" }));
      setQueue((current) =>
        current.map((candidate) =>
          candidate.id === itemId
            ? { ...candidate, status: "error", error: String(error.error ?? "Erro ao remover fundo") }
            : candidate
        )
      );
      updateKey(key.id, { lastStatus: "error" });
      return;
    }

    const blob = await response.blob();
    const resultUrl = URL.createObjectURL(blob);
    const contentType = response.headers.get("Content-Type") ?? `image/${format}`;

    setQueue((current) =>
      current.map((candidate) =>
        candidate.id === itemId
          ? { ...candidate, resultUrl, contentType, outputFormat: format, status: "done", error: undefined }
          : candidate
      )
    );

    setKeys((current) =>
      current.map((candidate) =>
        candidate.id === key.id
          ? { ...candidate, processedCount: candidate.processedCount + 1, lastStatus: "ok" }
          : candidate
      )
    );
  }

  function updateKey(id: string, patch: Partial<ApiKeySlot>) {
    setKeys((current) => current.map((key) => (key.id === id ? { ...key, ...patch } : key)));
  }

  function removeItem(id: string) {
    setQueue((current) => {
      const item = current.find((candidate) => candidate.id === id);
      if (item) {
        URL.revokeObjectURL(item.sourceUrl);
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      }
      return current.filter((candidate) => candidate.id !== id);
    });
  }

  async function downloadAll() {
    if (completedItems.length === 0) return;

    const zip = new JSZip();
    for (const item of completedItems) {
      const response = await fetch(item.resultUrl!);
      const blob = await response.blob();
      zip.file(uniqueDownloadName(item.file.name, item.outputFormat ?? format, zip), blob);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "remover-bg-resultados.zip";
    link.click();
    URL.revokeObjectURL(url);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Bun local tool</p>
            <h1>Remover BG</h1>
          </div>
          <div className="top-actions">
            <a href="https://www.remove.bg/pt-br/api" target="_blank" rel="noreferrer" className="docs-link">
              <Link2 size={16} />
              API docs
            </a>
            <a
              href="https://www.remove.bg/api"
              target="_blank"
              rel="noreferrer"
              className="docs-link highlight"
            >
              <KeyRound size={16} />
              Pegar chave
            </a>
          </div>
        </header>

        <section className="hero-panel">
          <div className="hero-copy">
            <p className="eyebrow">Processamento em fila</p>
            <h2>Arraste imagens, escolha uma chave e baixe fundos transparentes.</h2>
          </div>
          <div className="stat-grid">
            <Metric label="Total" value={stats.total} />
            <Metric label="Prontas" value={stats.done} />
            <Metric label="Pendentes" value={stats.pending} />
            <Metric label="Erros" value={stats.errors} />
          </div>
        </section>

        <section className="controls-band">
          <label className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
            <UploadCloud size={34} />
            <span>Solte imagens aqui</span>
            <small>PNG, JPG, WebP ou HEIC suportados pela API</small>
            <input type="file" accept="image/*" multiple onChange={(event) => addFiles(event.target.files ?? [])} />
          </label>

          <div className="run-card">
            <div className="field-row">
              <label>
                Formato
                <select value={format} onChange={(event) => setFormat(event.target.value as OutputFormat)}>
                  <option value="webp">WebP</option>
                  <option value="png">PNG</option>
                </select>
              </label>
              <label>
                Qualidade
                <select value={size} onChange={(event) => setSize(event.target.value as RemoveSize)}>
                  <option value="auto">Alta</option>
                  <option value="preview">Preview</option>
                </select>
              </label>
            </div>
            <button className="primary-action" disabled={!activeKey || isRunning || queue.length === 0} onClick={processQueue}>
              {isRunning ? <Loader2 className="spin" size={18} /> : <ImagePlus size={18} />}
              Processar fila
            </button>
            <button className="secondary-action" disabled={completedItems.length === 0} onClick={downloadAll}>
              <Download size={18} />
              Baixar tudo
            </button>
          </div>
        </section>

        <section className="queue-grid">
          {queue.length === 0 ? (
            <div className="empty-state">
              <Eye size={28} />
              <span>Nenhuma imagem na fila.</span>
            </div>
          ) : (
            queue.map((item) => (
              <article className="image-card" key={item.id}>
                <div className="preview-pair">
                  <img src={item.sourceUrl} alt={`Original ${item.file.name}`} />
                  {item.resultUrl ? (
                    <img className="checker" src={item.resultUrl} alt={`Sem fundo ${item.file.name}`} />
                  ) : (
                    <div className="pending-preview">{statusLabel(item.status)}</div>
                  )}
                </div>
                <div className="item-meta">
                  <div>
                    <strong>{item.file.name}</strong>
                    <span>{formatBytes(item.file.size)}</span>
                  </div>
                  <Status status={item.status} />
                </div>
                {item.error ? <p className="error-text">{item.error}</p> : null}
                <div className="item-actions">
                  {item.resultUrl ? (
                    <a
                      href={item.resultUrl}
                      download={downloadName(item.file.name, item.outputFormat ?? format)}
                      className="icon-button"
                      title="Baixar"
                    >
                      <Download size={18} />
                    </a>
                  ) : null}
                  <button className="icon-button" disabled={!activeKey || item.status === "processing"} onClick={() => processItem(item.id)}>
                    <RefreshCcw size={18} />
                  </button>
                  <button className="icon-button danger" onClick={() => removeItem(item.id)}>
                    <Trash2 size={18} />
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </section>

      <aside className="side-panel">
        <div className="panel-heading">
          <KeyRound size={20} />
          <h2>Chaves</h2>
        </div>

        <div className="key-form">
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Nome da chave" />
          <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Cole a API key" type="password" />
          <button onClick={addKey}>
            <Plus size={16} />
            Adicionar
          </button>
        </div>

        <div className="key-list">
          {keys.length === 0 ? (
            <p className="muted">Adicione uma chave da remove.bg para começar.</p>
          ) : (
            keys.map((key) => (
              <article
                className={`key-item ${activeKey?.id === key.id ? "active" : ""}`}
                key={key.id}
                onClick={() => setActiveKeyId(key.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") setActiveKeyId(key.id);
                }}
                role="button"
                tabIndex={0}
              >
                <span className="key-title">{key.label}</span>
                <span className="key-mask">{maskKey(key.key)}</span>
                <span className="key-foot">
                  {key.processedCount} usadas localmente
                  <KeyHealth status={key.lastStatus} />
                </span>
                <span className="key-actions">
                  <span onClick={(event) => event.stopPropagation()}>
                    <button className="tiny" onClick={() => setActiveKeyId(key.id)}>
                      usar
                    </button>
                    <button className="tiny danger" onClick={() => removeKey(key.id)}>
                      remover
                    </button>
                  </span>
                </span>
                {activeKey?.id === key.id ? <span className="credits">Chave em uso para proximos processamentos</span> : null}
              </article>
            ))
          )}
        </div>

        <p className="notice">
          Contagem local ajuda alternar chaves. A remove.bg limita o plano gratis por conta/chave; o app nao consulta saldo automaticamente.
        </p>
      </aside>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Status({ status }: { status: QueueStatus }) {
  const icon = status === "done" ? <CheckCircle2 size={16} /> : status === "error" ? <XCircle size={16} /> : null;
  return <span className={`status ${status}`}>{icon}{statusLabel(status)}</span>;
}

function KeyHealth({ status }: { status?: ApiKeySlot["lastStatus"] }) {
  return <span className={`key-health ${status ?? "unknown"}`} />;
}

function statusLabel(status: QueueStatus) {
  return {
    queued: "Na fila",
    processing: "Processando",
    done: "Pronta",
    error: "Erro"
  }[status];
}

function maskKey(key: string) {
  if (key.length <= 10) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function downloadName(name: string, format: OutputFormat) {
  return `${name.replace(/\.[^.]+$/, "")}-sem-fundo.${format}`;
}

function uniqueDownloadName(name: string, format: OutputFormat, zip: JSZip) {
  const base = name.replace(/\.[^.]+$/, "");
  let candidate = `${base}-sem-fundo.${format}`;
  let index = 2;
  while (zip.file(candidate)) {
    candidate = `${base}-sem-fundo-${index}.${format}`;
    index += 1;
  }
  return candidate;
}

function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    if (!stored) return initialValue;
    try {
      return JSON.parse(stored) as T;
    } catch {
      localStorage.removeItem(key);
      return initialValue;
    }
  });

  function setStoredValue(next: React.SetStateAction<T>) {
    setValue((current) => {
      const resolved = typeof next === "function" ? (next as (value: T) => T)(current) : next;
      localStorage.setItem(key, JSON.stringify(resolved));
      return resolved;
    });
  }

  return [value, setStoredValue];
}

createRoot(document.getElementById("root")!).render(<App />);
