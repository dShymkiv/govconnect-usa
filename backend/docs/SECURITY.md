# Security notes — GovConnect USA (MVP backend)

This document tracks security decisions for the academic prototype. It is intentionally concise for early weeks and will expand with the NIST threat model and CCPA privacy review.

## Goals (from project proposal)

- Encryption in transit and at rest
- Audit logging
- Identity assurance mapped to **NIST SP 800-63-3** (IAL / AAL)
- Privacy-by-design aligned with CCPA-style principles
- Mock/sandbox integrations only (no real agency systems)

## Current assurance levels

| Control | MVP value | Notes |
|--------|-----------|--------|
| IAL | **IAL1** | Self-asserted registration; no remote identity proofing yet |
| AAL | **AAL1** | Single-factor password; MFA planned later for AAL2 |
| Session | Short-lived JWT access (15m) + rotatable refresh | Reduces stolen-token window |
| At-rest PII | AES-256-GCM field encryption in JSON dumps | Key via `DATA_ENCRYPTION_KEY` |
| Passwords | bcrypt (cost 12+) | Never store plaintext |
| Transport | TLS required in deployment | Local HTTP only for development |

Raising IAL/AAL is future work (document verification, IdP federation like Login.gov patterns, TOTP/WebAuthn).

## Controls implemented now

1. **Helmet** security headers; API CSP `default-src 'none'`
2. **CORS** allowlist (`CORS_ORIGINS`)
3. **Rate limiting** — global + stricter auth + verify endpoints
4. **Input validation** with Zod
5. **JWT** access/refresh separation; refresh rotation + revocation list
6. **Field-level encryption** for PII in dump files / JSONB payloads
7. **Audit log** (`data/audit-log.jsonl` or `audit_events` table)
8. **Response hygiene** — no stack traces; password hashes never returned; SSN/bank fields redacted from service payloads
9. **Presentation QR codes** — 2-minute TTL, one-time use (anti-replay)
10. **Body size limit** (32kb) to reduce oversized-payload DoS
11. **SMS OTP** — HMAC-hashed codes, TTL, max attempts, resend cooldown. Provider: **Twilio** when `TWILIO_*` env vars are set (`SMS_PROVIDER=auto|twilio|mock`). Otherwise mock console gateway. Do not enable `OTP_DEV_RETURN_CODE=true` with real Twilio SMS.

## Explicit non-goals for this week

- Full OAuth2/OIDC IdP (will evolve auth module toward OIDC)
- W3C VC cryptographic suites / ISO 18013-5 full mdoc
- PostgreSQL + disk encryption at volume level
- Production key management (HSM / KMS)
- Penetration test report (later semester week)

## Threat highlights (starter list)

| Threat | Mitigation now | Later |
|--------|----------------|-------|
| Credential stuffing | Auth rate limit, bcrypt | MFA, lockout policy |
| Token theft | Short TTL, refresh rotation | Binding, HttpOnly cookies |
| PII dump exposure | Field encryption | DB + KMS + backups policy |
| QR replay | One-time + TTL | Device engagement, reader auth |
| Excessive collection | Minimal fields, payload redaction | CCPA data inventory / DSAR APIs |

## Demo credentials

See README — demo passwords are for local prototype only; never reuse in real systems.
