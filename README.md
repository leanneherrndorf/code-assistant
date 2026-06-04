
# Code Assistant

A RAG-powered chat interface for exploring GitHub repositories. Add a public Github repo, and the system clones it, chunks the code using AST-aware parsing, and indexes it into a vector store. An overview of the repo is generated: languages, dependencies, entry points, and API endpoints. You can ask questions about the codebase in plain language, and Claude answers with direct references to source files, line numbers, and function names.

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

## RAG/LLM Approach & Decisions

ChromaDB was chosen as the vector database with the default `all-MiniLM-L6-v2` embedding model. It was chosen for its simplicity: it allows running locally with no external services, and PersistentClient gives data durability with backend restarts. ChromaDB works well for a prototype or single-user dev tool: the default embedding function runs locally via ONNX, requires no API key or cost per embedding during development. Ingestion reads and chunks all files concurrently using `asyncio.gather`, overlapping file I/O across the entire repo before embedding begins. When queried, the top 8 chunks are retrieved by cosine vector similarity and passed to Claude as context, which streams a response token by token via SSE.

The LLM model chosen is Claude Sonnet via the Anthropic SDK. Sonnet handles long context windows well, and produces well-structured technical answers.  

### Future Enhancements

This RAG implementation was focused on a local CPU setup. This is a limitation that slows down the embedding. Switching to an API-based model such as Voyage `voyage-code-2` (a model purpose-built for code) or OpenAI `text-embedding-3-small` would be ideal for productionalization. `all-MiniLM-L6-v2` is a model trained on natural language, not code, so using `voyage-code-2` would enhance recognition of structural code patterns for better repo overview and interpretation. Pinecone or pgvector would be chosen for vector database providers as ChromaDB is not horizontally scalable. Another advantage of moving to a shared vector store is any repo already ingested would not need to be re-ingested, greatly speeding up the user experience for popular repos.

Also, retrieval quality could be enhanced using a reranker. Retrieving the top 20 chunks, then using a cross encoder such as Cohere Rerank to re-score and select the best 8 prior to passing to Claude would enhance answer relevance. The trade off is a small amount of additional latency.

Another enhancement would be incremental ingestion to avoid re-embedding unchanged code. Store the last-ingested commit SHA per repo, and use the GitHub API to fetch only changed files since that commit. Re-embed only the changed chunks, keyed by content hash.

## Productionalization

### Deployment & Containerization

The backend would be split into three independently deployable services: the FastAPI API layer, Celery embedding workers, and the vector store (pgvector on Postgres or a Pinecone). Each would be containerized with Docker and orchestrated via Kubernetes, which allows autoscaling embedding workers based on job queue depth, independently of the API layer. 

The frontend would be a static build deployed to a CDN to keep it decoupled from the backend. Secrets and environment config would be managed via AWS Secrets Manager or Vault rather than a local `.env` file.

### Ingestion Architecture

Rather than blocking an HTTP connection for ingestion, the API would accept the request, enqueue a background job, and return a job ID immediately. The frontend would poll or subscribe via WebSocket for progress updates. Workers would run on GPU instances with a production embedding model like `voyage-code-2` or `text-embedding-3-small`.

### CI/CD

The pipeline would live in GitHub Actions with separate workflows for the frontend and backend. On every pull request, CI would run linting and type-checking, build Docker images, and run integration tests against a real vector store instance, with a mocked Anthropic client. On merge to main, CD would deploy the frontend to the CDN and push the backend image to a container registry, deploying to Kubernetes via ArgoCD, giving a full audit trail and easy rollback. Promotion to production would require a manual approval step, and database migration would run as a pre-deploy job before the new API version comes up.

### Testing

The backend would have unit tests, integration tests for the ingest pipeline against a real vector store, and end-to-end tests for the query flow with a mocked Claude response. The embedding model calls would be mocked in CI to avoid cost and latency. Frontend would have unit and integration tests also. Retrieval quality could be evaluated separately using a dataset of question/expected-chunk pairs run periodically against the live system.

### Observability

Structured logging, distributed tracing, and metrics would cover the full request path across the API and worker layers. The most important metrics to monitor for a RAG system are embedding throughput, retrieval latency, chunk hit rate, and Claude API cost per query. Query logging could be added (storing what users asked and chunks retrieved) to allow offline retrieval quality audits.



## Technical Decisions & Engineering standards

## AI Tools and Development Process

Claude Code was used as an AI coding assistant to develop this application. It was used throughout the process for planning, implementation, debugging, and feature development. Design decisions, requirements, and technical direction were driven by the engineer. The development process was iterative: ideas were explored with Claude, Claude would propose implementations which were reviewed, tested, and refined based on real behavior in the running application. AI assistance helps with implementation velocity, while the engineer retains ownership of architecture, quality, and product decisions.

## Future Enhancements/Feature Ideas

- User accounts to save repos (beyond localStorage)
- File tree view to show repo structure visually
- Private repo support via GitHub OAuth
- Query suggestions based on repo findings
- Multi repo queries

## Additional Notes

- Only public GitHub repositories are supported.
- Files over 500 KB, build artifacts, and binary files are skipped during ingestion.
- Supported languages for AST chunking: Python, JavaScript, TypeScript, Java, Go, Ruby, Rust, C, C++, C#, PHP, Swift, Kotlin, Scala, Elixir, Haskell, Bash. All other text files fall back to line-based chunking.