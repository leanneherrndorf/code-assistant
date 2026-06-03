"""
Ingestion pipeline: clone repo → walk files → chunk → embed → store in ChromaDB.
"""

import asyncio
import hashlib
import os
import shutil
import tempfile
from pathlib import Path
from typing import AsyncGenerator

import chromadb
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction
import git

from chunker import SKIP_DIRS, SKIP_EXTENSIONS, chunk_file

# Shared ChromaDB client (in-memory for demo; swap to PersistentClient for persistence)
_chroma_client = chromadb.PersistentClient(path="./chroma_data")
_embedding_fn = DefaultEmbeddingFunction()

# Track active collections by repo_id
_collections: dict[str, chromadb.Collection] = {}

MAX_FILE_SIZE_BYTES = 500_000  # 500 KB — skip enormous files


def _repo_id_from_url(url: str) -> str:
    """Stable ID from a GitHub URL."""
    return hashlib.sha256(url.strip().lower().encode()).hexdigest()[:16]


def _should_skip(path: Path) -> bool:
    if any(part in SKIP_DIRS for part in path.parts):
        return True
    suffix = path.suffix.lower()
    for skip_ext in SKIP_EXTENSIONS:
        if str(path).endswith(skip_ext):
            return True
    return False


async def ingest_repo(github_url: str) -> AsyncGenerator[dict, None]:
    """
    Clone a GitHub repo, chunk all files, embed and store in ChromaDB.
    Yields status events as dicts for SSE streaming.
    """
    repo_id = _repo_id_from_url(github_url)
    tmpdir = tempfile.mkdtemp(prefix="code_assistant_")

    try:
        yield {"type": "status", "message": "Cloning repository..."}
        await asyncio.to_thread(_clone_repo, github_url, tmpdir)

        yield {"type": "status", "message": "Scanning files..."}
        files = list(_walk_repo(Path(tmpdir)))
        yield {"type": "status", "message": f"Found {len(files)} files to process"}

        collection = _chroma_client.get_or_create_collection(
            name=f"repo_{repo_id}",
            embedding_function=_embedding_fn,
            metadata={"github_url": github_url},
        )
        _collections[repo_id] = collection

        UPSERT_BATCH = 100

        total_chunks = 0
        batch_docs: list[str] = []
        batch_metas: list[dict] = []
        batch_ids: list[str] = []

        async def flush_batch():
            if batch_docs:
                await asyncio.to_thread(
                    collection.upsert,
                    documents=batch_docs[:],
                    metadatas=batch_metas[:],
                    ids=batch_ids[:],
                )
                batch_docs.clear()
                batch_metas.clear()
                batch_ids.clear()

        for i, (abs_path, rel_path) in enumerate(files):
            try:
                content = abs_path.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue

            if len(content.encode("utf-8")) > MAX_FILE_SIZE_BYTES:
                continue

            chunks = chunk_file(str(abs_path), content, rel_path)
            if not chunks:
                continue

            for c in chunks:
                batch_docs.append(c.content)
                batch_metas.append({
                    "file_path": c.file_path,
                    "start_line": c.start_line,
                    "end_line": c.end_line,
                    "language": c.language,
                    "name": c.name or "",
                })
                batch_ids.append(
                    f"{repo_id}_{hashlib.md5((c.file_path + str(c.start_line)).encode()).hexdigest()}"
                )

            total_chunks += len(chunks)

            if len(batch_docs) >= UPSERT_BATCH:
                await flush_batch()

            if (i + 1) % 10 == 0 or (i + 1) == len(files):
                yield {
                    "type": "progress",
                    "processed": i + 1,
                    "total": len(files),
                    "chunks": total_chunks,
                }

        await flush_batch()  # flush any remaining

        yield {
            "type": "done",
            "repo_id": repo_id,
            "files": len(files),
            "chunks": total_chunks,
            "github_url": github_url,
        }

    except Exception as e:
        yield {"type": "error", "message": str(e)}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _clone_repo(url: str, dest: str) -> None:
    git.Repo.clone_from(url, dest, depth=1)


def _walk_repo(root: Path) -> list[tuple[Path, str]]:
    results = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if _should_skip(rel):
            continue
        results.append((path, str(rel)))
    return results


def get_collection(repo_id: str) -> chromadb.Collection:
    if repo_id in _collections:
        return _collections[repo_id]
    # Try to recover from ChromaDB (if it was created in this process)
    try:
        col = _chroma_client.get_collection(
            name=f"repo_{repo_id}",
            embedding_function=_embedding_fn,
        )
        _collections[repo_id] = col
        return col
    except Exception:
        raise ValueError(f"Repo '{repo_id}' not found. Please ingest it first.")
