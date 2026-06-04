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
        try:
            await asyncio.wait_for(
                asyncio.to_thread(_clone_repo, github_url, tmpdir),
                timeout=120,
            )
        except asyncio.TimeoutError:
            yield {"type": "error", "message": "Clone timed out after 120s — repository may be too large. Try a smaller repo."}
            return

        yield {"type": "status", "message": "Scanning files..."}
        files = list(_walk_repo(Path(tmpdir)))
        yield {"type": "status", "message": f"Found {len(files)} files to process"}

        collection = _chroma_client.get_or_create_collection(
            name=f"repo_{repo_id}",
            embedding_function=_embedding_fn,
            metadata={"github_url": github_url},
        )
        _collections[repo_id] = collection

        # Read + chunk all files concurrently, overlapping I/O across files
        yield {"type": "status", "message": "Reading and chunking files..."}
        file_chunk_results = await asyncio.gather(
            *[_read_and_chunk(abs_path, rel_path, repo_id) for abs_path, rel_path in files]
        )

        # Flatten into a single list of (doc, meta, id) tuples
        all_entries: list[tuple[str, dict, str]] = [
            entry for file_entries in file_chunk_results for entry in file_entries
        ]
        total_chunks = len(all_entries)

        # Embed and upsert in batches
        UPSERT_BATCH = 100
        processed_files = sum(1 for r in file_chunk_results if r)

        for batch_start in range(0, total_chunks, UPSERT_BATCH):
            batch = all_entries[batch_start:batch_start + UPSERT_BATCH]
            docs, metas, ids = zip(*batch)
            await asyncio.to_thread(
                collection.upsert,
                documents=list(docs),
                metadatas=list(metas),
                ids=list(ids),
            )
            yield {
                "type": "progress",
                "processed": processed_files,
                "total": len(files),
                "chunks": min(batch_start + UPSERT_BATCH, total_chunks),
            }

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


async def _read_and_chunk(abs_path: Path, rel_path: str, repo_id: str) -> list[tuple[str, dict, str]]:
    """Read, size-check, and chunk a single file concurrently. Returns (doc, meta, id) tuples."""
    try:
        content = await asyncio.to_thread(abs_path.read_text, encoding="utf-8", errors="replace")
    except Exception:
        return []

    if len(content.encode("utf-8")) > MAX_FILE_SIZE_BYTES:
        return []

    chunks = await asyncio.to_thread(chunk_file, str(abs_path), content, rel_path)
    if not chunks:
        return []

    return [
        (
            c.content,
            {
                "file_path": c.file_path,
                "start_line": c.start_line,
                "end_line": c.end_line,
                "language": c.language,
                "name": c.name or "",
            },
            f"{repo_id}_{hashlib.md5((c.file_path + str(c.start_line)).encode()).hexdigest()}",
        )
        for c in chunks
    ]


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
