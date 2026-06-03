import { useEffect, useRef, useState } from "react";
import type { Message, RepoInfo, Source } from "../types";
import { queryRepo } from "../api";
import { SourceDrawer } from "./SourceDrawer";

interface Props {
  repo: RepoInfo | null;
}

export function ChatPanel({ repo }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  const runQuery = async (question: string, repoInfo: RepoInfo) => {
    setIsLoading(true);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      sources: [],
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      await queryRepo(
        question,
        repoInfo.repo_id,
        (sources: Source[]) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, sources } : m))
          );
        },
        (token: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + token } : m
            )
          );
        }
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Error: ${String(err)}`, isStreaming: false }
            : m
        )
      );
    } finally {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, isStreaming: false } : m
        )
      );
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !repo || isLoading) return;
    const question = input.trim();
    setInput("");
    await runQuery(question, repo);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <EmptyState hasRepo={!!repo} />
        ) : (
          <div className="flex flex-col gap-6 max-w-3xl mx-auto">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 px-6 py-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                repo
                  ? "Ask about the codebase... (Enter to send, Shift+Enter for newline)"
                  : "Ingest a repository first"
              }
              disabled={!repo || isLoading}
              rows={1}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 disabled:opacity-40 resize-none"
              style={{ minHeight: "44px", maxHeight: "160px" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
            />
            <button
              type="submit"
              disabled={!repo || !input.trim() || isLoading}
              className="px-4 py-3 bg-zinc-100 text-zinc-900 text-sm font-medium rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-zinc-800 rounded-2xl rounded-tr-sm px-4 py-3 max-w-xl">
          <p className="text-sm text-zinc-100 whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center">
          <svg className="w-3 h-3 text-zinc-300" fill="currentColor" viewBox="0 0 20 20">
            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 14.094A5.973 5.973 0 004 17v1H1v-1a3 3 0 013.75-2.906z" />
          </svg>
        </div>
        <span className="text-xs text-zinc-500 font-medium">Assistant</span>
      </div>
      <div className="text-sm pl-7">
        {message.isStreaming && !message.content ? (
          <LoadingDots />
        ) : message.content ? (
          <MarkdownContent content={message.content} isStreaming={!!message.isStreaming} />
        ) : (
          <span className="text-zinc-500 italic">No response</span>
        )}
      </div>
      {message.sources && message.sources.length > 0 && (
        <div className="pl-7">
          <SourceDrawer sources={message.sources} />
        </div>
      )}
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

function MarkdownContent({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const blocks = parseBlocks(content);
  return (
    <div className="flex flex-col gap-2 text-zinc-200 leading-relaxed">
      {blocks.map((block, i) => {
        const isLast = i === blocks.length - 1;
        if (block.type === "h2") {
          return (
            <p key={i} className="text-zinc-100 font-medium text-sm mt-2">
              <InlineMd text={block.text} />
              {isStreaming && isLast && <Cursor />}
            </p>
          );
        }
        if (block.type === "h3") {
          return (
            <p key={i} className="text-zinc-400 font-medium text-xs uppercase tracking-wide mt-1">
              <InlineMd text={block.text} />
              {isStreaming && isLast && <Cursor />}
            </p>
          );
        }
        if (block.type === "code") {
          return (
            <pre key={i} className="bg-zinc-900 border border-zinc-800 rounded p-3 text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre">
              {block.text}
              {isStreaming && isLast && <Cursor />}
            </pre>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i} className="flex flex-col gap-0.5">
              {block.items!.map((item, j) => (
                <li key={j} className="flex gap-2 text-sm">
                  <span className="text-zinc-600 shrink-0">–</span>
                  <span><InlineMd text={item} /></span>
                </li>
              ))}
              {isStreaming && isLast && <Cursor />}
            </ul>
          );
        }
        return (
          <p key={i} className="text-sm">
            <InlineMd text={block.text} />
            {isStreaming && isLast && <Cursor />}
          </p>
        );
      })}
    </div>
  );
}

function Cursor() {
  return <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse rounded-sm ml-0.5 align-middle" />;
}

type Block =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "code"; text: string; lang: string }
  | { type: "list"; items: string[]; text: "" }
  | { type: "para"; text: string };

function parseBlocks(content: string): Block[] {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", text: codeLines.join("\n"), lang });
      i++;
      continue;
    }

    // H2
    if (line.match(/^#{1,2}\s+/)) {
      blocks.push({ type: "h2", text: line.replace(/^#{1,2}\s+/, "") });
      i++;
      continue;
    }

    // H3
    if (line.match(/^###\s+/)) {
      blocks.push({ type: "h3", text: line.replace(/^###\s+/, "") });
      i++;
      continue;
    }

    // Unordered or numbered list
    if (line.match(/^[-*]\s/) || line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].match(/^[-*]\s/) || lines[i].match(/^\d+\.\s/))) {
        items.push(lines[i].replace(/^[-*]\s/, "").replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push({ type: "list", items, text: "" });
      continue;
    }

    // Empty line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph
    blocks.push({ type: "para", text: line });
    i++;
  }

  return blocks;
}

function InlineMd({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="text-zinc-100 font-medium">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i} className="bg-zinc-800 px-1 py-0.5 rounded text-xs font-mono text-zinc-300">{part.slice(1, -1)}</code>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function EmptyState({ hasRepo }: { hasRepo: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-zinc-600">
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1}
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        />
      </svg>
      <p className="text-sm">
        {hasRepo
          ? "Ask anything about the codebase"
          : "Ingest a GitHub repository to get started"}
      </p>
    </div>
  );
}
