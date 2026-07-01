"""FastAPI application entry point.

This module builds the app instance that uvicorn serves:
    uvicorn app.main:app --reload

In Phase 0 it wires up CORS (so the Next.js frontend can call the API) and
exposes a single health-check endpoint. Feature routers are added in later
phases via `app.include_router(...)`.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

app = FastAPI(title="inf.amily API")

# Allow the frontend (and only the frontend) to call this API from the browser.
# The browser enforces CORS, so this whitelist is what lets the Next.js app
# read responses from a different origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    """Liveness probe: confirms the service is up and serving requests."""
    return {"status": "ok"}
