"""
FastAPI application entry point.
"""

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

from ingest import ingest_repo
from query import query_repo

app = FastAPI(title="Code Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class IngestRequest(BaseModel):
    github_url: str


class QueryRequest(BaseModel):
    question: str
    repo_id: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ingest")
async def ingest(req: IngestRequest):
    """
    Stream ingestion progress as Server-Sent Events.
    The final event includes repo_id needed for queries.
    """
    if not req.github_url.startswith("https://github.com/"):
        raise HTTPException(status_code=400, detail="Only GitHub URLs are supported (https://github.com/...)")

    async def event_stream():
        async for event in ingest_repo(req.github_url):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/query")
async def query(req: QueryRequest):
    """
    Stream query response as Server-Sent Events.
    First event: sources. Subsequent events: tokens. Final event: done.
    """
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    if not req.repo_id.strip():
        raise HTTPException(status_code=400, detail="repo_id is required")

    return StreamingResponse(
        query_repo(req.question, req.repo_id),
        media_type="text/event-stream",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
