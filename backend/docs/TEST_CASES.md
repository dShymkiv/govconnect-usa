# Test cases — GovConnect USA

Formal test catalog for the master’s project. Automated cases run via `npm test` (Node.js built-in test runner). IDs are stable for thesis / advisor traceability.

## How to run

```bash
cd backend
npm test
```

Tests use an isolated temp `GC_DATA_DIR`, `STORAGE_DRIVER=json`, and `SMS_PROVIDER=mock` (OTP `devCode` returned). They do **not** touch Postgres or Twilio.

---

## 1. Security unit tests (`tests/security.test.js`)

| ID | Title | Steps | Expected |
|----|-------|-------|----------|
| TC-SEC-01 | AES-GCM round-trip + tamper detect | Encrypt DOB; decrypt; flip ciphertext bytes | Decrypt OK; tampered payload throws |
| TC-SEC-02 | Selective field encryption | Encrypt only `phone` on object | `phone` is `enc:v1:…`; `email` plaintext |
| TC-SEC-03 | Password policy length | `assertPasswordPolicy('short')` | Rejects (< 12 chars) |
| TC-SEC-04 | bcrypt verify | Hash `DemoPass123!`; verify correct/wrong | true / false |
| TC-SEC-05 | JWT type separation | Sign access + refresh; verify cross-type | Access verifies; refresh-as-access throws |
| TC-SEC-06 | Audit HMAC integrity | Hash record; change `action` | Digest changes |

---

## 2. Authentication API (`tests/api.auth.test.js`)

| ID | Title | Steps | Expected |
|----|-------|-------|----------|
| TC-AUTH-01 | Health public | `GET /health` | 200, `storage=json` |
| TC-AUTH-02 | Password login = AAL1 | `POST /auth/login` valid creds | 200, `assurance.aal=AAL1`, factors=`[password]` |
| TC-AUTH-03 | Bad password | Login with wrong password | 401 `INVALID_CREDENTIALS` |
| TC-AUTH-04 | OTP gated by password | Request OTP without / with wrong password | 400 validation / 401 `AUTH_INVALID` |
| TC-AUTH-05 | 2FA login = AAL2 | OTP request → verify with `devCode` + password | 200, `assurance.aal=AAL2`, factors password+sms |
| TC-AUTH-06 | Wrong OTP | Request then verify `000000` | 401 `OTP_INVALID` |
| TC-AUTH-07 | `/me` authz | Call without token; with token | 401 then 200 profile |
| TC-AUTH-08 | Refresh rotation + reuse | Login → refresh → reuse old refresh | Second refresh 401 `REFRESH_REUSE` |

### Manual / demo (Twilio)

| ID | Title | Steps | Expected |
|----|-------|-------|----------|
| TC-AUTH-M1 | Real SMS 2FA | UI: phone `+13129609078` + `DemoPass123!` → SMS code | SMS arrives; wallet opens; JWT AAL2 |
| TC-AUTH-M2 | Wrong password UI | Correct phone, wrong password | Error; no SMS sent |

---

## 3. Wallet + QR verify (`tests/api.wallet.test.js`)

| ID | Title | Steps | Expected |
|----|-------|-------|----------|
| TC-WALLET-01 | List wallet | Authenticated `GET /wallet` | 1 mDL; number masked |
| TC-WALLET-02 | Wallet requires auth | `GET /wallet` no token | 401 |
| TC-WALLET-03 | Document detail | `GET /wallet/:id` | Full name + document number |
| TC-WALLET-04 | Create presentation | `POST /wallet/present` | 201 + `presentationCode` + TTL + disclosed/withheld fields |
| TC-WALLET-05 | One-time verify | Verify code twice | First 200 valid; second 410 `PRESENTATION_USED` |
| TC-WALLET-06 | Unknown code | `GET /verify/not-a-real-code` | 404 `PRESENTATION_NOT_FOUND` |

### Manual / demo

| ID | Title | Steps | Expected |
|----|-------|-------|----------|
| TC-WALLET-M1 | Present / verify UI | Open document → consent → Create presentation → **Open verify page** (or paste code) | Valid claims + disclosure panel; new code needed after use |
| TC-WALLET-M2 | Phone QR (optional) | Same Wi‑Fi; scan LAN verify URL from QR | Works only if API reachable on LAN (`HOST=0.0.0.0`); not required for daily services |
| TC-WALLET-M2 | Expired QR | Wait >2 min then verify | 410 expired |

---

## 4. Agency services (`tests/api.services.test.js`)

| ID | Title | Steps | Expected |
|----|-------|-------|----------|
| TC-SVC-01 | Catalog filter | `GET /services/catalog?category=dmv` | Only DMV services |
| TC-SVC-02 | DMV renewal w/ mDL | Submit `dmv-license-renewal` | 201 accepted + DMV confirmation |
| TC-SVC-03 | Unemployment required fields | Submit empty payload; then wage + reason | 400 VALIDATION_ERROR; then submitted estimate 400 |
| TC-SVC-08 | Appointment required fields | Empty booking; then full date/place/purpose | 400; then APT- confirmation |
| TC-WALLET-07 | Security audit feed | Present document then GET `/security/audit` | Events include `WALLET_PRESENTATION_CREATED` + integrity preview |
| TC-SVC-04 | IRS refund year | Submit taxYear 2024 | Result includes year 2024 |
| TC-SVC-05 | Missing wallet doc | User without mDL submits DMV renewal | 400 `MISSING_WALLET_DOCUMENT` |
| TC-SVC-06 | Request history | Submit IRS then list `?category=irs` | Prior request returned |

### Manual / demo

| ID | Title | Steps | Expected |
|----|-------|-------|----------|
| TC-SVC-M1 | Drawer DMV/IRS/UI | Login → each service tab → submit | Confirmation appears under Recent submissions |
| TC-SVC-M2 | Vehicle renewal needs registration | User without vehicleRegistration | 400 missing document |

---

## 5. Injection / validation (`tests/api.injection.test.js`)

| ID | Title | Steps | Expected |
|----|-------|-------|----------|
| TC-INJ-01 | Table allowlist | `tableFor("users; DROP…")` | Throws `Unknown collection` |
| TC-INJ-02 | Login email SQLi strings | Login with classic SQLi emails | 400 `VALIDATION_ERROR` (Zod email) |
| TC-INJ-03 | Path UUID SQLi | `GET /wallet/<injection>` | 400 validation, no 500 |
| TC-INJ-04 | Service id/category SQLi | Bad category + evil serviceId | 400 validation |
| TC-INJ-05 | OTP non-numeric | code `1' OR '1'='1` | 400 validation |
| TC-INJ-06 | Verify code SQLi/path | Malformed codes | 400 validation |
| TC-INJ-07 | Prototype pollution payload | Submit IRS with `__proto__` | Normal 201; no admin elevation |
| TC-INJ-08 | Missing UUID still parameterized | Random UUID document | 404 `DOC_NOT_FOUND` |

---

## Traceability to grading criteria

| Advisor review point | Covered by |
|---------------------|------------|
| End-to-end identity → wallet → QR → verify | TC-AUTH-05, TC-WALLET-01..05, TC-WALLET-M1 |
| ≥3 simulated government integrations | TC-SVC-01..06 (DMV, IRS, unemployment) |
| Security / NIST AAL mapping | TC-AUTH-02 vs TC-AUTH-05, TC-SEC-*, TC-AUTH-08 |
| Engineering practice (automated tests) | `npm test` suite above |
