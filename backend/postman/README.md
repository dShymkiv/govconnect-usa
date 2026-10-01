# Postman — GovConnect USA Backend

## Import

1. Open Postman → **Import**
2. Choose `GovConnect_USA_Backend.postman_collection.json`
3. Start API:

```bash
cd backend
npm run seed   # once (or after wiping data/)
npm run dev
```

## Demo order (for professor)

1. **00 — Health** → Health check  
2. **01 — Auth** → Login *(auto-saves tokens)*  
3. **01 — Auth** → Me  
4. **02 — Wallet** → List → Get detail → Create QR presentation  
5. **03 — Verify** → first verify (OK) → second verify (410 replay)  
6. **04 — Services** → catalog + any Submit  
7. Optional: **05 — Negative** for security demos  

## Variables

| Variable | Default |
|----------|---------|
| `baseUrl` | `http://127.0.0.1:3001` |
| `accessToken` / `refreshToken` | set by Login tests |
| `documentId` | seeded mDL id |
| `presentationCode` | set by Create QR |

Demo user: `alex.citizen@example.com` / `DemoPass123!`
