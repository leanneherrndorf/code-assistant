import { useState } from "react";
import type { IngestStatus, RepoInfo } from "../types";
import { ingestRepo } from "../api";

interface Props {
  onRepoReady: (info: RepoInfo) => void;
  currentRepo: RepoInfo | null;
}

export function IngestPanel({ onRepoReady, currentRepo }: Props) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<IngestStatus>({ phase: "idle" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setStatus({ phase: "cloning" });
    try {
      await ingestRepo(url.trim(), setStatus);
      // onRepoReady is called inside after "done" event
    } catch (err) {
      if (status.phase !== "error") {
        setStatus({ phase: "error", message: String(err) });
      }
    }
  };

  // Sync done state up to parent
  if (status.phase === "done" && status.info.repo_id !== currentRepo?.repo_id) {
    onRepoReady(status.info);
  }

  const isLoading = status.phase === "cloning" || status.phase === "processing";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Repository
        </h2>
        <p className="text-xs text-zinc-600 mb-1.5">Examples</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {SAMPLE_REPOS.map((r) => (
            <button
              key={r.url}
              type="button"
              onClick={() => setUrl(r.url)}
              disabled={isLoading}
              className="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-40"
            >
              {r.label}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            disabled={isLoading}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="px-4 py-2 bg-zinc-100 text-zinc-900 text-sm font-medium rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Loading..." : "Ingest"}
          </button>
        </form>
      </div>

      {/* Status */}
      {status.phase === "cloning" && (
        <StatusCard>
          <Spinner />
          <span className="text-zinc-300 text-sm">Cloning repository...</span>
        </StatusCard>
      )}

      {status.phase === "processing" && (
        <StatusCard>
          <Spinner />
          <div className="flex flex-col gap-1 flex-1">
            <span className="text-zinc-300 text-sm">
              Processing files ({status.processed}/{status.total})
            </span>
            <div className="w-full bg-zinc-800 rounded-full h-1">
              <div
                className="bg-zinc-300 h-1 rounded-full transition-all"
                style={{ width: `${(status.processed / status.total) * 100}%` }}
              />
            </div>
            <span className="text-zinc-500 text-xs">{status.chunks} chunks indexed</span>
          </div>
        </StatusCard>
      )}

      {status.phase === "done" && (
        <StatusCard success>
          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <div className="flex flex-col gap-0.5">
            <span className="text-zinc-200 text-sm font-medium">
              {status.info.github_url.replace("https://github.com/", "")}
            </span>
            <span className="text-zinc-500 text-xs">
              {status.info.files} files &middot; {status.info.chunks} chunks
            </span>
          </div>
        </StatusCard>
      )}

      {status.phase === "error" && (
        <StatusCard error>
          <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-red-300 text-sm">{status.message}</span>
        </StatusCard>
      )}

      {/* Example queries hint */}
      {status.phase === "done" && (
        <div className="mt-2">
          <p className="text-xs text-zinc-500 mb-2">Try asking:</p>
          <ul className="flex flex-col gap-1">
            {EXAMPLE_QUESTIONS.map((q) => (
              <li key={q} className="text-xs text-zinc-400 leading-relaxed">
                &ldquo;{q}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusCard({
  children,
  success,
  error,
}: {
  children: React.ReactNode;
  success?: boolean;
  error?: boolean;
}) {
  const border = error
    ? "border-red-900/50 bg-red-950/20"
    : success
    ? "border-emerald-900/50 bg-emerald-950/10"
    : "border-zinc-800 bg-zinc-900/50";
  return (
    <div className={`flex items-start gap-3 p-3 rounded border ${border}`}>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="w-4 h-4 text-zinc-400 shrink-0 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

const SAMPLE_REPOS = [
  { label: "flask", url: "https://github.com/pallets/flask" },
  { label: "fastapi", url: "https://github.com/tiangolo/fastapi" },
  { label: "anthropic-sdk-python", url: "https://github.com/anthropics/anthropic-sdk-python" },
  { label: "httpx", url: "https://github.com/encode/httpx" },
  { label: "rich", url: "https://github.com/Textualize/rich" },
];

const EXAMPLE_QUESTIONS = [
  "How does authentication work?",
  "Where are API endpoints defined?",
  "What does the main entry point do?",
  "How is error handling structured?",
];
