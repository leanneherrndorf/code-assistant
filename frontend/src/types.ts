export interface Source {
  file_path: string;
  start_line: number;
  end_line: number;
  language: string;
  name: string | null;
  content: string;
  score: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
}

export interface RepoInfo {
  repo_id: string;
  github_url: string;
  files: number;
  chunks: number;
}

export type IngestStatus =
  | { phase: "idle" }
  | { phase: "cloning" }
  | { phase: "processing"; processed: number; total: number; chunks: number }
  | { phase: "done"; info: RepoInfo }
  | { phase: "error"; message: string };
