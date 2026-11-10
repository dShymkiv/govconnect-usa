# Architecture — GovConnect USA (MVP)

Modular monolith (Node.js / Express) + React wallet UI + PostgreSQL (Docker).

```
Browser (React)  --HTTPS/JSON-->  Express API
                                      |
                      +---------------+----------------+
                      |               |                |
                 Auth / OTP      Wallet / QR      Agency adapters
                 (AAL1/AAL2)     (AES-GCM PII)    (DMV/IRS/UI mock)
                      |               |                |
                      +-------- PostgreSQL / JSON -----+
                                 audit_events
                                 schema_migrations
```

## Layers

| Layer | Responsibility |
|-------|----------------|
| `routes/` | HTTP, Zod validation, auth middleware |
| `services/` | Business rules (auth, wallet, gov services, vehicles) |
| `security/` | Encryption, JWT, passwords, audit |
| `repositories/` | JSON dump store **or** Postgres JSONB store |
| `migrations/` | Ordered SQL + `schema_migrations` ledger |

## Data model (Postgres)

Most domain tables use `id` + `payload JSONB` for flexible academic iteration while keeping UUID keys and indexes on extracted JSON paths (`email`, `phoneE164`, `userId`). Sensitive fields inside payloads are encrypted (`enc:v1:…`) before persistence.

Normalized exceptions:

- `sms_otps` — hashed/marker challenges, attempts, expiry
- `audit_events` — append-only security events + integrity HMAC

## Primary citizen flows

1. **2FA login** — password → SMS OTP → JWT (AAL2)
2. **Wallet** — list/view encrypted documents; optional present-to-verifier (consent + one-time code)
3. **Verify** — public `/verify/:code` consumes presentation and discloses minimal claims (QR scan optional; same-device verify link recommended for demos)
4. **Agency services** — DMV / IRS / unemployment adapters (required fields + wallet docs); DMV appointments send SMS confirmation
5. **Document requests / vehicles** — certificates, dual-party marriage, SS-4, fines

## Storage drivers

`STORAGE_DRIVER=postgres` (recommended) or `json` for offline demos. Same service code path via `repositories/store.js`.
