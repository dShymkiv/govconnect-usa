# GovConnect USA — Frontend

Diia-inspired React UI: password + SMS 2FA login, digital document wallet, optional present-to-verifier (verify link / QR), DMV/IRS/unemployment services, security evidence.

## Run locally

```bash
# terminal 1 — API (Postgres)
docker compose up db -d
cd ../backend && npm run migrate && npm run seed && npm run dev

# terminal 2 — UI
cd ../frontend
npm install
npm run dev
```

Open http://localhost:5173

### Demo login

- Phone: `+13129609078` — password `DemoPass123!` — SMS code via Twilio Verify  
- Or `+13125550142` — same password — mock OTP (`devCode` in UI when SMS provider is mock)

## Env

`VITE_API_URL` — default `http://127.0.0.1:3001`  
`VITE_PUBLIC_APP_URL` — optional public UI origin for verify links in QR (otherwise LAN origin is injected in dev)

## Present / verify (thesis demo)

Presenting a document is **optional** for using DMV/IRS services. For demos:

1. Open a wallet card → check consent → **Create one-time presentation**  
2. Prefer **Open verify page** (new tab on the same computer)  
3. Phone QR scan needs the same Wi‑Fi and a LAN URL (not `localhost`)
