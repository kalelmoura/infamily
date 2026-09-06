# Production security checklist

Use this checklist before the first production deployment and after any change
to authentication, dependencies, database access, or hosting configuration.

## GitHub

- Push the sanitized `feat/landing-page-redesign` branch, not a backup ref or
  an older local branch containing superseded landing-page commits.
- Require the `Security and build checks` workflow to pass before merging.
- Enable Dependabot alerts, secret scanning, and push protection in the
  repository security settings when the repository plan supports them.
- Protect `main` against direct pushes and require pull-request review.

## Vercel frontend

Configure these variables for Production. Configure them for Preview as well
only when preview deployments should connect to the corresponding services.

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | HTTPS Render API origin, with no trailing slash. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL; public by design. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key; never use the secret key here. |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Digits only, including country and area codes. |
| `NEXT_PUBLIC_INSTAGRAM_URL` | Public profile URL; optional because the page has a fallback. |
| `STORE_ADDRESS` | Displayed publicly but kept out of source control. |
| `OWNER_USER_ID` | Same Supabase Auth UUID used by the backend; server-only. |

Redeploy after changing an environment variable. Confirm `/painel` redirects
to `/login` in a signed-out browser and that the owner can still sign in.

## Render backend

The root `render.yaml` defines the build command, start command, `/ready`
health check, and variable names. Populate every `sync: false` value in the
Render dashboard:

| Variable | Notes |
| --- | --- |
| `FRONTEND_ORIGIN` | Exact HTTPS Vercel or custom origin, with no trailing slash. |
| `SUPABASE_JWKS_URL` | Project Auth JWKS endpoint. |
| `OWNER_USER_ID` | Same UUID configured on Vercel. |
| `DATABASE_URL` | Backend-only SQLAlchemy/asyncpg connection string with TLS. |
| `SUPABASE_URL` | Supabase project URL used by Storage. |
| `SUPABASE_SECRET_KEY` | Backend-only secret key; never expose it to Vercel or the browser. |

`ENVIRONMENT=production` and the default product-photo bucket are defined in
the blueprint. After deployment, confirm `/health` and `/ready` return 200,
while `/docs`, `/redoc`, and `/openapi.json` return 404.

## Supabase

- Create and verify the owner account, then disable new-user signups and
  anonymous sign-ins in Auth settings.
- Confirm the Auth user's UUID exactly matches `OWNER_USER_ID` on both hosts.
- Enable MFA on the Supabase dashboard account and its recovery/backup factor.
- Review Security Advisor and confirm RLS is enabled on `products`, `sales`,
  `sale_items`, `clients`, and `fiado_accounts`, with no unintended public
  policies.
- Enable database SSL enforcement and network restrictions where the selected
  plan supports them.
- Keep `product-photos` public only because it contains public merchandise
  images. Set a 10 MB bucket limit and allow only JPEG, PNG, and WEBP uploads.
- Confirm database backup retention and periodically test a restore. Database
  backups do not include Storage objects, so back up product photos separately
  if they cannot be recreated.

Application-level MFA for the owner requires an enrollment/challenge screen
and backend enforcement of an `aal2` token. Do not enable mandatory application
MFA until that flow exists and has been tested, or the owner could be locked
out.

## Release verification

Run the same checks as CI locally when preparing a release:

```bash
cd frontend
npm ci
npm audit
npm run lint
npm run build
```

```bash
cd backend
uv run --with-requirements requirements-dev.txt python -m pip_audit -r requirements.txt
uv run --with-requirements requirements-dev.txt python -m pytest -q
```

Smoke-test the complete production flow: owner login, product create/edit and
photo upload, client create/edit, immediate and fiado sales, insufficient-stock
rejection, installment payment, financial summary, public catalogue filtering,
and signed-out rejection from internal pages.
