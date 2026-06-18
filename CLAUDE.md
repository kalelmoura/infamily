# inf.amily — Project Guide for Claude Code

## What this is
Internal management system for a clothing store (inf.amily, owner: Yasmin), plus a public landing page. Modules: Estoque (inventory), Vendas (sales with automatic stock deduction), Fiado (store credit / installments), Resumo (financial summary: entries + profit).

## Stack
- Monorepo: `frontend/` (Next.js, App Router, TypeScript, Tailwind -> Vercel) and `backend/` (FastAPI, Python -> Render).
- Database & Auth: Supabase (Postgres + Supabase Auth).
- The frontend talks to the FastAPI backend over HTTPS; the backend is the only thing that touches the database.

## Source of truth
- Follow `docs/SPEC.md` for all requirements, data model, endpoints, and rules.

## How I want you to work
- I'm learning FastAPI and backend development. Explain your key decisions and the structure as you go — teach, don't just generate.
- Use plan mode for anything non-trivial: show the plan, let me review, then implement.
- Work one phase of the roadmap at a time.

## Non-negotiables
- A sale runs in a single DB transaction: validate stock, decrement stock, insert the sale + items, and (if fiado) the fiado record — all or nothing.
- Snapshot product prices (cost and sale price) onto sale_items at sale time; never recompute history from current prices.
- Stock never goes negative — block the sale if quantity exceeds stock.
- Verify Supabase auth tokens against the JWKS endpoint (asymmetric signing keys), not a shared secret.
- RLS stays enabled on all tables.
- Money is stored as NUMERIC; dates handle month-end correctly and use America/Sao_Paulo for "today".

## Security
- Never hardcode or commit secrets. All keys and connection strings live in env vars (`.env` files, gitignored).
- The Supabase secret key and DB connection string are backend-only — never in the frontend or client code.