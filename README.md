
# Code Assistant

A RAG-powered chat interface for exploring GitHub repositories. Add a public Github repo, and the system ingests it. After a summary of the repo is provided, and you can ask questions about the codebase in plain language. Claude answers with direct references to source files, line numbers, and function names.

---

## How it works

1. **Ingest** — the backend clones a GitHub repo, walks the files, and chunks them using AST-aware parsing (tree-sitter). Each chunk is embedded and stored in ChromaDB.
2. **Query** — when you ask a question, the top 8 most relevant chunks are retrieved via vector similarity, then passed to Claude as context. The response streams back token by token.
3. **Sources** — alongside each answer, the UI shows exactly which files and line ranges were used.

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Clone the repo

```bash
git clone https://github.com/your-username/code-assistant.git
cd code-assistant
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=your_api_key_here
```

### 3. backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

The API will be available at `http://localhost:8000`. You can verify with:

```bash
curl http://localhost:8000/health
```

### 4. frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Usage

1. Paste a GitHub repo URL (e.g. `https://github.com/anthropics/anthropic-sdk-python`) into the ingest panel and click **Ingest**.
2. Wait for the progress bar to complete. Large repos may take a minute.
3. Type a question in the chat panel and press Enter.
4. Expand the **Sources** drawer to see which code chunks informed the answer.

---

## Architecture

```
code-assistant/
├── backend/
│   ├── main.py        # FastAPI app, /ingest and /query endpoints
│   ├── ingest.py      # Clone → chunk → embed → store pipeline
│   ├── chunker.py     # AST-aware chunking via tree-sitter, line-based fallback
│   ├── query.py       # Vector retrieval + Claude streaming response
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── api.ts                  # SSE streaming client for ingest and query
    │   ├── types.ts                # Shared TypeScript types
    │   └── components/
    │       ├── IngestPanel.tsx     # Repo URL input and ingestion progress
    │       ├── ChatPanel.tsx       # Chat interface with streaming output
    │       └── SourceDrawer.tsx    # Expandable source chunk viewer
    └── package.json
```

**Backend:** Python, FastAPI, ChromaDB (in-memory), tree-sitter, Anthropic SDK
**Frontend:** React 18, TypeScript, Vite, Tailwind CSS

Both the ingest and query endpoints use Server-Sent Events (SSE) for real-time streaming. The Vite dev server proxies `/api/*` to the backend at `localhost:8000`.

---

## Productionalization

## RAG/LLM Approach & Decisions

## Technical Decisions & Engineering standards

## AI Tools and Development Process

## Future Improvements

## Notes

- Only public GitHub repositories are supported.
- Files over 500 KB, build artifacts, and binary files are skipped during ingestion.
- Supported languages for AST chunking: Python, JavaScript, TypeScript, Java, Go, Ruby, Rust, C, C++, C#, PHP, Swift, Kotlin, Scala, Elixir, Haskell, Bash. All other text files fall back to line-based chunking.