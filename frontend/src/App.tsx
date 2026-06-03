import { useState, useRef, useCallback } from "react";
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

  const [loadedRepos, setLoadedRepos] = useState<RepoInfo[]>(() => {
    try {
      const saved = localStorage.getItem("loaded_repos");
      const list: RepoInfo[] = saved ? JSON.parse(saved) : [];
      // Seed from last_repo if list is missing it
      const lastRepo = localStorage.getItem("last_repo");
      if (lastRepo) {
        const parsed: RepoInfo = JSON.parse(lastRepo);
        if (!list.find((r) => r.repo_id === parsed.repo_id)) {
          const seeded = [parsed, ...list];
          localStorage.setItem("loaded_repos", JSON.stringify(seeded));
          return seeded;
        }
      }
      return list;
    } catch {
      return [];
    }
  });

  const handleRepoReady = (info: RepoInfo) => {
    setRepo(info);
    localStorage.setItem("last_repo", JSON.stringify(info));
    setLoadedRepos((prev) => {
      const updated = [info, ...prev.filter((r) => r.repo_id !== info.repo_id)];
      localStorage.setItem("loaded_repos", JSON.stringify(updated));
      return updated;
    });
  };

  const handleSelectRepo = (info: RepoInfo) => {
    setRepo(info);
    localStorage.setItem("last_repo", JSON.stringify(info));
  };

  const [overviewHeight, setOverviewHeight] = useState(240);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartHeight.current = overviewHeight;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientY - dragStartY.current;
      setOverviewHeight(Math.max(80, Math.min(500, dragStartHeight.current + delta)));
    };
    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [overviewHeight]);

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
          <IngestPanel onRepoReady={handleRepoReady} onSelectRepo={handleSelectRepo} currentRepo={repo} loadedRepos={loadedRepos} />
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

        <RepoOverview repo={repo} height={repo ? overviewHeight : 0} />
        {repo && (
          <div
            onMouseDown={onDragStart}
            className="h-1 cursor-row-resize bg-zinc-800 hover:bg-zinc-600 transition-colors shrink-0"
          />
        )}
        <ChatPanel repo={repo} />
      </main>
    </div>
  );
}
