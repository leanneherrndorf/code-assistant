import { useState } from "react";
import type { RepoInfo } from "./types";
import { IngestPanel } from "./components/IngestPanel";
import { ChatPanel } from "./components/ChatPanel";
import { RepoOverview } from "./components/RepoOverview";

export default function App() {
  const [repo, setRepo] = useState<RepoInfo | null>(() => {
    try {
      const saved = localStorage.getItem("last_repo");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const handleRepoReady = (info: RepoInfo) => {
    setRepo(info);
    localStorage.setItem("last_repo", JSON.stringify(info));
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-96 shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-950">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <svg className="w-5 h-5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <span className="text-sm font-semibold text-zinc-100">Code Assistant</span>
          </div>
        </div>

        {/* Ingest panel */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <IngestPanel onRepoReady={handleRepoReady} currentRepo={repo} />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-600">
            Powered by Claude API + ChromaDB
          </p>
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col min-w-0 bg-zinc-950">
        {/* Repo indicator */}
        {repo && (
          <div className="px-6 py-2.5 border-b border-zinc-800 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-xs text-zinc-400 font-mono">
              {repo.github_url.replace("https://github.com/", "")}
            </span>
            <span className="text-xs text-zinc-600 ml-1">
              {repo.chunks} chunks
            </span>
          </div>
        )}

        <RepoOverview repo={repo} />
        <ChatPanel repo={repo} />
      </main>
    </div>
  );
}
