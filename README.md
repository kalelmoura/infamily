<div align="center">

# inf.amily

**A full-stack retail management system built for a real clothing business.**

[Live site](https://infamily.store) · Built with Next.js, FastAPI, PostgreSQL & Supabase

</div>

---

## What it is

inf.amily replaces paper-based store management with one responsive system for inventory, sales, customers, store credit, and financial reporting. I designed and built it around a non-technical owner's daily workflow: short forms, clear language, large touch targets, and the information that needs attention first.

The public landing page presents the clothing brand; the protected application handles the store's day-to-day operations in Brazilian Portuguese.

> The [live site](https://infamily.store) shows the public brand experience. The management area is restricted to the store owner because it contains real customer and business data.

## What I built

- **Daily dashboard** — highlights overdue and upcoming payments alongside low-stock products.
- **Inventory management** — create, update, search, and safely remove products while tracking cost, sale price, and quantity.
- **Sales workflow** — records multi-item sales, supports per-item discounts, and deducts stock automatically.
- **Customer records** — keeps contact details, notes, purchase history, and outstanding balances together.
- **Fiado (store credit)** — creates installment plans, calculates due dates and balances, flags overdue accounts, and records payments.
- **Financial summary** — reports total sold, inventory and sold-goods cost, profit, money received, and money still owed.
- **Responsive public site** — a mobile-first brand experience with direct WhatsApp and Instagram contact paths.

## Engineering highlights

- **Atomic, concurrency-safe sales.** Product rows are locked with `SELECT ... FOR UPDATE`; stock validation, stock deduction, price snapshots, sale items, and an optional fiado account are committed once as a single transaction. A failed sale writes nothing, and simultaneous sales cannot oversell the last unit.
- **Accurate history.** Cost and sale prices are copied onto each sale item at checkout, so past revenue and profit never change when a product's current price changes.
- **Secure owner-only access.** Supabase manages cookie-based sessions. The FastAPI backend independently verifies each JWT's signature, expiry, issuer, and audience against Supabase's JWKS, then enforces a user-ID allowlist. Row Level Security remains enabled on every table.
- **Correct money and dates.** PostgreSQL `NUMERIC` and Python `Decimal` avoid floating-point errors. Installment schedules use calendar-aware month arithmetic and the store's São Paulo timezone.
- **Clear separation of concerns.** FastAPI routers handle HTTP, Pydantic schemas validate inputs, service modules own business rules, SQLAlchemy manages async persistence, and Alembic versions the database schema.

## Architecture

```text
Browser
  └── Next.js + TypeScript (Vercel)
        ├── Supabase Auth (cookie session)
        └── HTTPS + JWT
              └── FastAPI + SQLAlchemy
                    └── Supabase PostgreSQL
```

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Backend | FastAPI, Pydantic, async SQLAlchemy, PyJWT |
| Data | PostgreSQL, Alembic migrations, Row Level Security |
| Auth | Supabase Auth with asymmetric JWKS verification |
| Deployment | Vercel, Render, Supabase |

## Run locally

Clone the repository, then copy each example environment file and add your own Supabase and database values.

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

The API runs at [http://localhost:8000](http://localhost:8000). Interactive API docs are available at `/docs` in development and disabled in production.

See [`docs/SPEC.md`](docs/SPEC.md) for the complete data model, API contract, and business rules.

## License

[MIT](LICENSE)
