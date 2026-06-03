"""
Query pipeline: embed question → retrieve chunks → stream Claude response.
"""

import json
import os
from typing import AsyncGenerator

import anthropic

from ingest import get_collection

TOP_K = 8
MODEL = "claude-sonnet-4-5"

SYSTEM_PROMPT = """You are an expert code assistant. You answer questions about a codebase \
using the retrieved source code chunks provided to you.

Guidelines:
- Be specific. Reference file paths and function/class names.
- If the answer spans multiple files, explain the relationship.
- If the retrieved context doesn't contain enough information, say so clearly.
- Format code references as `path/to/file.py` and inline code with backticks.
- Do not hallucinate functionality that isn't present in the retrieved chunks."""


def _build_context(results: dict) -> str:
    chunks = []
    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]

    for doc, meta in zip(docs, metas):
        name_str = f" ({meta['name']})" if meta.get("name") else ""
        header = f"### {meta['file_path']}{name_str} [lines {meta['start_line']}–{meta['end_line']}]"
        chunks.append(f"{header}\n```{meta.get('language', '')}\n{doc}\n```")

    return "\n\n".join(chunks)


def _format_sources(results: dict) -> list[dict]:
    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    sources = []
    for doc, meta, dist in zip(docs, metas, distances):
        sources.append({
            "file_path": meta["file_path"],
            "start_line": meta["start_line"],
            "end_line": meta["end_line"],
            "language": meta.get("language", "text"),
            "name": meta.get("name") or None,
            "content": doc,
            "score": round(1 - dist, 3),  # convert distance to similarity
        })
    return sources


async def query_repo(question: str, repo_id: str) -> AsyncGenerator[str, None]:
    """
    Retrieve relevant chunks and stream a Claude response.
    Yields SSE-formatted strings.
    """
    try:
        collection = get_collection(repo_id)
    except ValueError as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        return

    # Retrieve
    results = collection.query(
        query_texts=[question],
        n_results=min(TOP_K, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    sources = _format_sources(results)
    yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

    context = _build_context(results)
    user_message = f"""Here are the relevant code chunks from the repository:

{context}

---

Question: {question}"""

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    try:
        with client.messages.stream(
            model=MODEL,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        ) as stream:
            for text in stream.text_stream:
                yield f"data: {json.dumps({'type': 'token', 'text': text})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
