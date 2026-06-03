"""
AST-aware code chunker using tree-sitter.
Falls back to line-based chunking for unsupported file types.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Optional
import re

try:
    from tree_sitter_languages import get_language, get_parser
    TREE_SITTER_AVAILABLE = True
except ImportError:
    TREE_SITTER_AVAILABLE = False

# Map file extensions to tree-sitter language names
EXT_TO_LANG: dict[str, str] = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".java": "java",
    ".go": "go",
    ".rb": "ruby",
    ".rs": "rust",
    ".c": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cs": "c_sharp",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".lua": "lua",
    ".r": "r",
    ".ex": "elixir",
    ".exs": "elixir",
    ".hs": "haskell",
    ".sh": "bash",
    ".bash": "bash",
}

# Node types that represent meaningful top-level chunks per language
CHUNK_NODE_TYPES: dict[str, list[str]] = {
    "python": ["function_definition", "class_definition", "decorated_definition"],
    "javascript": ["function_declaration", "class_declaration", "method_definition", "export_statement"],
    "typescript": ["function_declaration", "class_declaration", "method_definition", "export_statement", "interface_declaration", "type_alias_declaration"],
    "tsx": ["function_declaration", "class_declaration", "method_definition", "export_statement", "interface_declaration"],
    "java": ["method_declaration", "class_declaration", "interface_declaration", "constructor_declaration"],
    "go": ["function_declaration", "method_declaration", "type_declaration"],
    "ruby": ["method", "class", "module"],
    "rust": ["function_item", "impl_item", "struct_item", "enum_item", "trait_item"],
    "c": ["function_definition", "struct_specifier"],
    "cpp": ["function_definition", "class_specifier", "struct_specifier", "namespace_definition"],
    "c_sharp": ["method_declaration", "class_declaration", "interface_declaration", "constructor_declaration"],
    "php": ["function_definition", "method_declaration", "class_declaration"],
    "swift": ["function_declaration", "class_declaration", "struct_declaration", "protocol_declaration"],
    "kotlin": ["function_declaration", "class_declaration", "object_declaration"],
    "scala": ["def", "class", "object", "trait"],
}

MAX_CHUNK_LINES = 150
FALLBACK_CHUNK_LINES = 60
FALLBACK_OVERLAP_LINES = 10

# Files/dirs to skip during ingestion
SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "env",
    "dist", "build", ".next", ".nuxt", "coverage", ".pytest_cache",
    ".mypy_cache", ".tox", "vendor", "third_party",
}
SKIP_EXTENSIONS = {
    ".min.js", ".min.css", ".map", ".lock", ".sum",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".pdf", ".zip", ".tar", ".gz", ".whl", ".egg",
    ".pyc", ".pyo", ".class", ".jar", ".war",
    ".ttf", ".woff", ".woff2", ".eot",
}


@dataclass
class Chunk:
    content: str
    file_path: str       # relative to repo root
    start_line: int      # 1-indexed
    end_line: int        # 1-indexed
    language: str
    name: Optional[str] = None  # function/class name if extracted


def _get_node_name(node, source_bytes: bytes) -> Optional[str]:
    """Try to extract the name of a named node (function, class, etc.)."""
    for child in node.children:
        if child.type == "identifier" or child.type == "name":
            return source_bytes[child.start_byte:child.end_byte].decode("utf-8", errors="replace")
    return None


def _extract_chunks_from_tree(node, source_bytes: bytes, file_path: str, language: str, target_types: set[str]) -> list[Chunk]:
    chunks = []

    if node.type in target_types:
        start_line = node.start_point[0] + 1
        end_line = node.end_point[0] + 1
        content = source_bytes[node.start_byte:node.end_byte].decode("utf-8", errors="replace")
        name = _get_node_name(node, source_bytes)

        # If a single chunk is enormous, clip it
        lines = content.splitlines()
        if len(lines) > MAX_CHUNK_LINES:
            content = "\n".join(lines[:MAX_CHUNK_LINES]) + f"\n... (truncated, {len(lines) - MAX_CHUNK_LINES} more lines)"

        chunks.append(Chunk(
            content=content,
            file_path=file_path,
            start_line=start_line,
            end_line=end_line,
            language=language,
            name=name,
        ))
        # Don't recurse into matched nodes (avoids double-counting nested funcs)
        return chunks

    for child in node.children:
        chunks.extend(_extract_chunks_from_tree(child, source_bytes, file_path, language, target_types))

    return chunks


def _fallback_chunks(content: str, file_path: str, language: str) -> list[Chunk]:
    """Line-based chunking with overlap for unsupported file types."""
    lines = content.splitlines()
    chunks = []
    i = 0
    while i < len(lines):
        end = min(i + FALLBACK_CHUNK_LINES, len(lines))
        chunk_lines = lines[i:end]
        chunks.append(Chunk(
            content="\n".join(chunk_lines),
            file_path=file_path,
            start_line=i + 1,
            end_line=end,
            language=language,
        ))
        i += FALLBACK_CHUNK_LINES - FALLBACK_OVERLAP_LINES
    return chunks


def chunk_file(file_path: str, content: str, rel_path: str) -> list[Chunk]:
    """
    Chunk a single file. Uses tree-sitter AST parsing when available,
    falls back to line-based chunking.
    """
    ext = Path(file_path).suffix.lower()

    # Skip minified / binary extensions
    for skip_ext in SKIP_EXTENSIONS:
        if file_path.endswith(skip_ext):
            return []

    if not content.strip():
        return []

    language = EXT_TO_LANG.get(ext)

    if language and TREE_SITTER_AVAILABLE and language in CHUNK_NODE_TYPES:
        try:
            parser = get_parser(language)
            source_bytes = content.encode("utf-8")
            tree = parser.parse(source_bytes)
            target_types = set(CHUNK_NODE_TYPES[language])
            chunks = _extract_chunks_from_tree(tree.root_node, source_bytes, rel_path, language, target_types)
            if chunks:
                return chunks
            # If no meaningful nodes found (e.g. script-level file), fall back
        except Exception:
            pass

    # Fallback: line-based
    return _fallback_chunks(content, rel_path, language or "text")
