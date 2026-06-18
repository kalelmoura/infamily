# Technical Specification — inf.amily
## Inventory, Sales, Fiado, and Financial Summary

> Store project: **inf.amily** (Yasmin's clothing store). An internal management tool with four modules — Inventory, Sales, Fiado, and Financial summary — protected by login, plus a public landing page.
> **This document contains no code.** It describes what to build and how, leaving implementation to the development phase.

> **Language convention:** This spec and all development (code, comments, identifiers, commit messages, prompts) are in English. All user-facing UI text is in Brazilian Portuguese (pt-BR). Portuguese strings that must appear in the product are shown in quotes and marked as UI text.

---

## 1. System objective

inf.amily is a clothing store. Today its control is manual (paper), which causes collections to be lost and makes it impossible to reliably know how much stock there is, how much has been sold, and how much profit was made.

The system replaces that manual control with a simple, secure web tool covering the store's operational cycle: register what is in stock, record sales that automatically deduct from stock, track who bought on credit (fiado) and when they will pay, and see entries and profit directly. It also has a public landing page presenting the brand.

The single primary user of the internal system is Yasmin, the store owner, who is not tech-savvy. This keeps the central design constraint: **radical simplicity** — few pieces of information per screen, short flows, large and obvious buttons. Every product decision leans toward the simpler option.

MVP success: the owner can, unaided, (a) register an item, (b) record a sale that deducts from stock, (c) record and collect a fiado, and (d) see how much came in and how much was earned.

---

## 2. Module overview

The system has a public part (landing page) and an internal part protected by login with four modules. The internal modules connect through one central idea: **every product leaving the store is a "sale,"** whether paid immediately or on credit. Understanding this avoids duplicating logic.

**Landing page (public).** Presents the inf.amily brand with the tagline (UI, pt-BR) "por família – pra família" and basic store info. In the future it will display available items (not now). It has a discreet admin access link to the internal login.

**Inventory (UI: "Estoque").** Registers items with three essential pieces of information: the price the owner paid for the item (cost), the price she will sell it for, and the quantity in stock. It is the foundation of everything — sales and fiado consume stock, and profit comes from the difference between sale price and cost.

**Sales (UI: "Vendas").** The owner selects one or more items (with quantity), the system **automatically deducts from stock**, and she records the payment method and date. A sale can be paid immediately (cash, pix, card) or be a fiado.

**Fiado (store credit / installments; UI: "Fiado" / "Clientes").** When a sale is on credit, besides deducting stock the system records the debt: the person's name, the items taken, the agreed settlement date, the payment frequency (weekly, biweekly, or monthly), and the number of installments. The owner tracks who is overdue and marks installments as paid. In practice this is the store's "clients" view — the list of who bought and what they owe.

**Financial summary (UI: "Resumo").** Automatically tallies entries (money received) and profit (sale price minus cost, over what was sold), plus what is still to be received from fiado.

### Central decision: a Sale and a Fiado are the same underlying event

Rather than treating Sales and Fiado as two separate systems (which would duplicate stock deduction and item recording), the model is unified:

- A **sale** always records the items, deducts stock, and computes the total.
- If the payment method is immediate, it counts as an entry right away.
- If the payment method is **fiado**, the same sale additionally creates a **fiado record** with the installment terms, and entries accrue as installments are paid.

In the UI this appears as **two distinct flows** ("Registrar venda" and "Registrar fiado"), because that matches how the owner thinks — but underneath it is the same data model. This keeps the interface simple without messing up the logic.

---

## 3. System architecture

A three-tier architecture, with a clear boundary between the public part (landing page) and the internal part protected by login.

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER                                                      │
│   inf.amily landing (public)        Internal system (login)   │
└───────────────┬───────────────────────────┬──────────────────┘
                │  HTTPS                       │  HTTPS + JWT (Bearer)
                ▼                             ▼
        ┌───────────────┐            ┌──────────────────┐
        │  FRONTEND      │  ──────►   │  BACKEND          │
        │  Next.js + TS  │  REST/JSON │  FastAPI (Python) │
        │  (Vercel)      │            │  (Render/Railway) │
        └───────┬────────┘            └─────────┬────────┘
                │  Supabase Auth                  │  Postgres connection
                │  (login/session/JWT)            │  + JWT verification (JWKS)
                ▼                                ▼
        ┌──────────────────────────────────────────────┐
        │  SUPABASE: Auth + PostgreSQL                    │
        └──────────────────────────────────────────────┘
```

The **Next.js frontend** covers the whole interface — public landing and internal screens. Authentication happens directly between the frontend and **Supabase Auth**. The **FastAPI backend** concentrates all business logic (inventory, stock deduction on a sale, fiado/overdue calculation, financial summary) and **has no login screen of its own** — it only verifies the Supabase token on every protected request. **Supabase** hosts the database and the authentication service.

> Architecture decision: the backend is a **persistent** service (not serverless), because it keeps a database connection and runs multi-step transactions (stock deduction + sale creation + fiado creation must be atomic). Hence Render/Railway/Fly.io, and Vercel only for the frontend.

---

## 4. Technical stack

Mandatory per the project; recommended libraries as guidance.

**Frontend** — Next.js (App Router) + TypeScript. Lean styling (Tailwind CSS recommended, no heavy component kits), large touch targets. `@supabase/ssr` for the auth session (cookies). Deployed on **Vercel**.

**Backend** — Python + **FastAPI** + Pydantic v2 (validation). Database access via SQLAlchemy + `asyncpg`. **Sale operations must run in a transaction** (see section 16). `python-dateutil` for installment date math. `PyJWT` (with its JWKS client) to verify Supabase tokens against the project's JWKS endpoint. Deployed on **Render** (recommended), with Railway/Fly.io as alternatives.

**Database** — **Supabase PostgreSQL**, with RLS enabled as defense in depth.

**Auth keys (current Supabase model)** — Supabase now uses a **publishable key** (`sb_publishable_...`, public, used by the frontend) and a **secret key** (`sb_secret_...`, server-side only), replacing the legacy anon/service_role keys. Token verification uses **asymmetric signing keys**: the backend fetches Supabase's public keys from the **JWKS URL** to verify a token's signature — there is no shared secret to store.

**Deploy** — Frontend on Vercel; backend on Render/Railway/Fly.io; database on Supabase. All with HTTPS by default.

**Environment variables (where each goes):**
- Frontend (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL` (the FastAPI base URL).
- Backend (`.env`): `DATABASE_URL` (Postgres connection string), `SUPABASE_JWKS_URL` (to verify tokens), `FRONTEND_ORIGIN` (allowed CORS origin). Optional: `SUPABASE_URL` and `SUPABASE_SECRET_KEY` if the backend ever calls the Supabase API directly (server-side only).

---

## 5. Database model

Authentication is managed by Supabase Auth (`auth.users`) and does not need to be modeled. The domain has four entities with simple relationships. Table and column names are in English (they are code identifiers).

### Relationships

```
products (1) ──< (N) sale_items (N) >── (1) sales
sales (1) ──── (0 or 1) fiado_accounts
```

A sale (`sales`) has many items (`sale_items`); each item points to one product (`products`). A **fiado** sale has exactly one `fiado_accounts` record; immediate sales have none.

### Table `products` (Inventory)

| Field            | Type            | Constraints              | Description                              |
|------------------|-----------------|--------------------------|------------------------------------------|
| `id`             | UUID            | PK                       | Item identifier.                         |
| `name`           | TEXT            | NOT NULL                 | Item name.                               |
| `cost_price`     | NUMERIC(10,2)   | NOT NULL, >= 0           | Price paid for the item (cost).          |
| `sale_price`     | NUMERIC(10,2)   | NOT NULL, >= 0           | Selling price.                           |
| `stock_quantity` | INTEGER         | NOT NULL, >= 0           | Quantity in stock.                       |
| `created_at`     | TIMESTAMPTZ     | NOT NULL, default now    | Creation.                                |
| `updated_at`     | TIMESTAMPTZ     | NOT NULL, default now    | Last update.                             |

### Table `sales` (Sales)

| Field            | Type            | Constraints                                 | Description                                       |
|------------------|-----------------|---------------------------------------------|---------------------------------------------------|
| `id`             | UUID            | PK                                          | Sale identifier.                                  |
| `sale_date`      | DATE            | NOT NULL                                    | Sale date.                                        |
| `payment_method` | TEXT            | NOT NULL, ∈ {dinheiro, pix, cartao, fiado}  | Payment method (values are domain codes).         |
| `total_amount`   | NUMERIC(10,2)   | NOT NULL                                    | Sum of items at sale price (snapshot).            |
| `total_cost`     | NUMERIC(10,2)   | NOT NULL                                    | Sum of item costs (snapshot, for profit).         |
| `created_at`     | TIMESTAMPTZ     | NOT NULL, default now                       | Creation.                                         |

`total_amount` and `total_cost` are computed at sale time from the items and stored (denormalized) so the financial summary is fast and history stays stable even if prices change later.

### Table `sale_items` (sale line items)

| Field             | Type            | Constraints               | Description                                  |
|-------------------|-----------------|---------------------------|----------------------------------------------|
| `id`              | UUID            | PK                        | Line item identifier.                        |
| `sale_id`         | UUID            | FK → sales, NOT NULL      | Sale this item belongs to.                   |
| `product_id`      | UUID            | FK → products, NOT NULL   | Product sold.                                |
| `quantity`        | INTEGER         | NOT NULL, > 0             | Quantity sold.                               |
| `unit_sale_price` | NUMERIC(10,2)   | NOT NULL                  | Sale price **at sale time** (snapshot).      |
| `unit_cost_price` | NUMERIC(10,2)   | NOT NULL                  | Cost **at sale time** (snapshot).            |

Price snapshotting is essential: if the owner later changes an item's price, past sales and historical profit must **not** change.

### Table `fiado_accounts` (Fiado)

| Field                    | Type            | Constraints                             | Description                                                  |
|--------------------------|-----------------|-----------------------------------------|--------------------------------------------------------------|
| `id`                     | UUID            | PK                                      | Fiado identifier.                                            |
| `sale_id`                | UUID            | FK → sales, NOT NULL, UNIQUE (1:1)      | Sale that originated the fiado (holds the items taken).      |
| `customer_name`          | TEXT            | NOT NULL                                | Person's name.                                               |
| `frequency`              | TEXT            | NOT NULL, ∈ {weekly, biweekly, monthly} | Payment frequency.                                           |
| `installments_count`     | INTEGER         | NOT NULL, > 0                           | Number of installments.                                      |
| `installment_amount`     | NUMERIC(10,2)   | NOT NULL                                | Installment value (auto = total ÷ count; see section 16).    |
| `agreed_settlement_date` | DATE            | NOT NULL                                | Agreed settlement date (fixed reference).                    |
| `next_due_date`          | DATE            | NOT NULL                                | Next installment due (advances on each payment).             |
| `remaining_balance`      | NUMERIC(10,2)   | NOT NULL, >= 0                          | Remaining balance (starts at the sale total).                |
| `created_at`             | TIMESTAMPTZ     | NOT NULL, default now                   | Creation.                                                    |
| `updated_at`             | TIMESTAMPTZ     | NOT NULL, default now                   | Last update.                                                 |

`next_due_date` is initialized with `agreed_settlement_date` and advances by the frequency on each paid installment. `remaining_balance` starts equal to the sale's `total_amount`.

### Fiado status (derived, NOT stored)

Computed at read time from `next_due_date` and `remaining_balance`, compared against the current date in the store's timezone. UI labels in parentheses (pt-BR):
- **Paid off** (UI: "quitado"): `remaining_balance <= 0`.
- **Overdue** (UI: "em atraso"): `next_due_date < today` AND `remaining_balance > 0`.
- **Due soon** (UI: "a vencer"): `next_due_date` within the next N days (suggest 7) AND `remaining_balance > 0`.
- **Current** (UI: "em dia"): any other case with balance > 0.

### Financial summary figures (derived, computed on demand)

No new table; everything is computed from `sales`, `sale_items`, and `fiado_accounts`:
- **Profit on sales** = Σ `(unit_sale_price − unit_cost_price) × quantity` over all `sale_items`. (That is: sale price minus cost, summed over everything sold.)
- **Total sold** = Σ `sales.total_amount`.
- **Received (entries)** = Σ `total_amount` of immediate sales + Σ `(total_amount − remaining_balance)` of fiados.
- **To receive (open fiado)** = Σ `fiado_accounts.remaining_balance`.

---

## 6. Folder structure

A repository with two top-level folders (frontend and backend), each with its own deploy.

```
inf-amily/                     # (brand displayed as: inf.amily)
├── frontend/                  # Next.js (Vercel)
│   ├── app/
│   │   ├── (public)/
│   │   │   └── page.tsx               # inf.amily landing (/)
│   │   ├── (internal)/                # Login-protected group
│   │   │   ├── layout.tsx             # Session guard + navigation
│   │   │   ├── dashboard/page.tsx     # Overdue + due soon + low stock
│   │   │   ├── estoque/
│   │   │   │   ├── page.tsx           # Item list
│   │   │   │   ├── nova/page.tsx      # Create item
│   │   │   │   └── [id]/page.tsx      # Item detail / edit
│   │   │   ├── vendas/
│   │   │   │   ├── page.tsx           # Sales history
│   │   │   │   ├── nova/page.tsx      # Record a sale (immediate)
│   │   │   │   └── fiado/page.tsx     # Record a fiado sale
│   │   │   ├── fiado/
│   │   │   │   ├── page.tsx           # Fiado list (clients / collection)
│   │   │   │   └── [id]/page.tsx      # Fiado detail + mark installment paid
│   │   │   └── resumo/page.tsx        # Financial summary
│   │   ├── login/page.tsx             # Admin login
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   ├── lib/
│   │   ├── api.ts                     # HTTP client (attaches JWT)
│   │   └── supabase.ts
│   ├── types/
│   ├── .env.local
│   └── package.json
│
└── backend/                   # FastAPI (Render/Railway/Fly.io)
    ├── app/
    │   ├── main.py                    # App + CORS
    │   ├── config.py
    │   ├── database.py
    │   ├── auth.py                    # JWT verification (JWKS)
    │   ├── models/                    # products, sales, sale_items, fiado
    │   ├── schemas/                   # Pydantic schemas
    │   ├── routers/
    │   │   ├── products.py
    │   │   ├── sales.py
    │   │   ├── fiado.py
    │   │   ├── dashboard.py
    │   │   └── summary.py
    │   └── services/
    │       ├── stock.py               # Stock deduction/validation
    │       ├── payments.py            # Installment payment + date advance
    │       ├── status.py              # Derived status
    │       └── finance.py             # Summary calculation
    ├── requirements.txt
    └── .env
```

---

## 7. Pages

The **Landing page** (`/`, public) is the brand's front door. In the MVP it contains the inf.amily identity, the tagline (UI, pt-BR) "por família – pra família", basic store info, a WhatsApp/contact button, and a **discreet admin access link** (to the login). It shows no internal data. It should be structured so it can later host a **product showcase** — but that showcase is **not built now** (see section 14).

The **login screen** (`/login`, public) — admin login with email and password and a sign-in button. Reached from the discreet link on the landing. On success it redirects to the dashboard.

The **dashboard** (`/dashboard`, protected) — the first screen after login: overdue fiados at the top (red), then fiados due soon, and a simple low/zero stock notice. No charts.

**Inventory** — item list (`/estoque`) showing name, sale price, and quantity (highlighting low stock); create (`/estoque/nova`) with name, cost, sale price, and quantity; detail/edit (`/estoque/[id]`) of the same fields.

**Sales** — record an immediate sale (`/vendas/nova`): select items and quantities, watch the total update, choose payment method and date, confirm (deducts stock); record a fiado (`/vendas/fiado`): same item selection, plus the person's name, agreed date, frequency, and number of installments; sales history (`/vendas`) as a simple list.

**Fiado / clients** — fiado list (`/fiado`), the clients/collection screen: who owes, status (overdue/due soon/paid off), next date, and balance; detail (`/fiado/[id]`): items taken, terms, balance, next date, and the "mark installment as paid" button.

**Financial summary** (`/resumo`, protected) — four direct numbers: profit on sales, total sold, received (entries), and to receive. Optional simple period filter over sales.

> All user-facing labels, titles, buttons, and messages on these screens are in Brazilian Portuguese.

---

## 8. Backend endpoints (FastAPI)

All data endpoints require a valid Supabase token in `Authorization: Bearer <token>`. **There is no login endpoint on the backend** — login happens on the frontend against Supabase Auth.

### Inventory
| Method | Route                     | Description                                                       |
|--------|---------------------------|-------------------------------------------------------------------|
| GET    | `/api/products`           | List items (with a low-stock indicator).                          |
| POST   | `/api/products`           | Create an item (name, cost, sale price, quantity).                |
| GET    | `/api/products/{id}`      | Item detail.                                                      |
| PATCH  | `/api/products/{id}`      | Edit an item (including manual stock adjustment).                 |
| DELETE | `/api/products/{id}`      | Remove an item (blocked/warned if it has sales history).          |

### Sales
| Method | Route                     | Description                                                                                 |
|--------|---------------------------|---------------------------------------------------------------------------------------------|
| GET    | `/api/sales`              | List sales (optional period filter).                                                        |
| POST   | `/api/sales`              | Create a sale: items (product + quantity) + payment method + date. **In a transaction**: validate stock, deduct, snapshot prices, compute totals. If `payment_method = fiado`, also create the fiado record with the received terms. |
| GET    | `/api/sales/{id}`         | Sale detail with items.                                                                     |

### Fiado
| Method | Route                     | Description                                                                                |
|--------|---------------------------|--------------------------------------------------------------------------------------------|
| GET    | `/api/fiado`              | List fiados with derived status (clients / collection).                                    |
| GET    | `/api/fiado/{id}`         | Detail: client, items taken, terms, balance, next date.                                    |
| PATCH  | `/api/fiado/{id}`         | Edit client/terms of the fiado.                                                            |
| POST   | `/api/fiado/{id}/pay`     | Record an installment payment: reduce the balance by the installment amount (never negative) and advance the next date if a balance remains. |

### Dashboard and Summary
| Method | Route                     | Description                                                                        |
|--------|---------------------------|------------------------------------------------------------------------------------|
| GET    | `/api/dashboard`          | Overdue fiados + due soon + low/zero stock items.                                  |
| GET    | `/api/summary`            | Financial summary: profit, total sold, received, to receive (optional period params). |
| GET    | `/health`                 | Health check (not protected).                                                      |

---

## 9. Main frontend components

The **AuthGuard / protected layout** checks the session before rendering internal screens.

The **ProductForm** (create and edit item) and **ProductListItem** (inventory list row); the **StockBadge** flags low/zero stock.

The **SaleForm** with a **ProductPicker** (select items and quantities, total updating live), **PaymentMethodSelect**, and a date picker. Reused by both the immediate-sale and fiado flows, with extra fiado fields when applicable.

The **FiadoForm** (person's name, agreed date, frequency, number of installments), the **FiadoListItem**, and the **PayInstallmentButton** (mark installment paid, with a simple confirmation).

The **StatusBadge** (reused): red for overdue, amber for due soon, neutral for current, subtle for paid off.

The **SummaryCards** for the financial summary: one large, legible card per number (profit, total sold, received, to receive).

The **api client** (`lib/api.ts`) centralizes backend calls and attaches the JWT.

---

## 10. Authentication flow

Supabase Auth is the identity provider; the backend does not manage passwords. Entry happens through the public landing.

1. The owner reaches the public inf.amily landing. To enter the system she uses the discreet admin access, which leads to `/login`.
2. At `/login` she enters email and password; the frontend (using the **publishable key**) sends them to Supabase Auth, which returns an access token (JWT) and a refresh token.
3. The session is stored with `@supabase/ssr`, preferring cookies over `localStorage`.
4. On entering the internal area, any protected route checks the session; without a valid session it redirects back to `/login`.
5. Each backend call carries the access token in `Authorization: Bearer`. The backend verifies the JWT — signature, expiry, issuer/audience — using Supabase's public keys fetched from the **JWKS URL** (asymmetric signing keys; no shared secret). Invalid or missing token → 401.
6. The refresh token renews the session automatically on expiry.
7. Logout ends the session and returns to the landing.

Only one authorized user: Yasmin's account is created once in the Supabase dashboard, and **new-user signup is disabled**.

---

## 11. Security rules

These cover inventory, sales, and client data.

**HTTPS everywhere** — Vercel, Render/Railway/Fly.io, and Supabase provide TLS by default; no route accepts plain HTTP.

**Authentication delegated to Supabase Auth** — passwords are handled and stored (hashed) by Supabase; the system never implements this itself. Signup disabled.

**JWT verification on the backend for every protected route** — the main authorization gate; without a valid token, no operation runs. Verification uses the project's JWKS endpoint.

**Strict secret separation** — the frontend only knows the Supabase URL and the publishable key. The **secret key and the database connection string live only on the backend**, in the provider's environment variables, never exposed to the browser.

**CORS restricted** — the backend only accepts requests from the frontend domain.

**RLS enabled as defense in depth** — being honest: because the backend connects to Postgres with an owner-level role, RLS is bypassed on that path; the real protection is keeping the connection string and secret key secret, verifying the JWT, and restricting CORS. Even so, RLS stays enabled as a safety net in case any access goes through the publishable key or a direct connection.

**Input validation with Pydantic** — types, required fields, allowed frequency and payment-method values, non-negative amounts, installment count > 0.

**Sensitive data out of the frontend** — no client or financial data in frontend code, URL parameters, or logs. The public landing accesses no internal data.

---

## 12. Implementation roadmap

Sequence prioritizing getting the inventory → sale → deduction cycle working early, because everything depends on inventory.

**Phase 0 — Foundation.** Supabase project (database + Auth), Yasmin's single account, environment variables, frontend (Vercel) and backend (Render) skeletons, `/health` responding.

**Phase 1 — Authentication.** Admin login with Supabase Auth, session via `@supabase/ssr`, route guarding, and JWT verification on the backend (against the JWKS endpoint).

**Phase 2 — Inventory.** `products` table and item CRUD. Done when: the owner creates, lists, and edits items with cost, sale price, and quantity.

**Phase 3 — Sales (immediate).** `sales` and `sale_items` tables; record a sale with item selection, stock deduction in a transaction, price snapshotting, and total computation. Done when: recording a sale correctly reduces stock and the sale appears in history.

**Phase 4 — Fiado.** `fiado_accounts` table; the fiado-sale flow (same stock deduction + fiado creation) and installment payment (balance + date advance + status). Done when: record a fiado, see it in collection, mark an installment paid, and watch the status change.

**Phase 5 — Dashboard.** Overdue at the top (red), due soon, and a low-stock notice.

**Phase 6 — Financial summary.** Endpoint and screen with profit, total sold, received, and to receive.

**Phase 7 — Landing page + hardening + deploy.** Public inf.amily landing with the tagline "por família – pra família", contact/WhatsApp, and discreet admin access (the product showcase is deferred). Review CORS/secrets/RLS/HTTPS, test the full flow in production, and polish usability for the non-technical user.

---

## 13. MVP v1 (scope)

What ships in the first release:

1. Public inf.amily landing with the tagline "por família – pra família", basic info, contact/WhatsApp, and discreet admin access.
2. Secure admin login (single user) via Supabase Auth.
3. Inventory: create, list, and edit items with cost, sale price, and quantity.
4. Immediate sales: select items, automatically deduct stock, record payment method and date.
5. Fiado/clients: credit sale with stock deduction, client record, items taken, agreed date, frequency, and installment count; collection with overdue status and a mark-installment-paid button.
6. Dashboard with overdue, due soon, and low stock.
7. Financial summary with profit, total sold, received, and to receive.
8. HTTPS, JWT verification, restricted CORS, separated secrets, and RLS enabled.

All kept as simple as possible in screens and flows.

---

## 14. Future improvements

Deliberately deferred:

1. **Product showcase on the landing** — a public, read-only section showing available items, reusing the inventory data. Explicitly out of the MVP.
2. **Payment history** (a ledger table) — enables undoing a mistakenly recorded payment and accurate per-period financial reports (including fiado receipts, which in the MVP enter only as a total).
3. **Sale return / cancellation** — reverse a sale and return items to stock.
4. **Product variants** (size, color, SKU, barcode) and camera/scanner input.
5. **Alerts and notifications** for low stock and due installments (email/WhatsApp).
6. **WhatsApp collection reminders** and a per-client "send WhatsApp" link.
7. **Archive items and clients** (soft delete) preserving history.
8. **Search and pagination** in inventory, sales, and fiado as volume grows.
9. **Reports and charts** (sales per period, best-selling items) — out of the MVP for simplicity.
10. **Multi-user / multi-store** and a **mobile app / PWA**.

---

## 15. What to avoid (keeping it from getting too complex)

A complexity brake — the development agent should actively resist the following.

**Do not build the product showcase now.** The MVP landing is identity + tagline + login access. Public item display is future work.

**Do not duplicate sale and fiado logic.** Fiado is a sale with deferred payment; use the unified model (section 2) instead of two separate paths that both deduct stock.

**Do not store status or totals that can go stale.** Fiado status and summary figures are derived at read time.

**Do not build a full accounting system.** The summary is four direct numbers (profit, total sold, received, to receive), not a ledger with categories and reports.

**Do not allow a sale without stock.** Validate availability before confirming the sale; block if an item is short.

**Do not recompute profit from current prices.** Use the prices snapshotted at sale time, or changing a price corrupts history.

**Do not create product variants, categories, or barcodes in the MVP.** An item is just name, cost, price, and quantity.

**Do not invent your own authentication** — use Supabase Auth.

**Do not over-engineer frontend state** — React local state plus server data fetching is enough; no Redux.

**Do not use heavy UI kits or dense screens** — a flat interface, few fields per screen, large buttons, designed for a non-technical user.

**Do not hard-delete an item that has sales,** and do not treat deletion as a central feature; the recommended long-term path is archiving.

**Do not expose secrets in the frontend** — the secret key and connection string stay on the backend only.

---

## 16. Critical implementation notes (gotchas)

Subtle points that are commonly implemented wrong.

**Sale atomicity (transaction).** Recording a sale involves several steps: validate stock, deduct each item, write the sale and its items, and — if fiado — create the fiado record. All of this must run in **a single database transaction**: if any step fails (e.g., insufficient stock mid-way), nothing is written and stock is unchanged.

**Price snapshot.** Store `unit_sale_price` and `unit_cost_price` on the sale item at the moment the sale happens. Historical profit is based on these values, not the item's current price.

**Validate stock before deducting.** If the requested quantity exceeds availability, block the sale with a clear message. Stock never goes negative.

**Installment value and rounding.** `installment_amount = total ÷ number of installments`. When it does not divide evenly, round to 2 decimals and make the **last installment absorb the difference**, so the installments sum to the total. The balance never goes negative: on the last installment, clamp to zero rather than allowing a negative value.

**Monthly date advance and end of month.** Adding "1 month" is not adding 30 days — use a calendar routine (`relativedelta`), so an installment due on Jan 31 moves to the last day of February, not spilling into March. Weekly (+7) and biweekly (+14) are simple day arithmetic.

**Date does not advance after payoff.** Only advance `next_due_date` if a balance remains after the payment.

**Timezone for overdue calculation.** "Today" is determined in the store's timezone (`America/Sao_Paulo`), not UTC, so the comparison with `next_due_date` (a date without time) does not err by a few hours.

**Profit definition (accrual basis).** "Profit on sales" counts the margin as soon as an item leaves (including fiado not yet received). How much money actually came in is shown separately as "received," and what is still owed as "to receive." If the owner prefers to count profit only on what has been paid, that is a decision to adjust before development.

**Currency formatting.** Store amounts as decimal (NUMERIC) in the database; format as R$ on the frontend, with a comma decimal separator (pt-BR). Do not do money math with imprecise floating point.

**Confirmation on data-changing actions.** Marking an installment paid, confirming a sale, and deleting an item should have a simple confirmation to avoid accidental clicks, without cluttering the screen with warnings.