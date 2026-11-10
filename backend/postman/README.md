# Postman — GovConnect USA Backend

## Import

1. Open Postman → **Import**
2. Choose `GovConnect_USA_Backend.postman_collection.json`
3. Start API:

```bash
docker compose up db -d
cd backend
npm run migrate && npm run seed && npm run dev
```

## Demo order (for professor)

1. **00 — Health** → Health check  
2. **01 — Auth** → OTP request → OTP verify *(AAL2, auto-saves tokens)*  
   - Or **Login** for AAL1 tooling only  
3. **01 — Auth** → Me  
4. **02 — Wallet** → List → Get detail → Create presentation  
5. **03 — Verify** → first verify (OK) → second verify (410 replay)  
6. **04 — Services** → catalog + submit with **required** payload fields (empty `{}` → 400 where required)  
7. Optional: **05 — Negative** for security demos; Security audit `GET /security/audit`  

## Variables

| Variable | Default |
|----------|---------|
| `baseUrl` | `http://127.0.0.1:3001` |
| `accessToken` / `refreshToken` | set by OTP verify or Login |
| `documentId` | seeded mDL id |
| `presentationCode` | set by Create presentation |
| `otpCode` | set from mock `devCode` on OTP request |

Demo (mock SMS): `+13125550142` / `DemoPass123!`  
Email login: `alex.citizen@example.com` / `DemoPass123!`
