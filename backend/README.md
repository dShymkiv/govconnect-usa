# GovConnect USA — Backend (MVP)

Node.js / Express prototype for a U.S. “Дія”-style digital identity wallet and mock e-government services.

**Storage today:** JSON dump files in `data/` (PostgreSQL later).  
**Focus this phase:** security foundations (encryption at rest, auth tokens, audit, rate limits).

## Quick start

```bash
cd backend
cp .env.example .env   # if needed — a local .env may already exist
npm install
npm run seed
npm run dev
```

API: `http://127.0.0.1:3001`

### Demo user

- Email: `alex.citizen@example.com`
- Password: `DemoPass123!`

## Main endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | no | Liveness |
| POST | `/api/v1/auth/register` | no | Register (IAL1) |
| POST | `/api/v1/auth/login` | no | Login → access + refresh JWT |
| POST | `/api/v1/auth/refresh` | no | Rotate tokens |
| POST | `/api/v1/auth/logout` | no | Revoke refresh |
| GET | `/api/v1/auth/me` | Bearer | Profile + IAL/AAL |
| GET | `/api/v1/wallet` | Bearer | Document wallet (masked) |
| GET | `/api/v1/wallet/:id` | Bearer | Full document (owner) |
| POST | `/api/v1/wallet/present` | Bearer | Create QR presentation code |
| GET | `/api/v1/verify/:code` | no* | Verifier consumes one-time code |
| GET | `/api/v1/services/catalog` | no | Mock service catalog |
| POST | `/api/v1/services/requests` | Bearer | Submit mock DMV/IRS/UI request |
| GET | `/api/v1/services/requests` | Bearer | List own requests |

\*Public but rate-limited.

### Example: login → wallet

```bash
curl -s http://127.0.0.1:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alex.citizen@example.com","password":"DemoPass123!"}'
```

Use `accessToken` as `Authorization: Bearer <token>`.

## Postman

Import [`postman/GovConnect_USA_Backend.postman_collection.json`](postman/GovConnect_USA_Backend.postman_collection.json) — see [`postman/README.md`](postman/README.md) for the demo order.

## Project layout

```
backend/
  data/                 # generated dumps (gitignored)
  docs/SECURITY.md      # security decisions (read this)
  scripts/seed-data.js
  src/
    config/
    middleware/         # helmet/cors/rate-limit, auth
    routes/
    security/           # AES-GCM, bcrypt, JWT, audit
    services/           # auth, wallet, mock gov adapters
    repositories/       # JSON file store (DB adapter later)
```

## Security (summary)

See **[docs/SECURITY.md](docs/SECURITY.md)** for NIST IAL/AAL mapping and controls.

Highlights:

- AES-256-GCM field encryption for PII in dump files
- bcrypt passwords; short-lived JWT + refresh rotation
- Audit log: `data/audit-log.jsonl`
- Helmet, CORS allowlist, rate limits, Zod validation

## Next (later weeks)

- PostgreSQL — commented stubs ready:
  - `src/repositories/pgPool.js`
  - `src/repositories/pgStore.js`
  - `migrations/001_init.sql`
- OIDC-style IdP / MFA (move toward AAL2)
- Richer VC / mDL presentation
- Separate frontend repo (React)
- Docker Compose
