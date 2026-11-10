# Security notes — GovConnect USA

Security decisions for the master’s prototype, mapped to **NIST SP 800-63-3/B** and CCPA-style privacy-by-design. Mock/sandbox agency integrations only.

## Assurance levels

| Control | Value | How achieved |
|--------|--------|----------------|
| **IAL** | **IAL1** | Self-asserted registration / seeded profiles; no remote identity proofing |
| **AAL (UI login)** | **AAL2** | Password (something you know) + SMS OTP via Twilio Verify (something you have) |
| **AAL (email/password API)** | **AAL1** | Single-factor; kept for Postman demos — session AAL is bound to the *auth event* |
| Session | Access JWT 15m + rotating refresh | Stolen bearer window reduced; refresh reuse revokes all sessions |
| At-rest PII | AES-256-GCM field encryption | `DATA_ENCRYPTION_KEY` (32-byte hex); ciphertext `enc:v1:…` |
| Passwords | bcrypt cost ≥ 12 | Never stored or logged in plaintext |
| Transport | TLS in deployment | Local HTTP allowed only for development |

Session AAL is stored on the refresh-token record and re-issued on refresh. Elevating an account via 2FA does **not** upgrade an existing password-only session.

## Controls implemented

1. Helmet security headers; API CSP `default-src 'none'`
2. CORS allowlist (`CORS_ORIGINS`)
3. Global + stricter auth/verify rate limits
4. Zod input validation on mutating routes
5. JWT access/refresh separation; refresh rotation; **reuse detection** (revoke all sessions)
6. Field-level AES-GCM encryption for user/document PII
7. Append-only audit log (JSONL + `audit_events` in Postgres) with HMAC integrity digest
8. Response hygiene — no stack traces; hashes never returned; SSN/bank keys redacted from service payloads
9. Document presentations — ~2 min TTL, one-time consume (anti-replay); citizen consent before issue; selective disclosure metadata on verify
10. Body size limit 32kb
11. SMS OTP — Twilio Verify preferred; local challenges marked `2fa:`; attempt/TTL/cooldown limits
12. Config guards — distinct JWT secrets, 64-hex DEK, no OTP leak in production
13. Schema migrations ledger (`schema_migrations`) + CHECK/partial indexes on OTP/audit/tokens
14. **SQL injection defense** — all user values bound as `$1…$n` parameters (`pg`); table names only from an allowlist (`TABLE_MAP` / `tableFor`); never string-concatenated SQL with request input
15. **Input validation** — Zod schemas on bodies, query strings, and path params (UUID, E.164-like phone, numeric OTP, service/request enums, presentation-code charset)

## Threat model (selected)

| Threat | Mitigation now | Residual / later |
|--------|----------------|------------------|
| Credential stuffing | Auth rate limit, bcrypt | CAPTCHA, IP reputation |
| SMS OTP interception | Requires password first (2FA) | WebAuthn / TOTP step-up |
| Token theft | Short TTL, rotation, reuse kill-switch | HttpOnly cookies, DPoP |
| PII dump exposure | Field encryption | KMS/HSM, column-level ACLs |
| QR replay | One-time + TTL | Reader authentication (18013-5) |
| Audit tampering | HMAC integrity field | WORM storage / SIEM |
| Refresh token replay | Reuse → revoke all user sessions | Device binding |
| Excessive collection | Minimal fields, payload redaction | CCPA DSAR endpoints |

## Explicit non-goals (this semester slice)

- Full OAuth2/OIDC IdP / Login.gov federation
- W3C VC crypto suites / full ISO 18013-5 mdoc
- Production KMS/HSM
- Formal penetration-test report (can be Week 11–12 activity)

## Demo credentials

Seeded accounts use a shared demo password for local/Twilio trial demos only. Never reuse outside the prototype.
