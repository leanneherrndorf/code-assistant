import type { IngestStatus, RepoInfo, Source } from "./types";

const BASE = "/api";

/**
 * Stream repo ingestion. Calls onEvent for each SSE event.
 */
export async function ingestRepo(
  githubUrl: string,
  onEvent: (status: IngestStatus) => void
): Promise<RepoInfo> {
  const res = await fetch(`${BASE}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ github_url: githubUrl }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail ?? "Ingest failed");
  }

  return new Promise((resolve, reject) => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    onEvent({ phase: "cloning" });

    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = JSON.parse(line.slice(6));

            if (data.type === "status") {
              onEvent({ phase: "cloning" });
            } else if (data.type === "progress") {
              onEvent({
                phase: "processing",
                processed: data.processed,
                total: data.total,
                chunks: data.chunks,
              });
            } else if (data.type === "done") {
              const info: RepoInfo = {
                repo_id: data.repo_id,
                github_url: data.github_url,
                files: data.files,
                chunks: data.chunks,
              };
              onEvent({ phase: "done", info });
              resolve(info);
            } else if (data.type === "error") {
              onEvent({ phase: "error", message: data.message });
              reject(new Error(data.message));
            }
          }
        }
      } catch (e) {
        reject(e);
      }
    };

    pump();
  });
}

/**
 * Stream a query. Calls onSources once, then onToken for each streamed token.
 */
export async function queryRepo(
  question: string,
  repoId: string,
  onSources: (sources: Source[]) => void,
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, repo_id: repoId }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail ?? "Query failed");
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = JSON.parse(line.slice(6));

      if (data.type === "sources") {
        onSources(data.sources);
      } else if (data.type === "token") {
        onToken(data.text);
      } else if (data.type === "error") {
        throw new Error(data.message);
      }
    }
  }
}
