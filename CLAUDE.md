# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development commands

**Backend** (from `backend/`):
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py                  # runs on http://localhost:8000
```

**Frontend** (from `frontend/`):
```bash
npm install
npm run dev                     # runs on http://localhost:5173
npm run build                   # type-check + production build
```

The Vite dev server proxies `/api/*` → `http://127.0.0.1:8000`, stripping the `/api` prefix. There is no test suite currently.

## Architecture

This is a RAG (retrieval-augmented generation) app: users ingest a GitHub repo, then chat with it via Claude.

### Data flow

**Ingest:** `POST /ingest` → `ingest.py` clones repo with `gitpython` (shallow, depth=1) → `chunker.py` walks files and chunks them → chunks are embedded and upserted into ChromaDB → responses streamed as SSE events.

**Query:** `POST /query` → `query.py` embeds the question → retrieves top-8 chunks from ChromaDB → builds context string → streams Claude response as SSE tokens.

Both endpoints use FastAPI `StreamingResponse` with `text/event-stream`. The frontend reads these with the Fetch API's `ReadableStream` (no EventSource).

### Backend

- `main.py` — FastAPI app, CORS config, endpoint definitions
- `ingest.py` — clone → chunk → embed → upsert pipeline; holds the shared `PersistentClient` ChromaDB instance and in-process collection cache (`_collections` dict)
- `chunker.py` — AST-aware chunking via `tree-sitter` for 20+ languages, line-based fallback; defines `SKIP_DIRS` and `SKIP_EXTENSIONS`
- `query.py` — vector retrieval + synchronous Anthropic streaming inside an async generator (blocks event loop; acceptable for single-user dev use)

ChromaDB is persisted to `backend/chroma_data/`. The `repo_id` is a 16-char SHA-256 hex of the lowercased GitHub URL.

Model: `claude-sonnet-4-5` (set in `query.py`).

### Frontend

- `api.ts` — two functions: `ingestRepo` and `queryRepo`, both parse SSE streams manually
- `App.tsx` — top-level layout; persists last repo to `localStorage`
- `RepoOverview.tsx` — auto-fires a structured summary query on repo change; parses Claude's markdown response into sections (Overview / Languages & frameworks / API endpoints); renders file paths as GitHub links
- `ChatPanel.tsx` — chat UI with a custom markdown block renderer (`parseBlocks`) handling headings, fenced code, bullet/numbered lists, and inline bold/code
- `SourceDrawer.tsx` — collapsible panel showing retrieved source chunks per message

### Key constraints

- `React.StrictMode` is intentionally removed from `main.tsx` — it caused double SSE requests that broke the auto-summary
- Ingested repos survive backend restarts because ChromaDB uses `PersistentClient`; the frontend restores the last repo from `localStorage` on reload
- Files >500 KB and binary/build artifacts are skipped during ingestion (see `SKIP_DIRS`, `SKIP_EXTENSIONS` in `chunker.py`)
- Chunks are upserted in batches of 100 for performance
