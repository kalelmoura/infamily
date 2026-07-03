# infamily

Internal management system for the **inf.amily** clothing store (inventory, sales,
fiado/store-credit, and a financial summary), plus a public landing page.

See [`docs/SPEC.md`](docs/SPEC.md) for the full specification and
[`CLAUDE.md`](CLAUDE.md) for project conventions.

> **Status:** Phase 0 (scaffolding). No auth or database wired up yet.

## Stack

- **Frontend** — Next.js (App Router) + TypeScript + Tailwind → deploys to Vercel.
- **Backend** — FastAPI (Python) → deploys to Render.
- **Database & Auth** — Supabase (Postgres + Supabase Auth), added in later phases.

The frontend talks to the FastAPI backend over HTTPS; only the backend touches the database.

## Repository layout

```
frontend/   Next.js app (landing page + /login placeholder for now)
backend/    FastAPI app (package structure, config, deps — main.py is written by you)
docs/       SPEC.md (source of truth)
```

## Running locally

### Frontend

```bash
cd frontend
cp .env.example .env.local   # first time only; fill in values as phases need them
npm install                  # first time only
npm run dev
```

Open <http://localhost:3000> — the landing page shows the brand, the tagline
"por família – pra família", and a discreet **Acesso administrativo** link to
`/login` (a placeholder until Phase 1).

### Backend

```bash
cd backend
python3 -m venv .venv        # first time only
source .venv/bin/activate
pip install -r requirements.txt   # first time only
cp .env.example .env         # first time only
uvicorn app.main:app --reload --port 8000
```

> `app/main.py` (the FastAPI app + CORS + `/health` route) is not scaffolded —
> it's yours to write. See the snippet in the Phase 0 notes below.

#### Testing `/health`

Once `app/main.py` exists and the server is running:

```bash
curl http://localhost:8000/health     # expect: {"status":"ok"}
```

Or open <http://localhost:8000/docs> for FastAPI's interactive Swagger UI.

#### Starter `app/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

app = FastAPI(title="inf.amily API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}
```

## Environment variables

Real values live in gitignored files (`frontend/.env.local`, `backend/.env`);
commit only the `.env.example` templates.

| Side     | Variable                               | Notes                                  |
|----------|----------------------------------------|----------------------------------------|
| Frontend | `NEXT_PUBLIC_API_URL`                  | FastAPI base URL (`http://localhost:8000`). |
| Frontend | `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project URL (Phase 1).        |
| Frontend | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (Phase 1).    |
| Backend  | `FRONTEND_ORIGIN`                      | Allowed CORS origin (`http://localhost:3000`). |
| Backend  | `DATABASE_URL`                         | Postgres connection string (Phase 1+). |
| Backend  | `SUPABASE_JWKS_URL`                    | Token verification endpoint (Phase 1). |

The Supabase secret key and `DATABASE_URL` are **backend-only** — never in the frontend.
