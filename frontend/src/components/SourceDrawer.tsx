import { useState } from "react";
import type { Source } from "../types";

interface Props {
  sources: Source[];
}

export function SourceDrawer({ sources }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!sources.length) return null;

  return (
    <div className="mt-3 border-t border-zinc-800 pt-3">
      <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">
        Sources ({sources.length})
      </p>
      <div className="flex flex-col gap-1">
        {sources.map((src, i) => (
          <div key={i} className="rounded border border-zinc-800 overflow-hidden">
            {/* Header row */}
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/50 transition-colors"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <FileIcon language={src.language} />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-zinc-300 font-mono truncate block">
                  {src.file_path}
                  {src.name && (
                    <span className="text-zinc-500"> &middot; {src.name}</span>
                  )}
                </span>
                <span className="text-xs text-zinc-600">
                  lines {src.start_line}–{src.end_line}
                </span>
              </div>
              <span className="text-xs text-zinc-600 shrink-0">
                {Math.round(src.score * 100)}%
              </span>
              <ChevronIcon open={expanded === i} />
            </button>

            {/* Expandable code */}
            {expanded === i && (
              <div className="border-t border-zinc-800">
                <pre className="text-xs overflow-x-auto p-3 m-0 rounded-none border-none bg-zinc-950">
                  <code>{src.content}</code>
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FileIcon({ language }: { language: string }) {
  const colors: Record<string, string> = {
    python: "text-blue-400",
    typescript: "text-sky-400",
    tsx: "text-sky-400",
    javascript: "text-yellow-400",
    go: "text-cyan-400",
    rust: "text-orange-400",
    java: "text-red-400",
    ruby: "text-red-500",
  };
  const color = colors[language] ?? "text-zinc-400";
  return (
    <svg className={`w-3.5 h-3.5 shrink-0 ${color}`} fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-zinc-600 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
