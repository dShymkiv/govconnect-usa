# GovConnect USA — Backend

Node.js / Express API for a U.S. Diia-style digital identity wallet and mock e-government services.

**Storage:** PostgreSQL (recommended, Docker) or JSON dumps (`STORAGE_DRIVER=json`).  
**Auth (UI):** password + SMS OTP → **AAL2**. Email/password API login remains for tooling (**AAL1**).

## Quick start

```bash
# from repo root
docker compose up db -d

cd backend
cp .env.example .env   # set secrets + STORAGE_DRIVER=postgres + DATABASE_URL
npm install
npm run migrate
npm run seed
npm run dev
```

API: `http://127.0.0.1:3001` — health: `GET /health`.

### Demo accounts

| Phone / email | Password | Notes |
|---------------|----------|--------|
| `+13129609078` (Diana) | `DemoPass123!` | Twilio Verify SMS |
| `+13125550142` / `alex.citizen@example.com` | `DemoPass123!` | Mock OTP (`devCode`) when SMS is mock |

## Main endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | no | Liveness + storage driver |
| POST | `/api/v1/auth/register` | no | Register (IAL1) |
| POST | `/api/v1/auth/login` | no | Email/password → AAL1 tokens |
| POST | `/api/v1/auth/otp/request` | no | Phone + password → send SMS OTP |
| POST | `/api/v1/auth/otp/verify` | no | Phone + password + code → AAL2 tokens |
| POST | `/api/v1/auth/refresh` | no | Rotate tokens |
| POST | `/api/v1/auth/logout` | no | Revoke refresh |
| GET | `/api/v1/auth/me` | Bearer | Profile + IAL/AAL |
| GET | `/api/v1/wallet` | Bearer | Document wallet (masked) |
| GET | `/api/v1/wallet/:id` | Bearer | Full document (owner) |
| POST | `/api/v1/wallet/present` | Bearer | One-time presentation (verify link / optional QR) |
| GET | `/api/v1/verify/:code` | no | Consume presentation; selective disclosure |
| GET | `/api/v1/security/audit` | Bearer | Citizen audit evidence (HMAC preview) |
| GET | `/api/v1/verify/:code` | no* | Verifier consumes code |
| GET/POST | `/api/v1/services/...` | varies | Mock DMV / IRS / UI |
| GET/POST | `/api/v1/document-requests/...` | Bearer | Request docs into wallet |
| GET/POST | `/api/v1/vehicles/...` | Bearer | Vehicles + fines |

\*Public but rate-limited.

Full reference: [`../docs/API_REFERENCE.md`](../docs/API_REFERENCE.md).

## Tests & Postman

```bash
npm test
```

Import [`postman/GovConnect_USA_Backend.postman_collection.json`](postman/GovConnect_USA_Backend.postman_collection.json) — see [`postman/README.md`](postman/README.md).

## Security

See **[docs/SECURITY.md](docs/SECURITY.md)** (NIST IAL/AAL, encryption, audit, injection defenses).

Highlights:

- AES-256-GCM field encryption for PII
- bcrypt passwords; short-lived JWT + refresh rotation / reuse revoke
- Audit: JSONL + Postgres `audit_events` with HMAC integrity
- Helmet, CORS allowlist, rate limits, Zod validation, parameterized SQL
