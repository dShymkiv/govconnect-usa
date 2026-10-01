# GovConnect USA

Prototype inspired by Ukraine’s **Diia**: secure digital identity, document wallet, mock e-government services.

## What’s included

| Piece | Path |
|-------|------|
| Backend API | `backend/` |
| React UI (auth OTP + wallet) | `frontend/` |
| Docker Compose (Postgres + API + UI) | `docker-compose.yml` |

## Quick start (Docker — recommended)

```bash
docker compose up --build
```

- Frontend: http://localhost:5173  
- API: http://localhost:3001/health  
- Postgres: `localhost:5432` (`govconnect` / `govconnect_dev`)

**SMS login demo:** phone `+13125550142` — the UI shows a **dev mock code** (also printed in backend logs).

## Local without Docker

### Backend (JSON storage)

```bash
cd backend
cp .env.example .env   # or use existing .env
npm install
npm run seed
npm run dev
```

### Backend + Postgres only

```bash
docker compose up db -d
cd backend
# set in .env:
# STORAGE_DRIVER=postgres
# DATABASE_URL=postgres://govconnect:govconnect_dev@127.0.0.1:5432/govconnect
npm run migrate
npm run seed
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Auth flows

1. **SMS OTP** (primary UI): `POST /api/v1/auth/otp/request` → `POST /api/v1/auth/otp/verify`
2. **Email/password** (Postman): still available for demos

OTP codes are **HMAC-hashed at rest**, TTL-limited, attempt-limited; SMS uses a **mock gateway** (console log). Swap `smsGateway.js` for Twilio later.

## Security notes

See `backend/docs/SECURITY.md`.
