import { useEffect, useState } from "react";
import type { RepoInfo } from "../types";
import { queryRepo } from "../api";

interface Props {
  repo: RepoInfo | null;
}

const SUMMARY_PROMPT =
  "Give a concise structured overview of this repository. Use exactly these three sections with these headings:\n\n" +
  "Overview\n" +
  "A 2-3 sentence description of what the project does and who it's for.\n\n" +
  "Languages & frameworks\n" +
  "List the main programming languages and frameworks used, referencing key files.\n\n" +
  "API endpoints\n" +
  "List every exposed API endpoint with its HTTP method, path, and a one-line description. If there are none, say so.";

export function RepoOverview({ repo }: Props) {
  const [content, setContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!repo) {
      setContent("");
      setError(null);
      return;
    }

    setContent("");
    setError(null);
    setIsStreaming(true);
    setIsCollapsed(false);

    const controller = new AbortController();

    (async () => {
      try {
        await queryRepo(
          SUMMARY_PROMPT,
          repo.repo_id,
          () => {},
          (token) => setContent((prev) => prev + token),
          controller.signal
        );
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsStreaming(false);
      }
    })();

    return () => controller.abort();
  }, [repo?.repo_id]);

  if (!repo) return null;

  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={() => setIsCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-6 py-3 text-left hover:bg-zinc-900/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Repository Overview
          </span>
          {isStreaming && (
            <span className="inline-block w-1.5 h-3 bg-zinc-500 animate-pulse rounded-sm" />
          )}
        </div>
        <svg
          className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!isCollapsed && (
        <div className="px-6 pb-5 max-h-72 overflow-y-auto">
          {error ? (
            <p className="text-xs text-red-400">{error}</p>
          ) : content ? (
            <FormattedOverview text={content} isStreaming={isStreaming} githubUrl={repo.github_url} />
          ) : (
            <p className="text-xs text-zinc-600 italic">Generating overview...</p>
          )}
        </div>
      )}
    </div>
  );
}

function FormattedOverview({ text, isStreaming, githubUrl }: { text: string; isStreaming: boolean; githubUrl: string }) {
  const sections = parseSections(text);

  if (sections.length === 0) {
    return (
      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
        {text}
        {isStreaming && <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse rounded-sm ml-0.5 align-middle" />}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section, i) => (
        <div key={i}>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
            {section.heading}
          </h3>
          <div className="text-sm text-zinc-300 leading-relaxed flex flex-col gap-1">
            <MarkdownBody text={section.body} githubUrl={githubUrl} />
            {isStreaming && i === sections.length - 1 && (
              <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse rounded-sm ml-0.5 align-middle" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const FILE_PATH_RE = /^[\w.-][\w./-]*\.[a-z]{1,6}$/i;

function isFilePath(s: string): boolean {
  return FILE_PATH_RE.test(s) && s.includes("/");
}

function fileUrl(githubUrl: string, path: string): string {
  return `${githubUrl}/blob/main/${path}`;
}

function MarkdownBody({ text, githubUrl }: { text: string; githubUrl: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trimStart();
        if (/^#{1,3}\s*$/.test(trimmed)) return null;
        const stripped = trimmed.replace(/^#{1,3}\s+/, "");
        const isList = stripped.startsWith("- ") || stripped.startsWith("* ");
        const content = isList ? stripped.slice(2) : stripped;
        return (
          <p key={i} className={isList ? "pl-3 before:content-['–'] before:mr-2 before:text-zinc-600" : ""}>
            <InlineMarkdown text={content} githubUrl={githubUrl} />
          </p>
        );
      })}
    </>
  );
}

function InlineMarkdown({ text, githubUrl }: { text: string; githubUrl: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="text-zinc-100 font-medium">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          const inner = part.slice(1, -1);
          if (isFilePath(inner)) {
            return (
              <a
                key={i}
                href={fileUrl(githubUrl, inner)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 bg-zinc-800 px-1 py-0.5 rounded text-xs font-mono hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
              >
                {inner}
              </a>
            );
          }
          return <code key={i} className="text-zinc-300 bg-zinc-800 px-1 py-0.5 rounded text-xs font-mono">{inner}</code>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function parseSections(text: string): { heading: string; body: string }[] {
  const knownHeadings = ["Overview", "Languages & frameworks", "API endpoints"];
  const sections: { heading: string; body: string }[] = [];

  let remaining = text;

  for (let i = 0; i < knownHeadings.length; i++) {
    const heading = knownHeadings[i];
    const idx = remaining.indexOf(heading);
    if (idx === -1) break;

    const afterHeading = remaining.slice(idx + heading.length).replace(/^\s*\n/, "");
    const nextHeading = knownHeadings[i + 1];
    const nextIdx = nextHeading ? afterHeading.indexOf(nextHeading) : -1;

    let body = nextIdx === -1
      ? afterHeading.trim()
      : afterHeading.slice(0, nextIdx).trim();

    // Strip repeated heading on first line (e.g. Claude echoing "Overview" as body text)
    const firstLineEnd = body.indexOf("\n");
    const firstLine = (firstLineEnd === -1 ? body : body.slice(0, firstLineEnd)).replace(/^[#*_\s]+|[#*_\s]+$/g, "").trim();
    if (firstLine.toLowerCase() === heading.toLowerCase()) {
      body = (firstLineEnd === -1 ? "" : body.slice(firstLineEnd + 1)).trim();
    }

    sections.push({ heading, body });
    remaining = nextIdx === -1 ? "" : afterHeading.slice(nextIdx);
  }

  return sections;
}
