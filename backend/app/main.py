"""FastAPI application entry point.

    to run:
    uvicorn app.main:app --reload

In Phase 0 it wires up CORS (so the Next.js frontend can call the API) and
exposes a single health-check endpoint.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

# title (inf.amily API) = the instance is my app and the API menas the backend
app = FastAPI(title="inf.amily API") 
# app = object
# FastAPI = a class (blueprint for building an app)
# (..) constructori call, iniciating and instance from the blueprint

# Gives access to allow the frontend (and only the frontend) to call this API from the browser.
# The browser enforces CORS (web security measures), so this whitelist is what lets the Next.js app read responses from a different origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# configuring the the add_middleware method
# app.add_middleware = calling a method (func) from app, the FastAPI class
# CORSMiddleware = a class (blueprint for the CORS checkpoint)
# CORS "checkpoint" checks in each incoming browser request, the CORS rules (basically passes though the middleware I installed), eg: "is this origin on the allow-list?" and adds the response headers that tell the browser "yes, this origin is permitted."

# @ = decorator / this on top of a function changes how that function in used
# here it is registering tha function as a route (endpoint or path operation)
# /health = the path
# get = HTTP method (GET = "FETCH something")
@app.get("/health")
def health_check():
    """Liveness probe: confirms the service is up and serving requests."""
    return {"status": "ok"}

# If i click on .get pressing command, there is a doc saying:

"""
The URL path to be used for this *path operation*.

For example, in `http://example.com/items`, the path is `/items`.
"""

# meaning: if the user is in the URL http://localhost3000/health, for example
# it will return what is in that function
