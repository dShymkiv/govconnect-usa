# Threat model sketch (NIST-inspired)

Scope: GovConnect USA MVP — citizen web wallet, SMS+password login, mock agency APIs.

## Assets

- Citizen PII (DOB, address, document numbers, phone)
- Authentication secrets (password hashes, JWT signing keys, DEK)
- Session tokens and one-time document presentation codes (verify link / optional QR)
- Audit trail integrity

## Adversaries

- Remote attacker on the public API
- Stolen device / stolen SMS inbox
- Insider with DB dump access (no DEK)
- Replay of QR / refresh tokens

## STRIDE highlights

| Category | Example | Control |
|----------|---------|---------|
| Spoofing | Fake login | Password + Twilio Verify OTP; rate limits |
| Tampering | Alter audit rows | HMAC `integrity` on events; append-only insert path |
| Repudiation | Deny service submit | `agency_applications` + `audit_events` |
| Information disclosure | Read JSONB dump | AES-GCM field encryption; redaction |
| Denial of service | Flood OTP | Auth/verify rate limits; OTP cooldown |
| Elevation of privilege | Use AAL1 session as AAL2 | Session AAL bound to refresh token / auth event |

## Residual risks (honest for the thesis)

- SMS is not phishing-resistant (NIST prefers AAL2 phishing-resistant authenticators for high risk)
- JSONB document store is flexible but weaker than fully normalized relational PII columns with column ACLs
- No production KMS; DEK lives in env
- Mock agencies are not authorization servers; they trust the API’s authenticated user id
