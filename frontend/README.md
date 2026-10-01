# GovConnect USA — Frontend

Diia-inspired React UI for phone SMS login + digital document wallet.

## Run locally

```bash
# terminal 1 — API
cd ../backend && npm run seed && npm run dev

# terminal 2 — UI
cd ../frontend
npm install
npm run dev
```

Open http://localhost:5173

Demo phone: `+13125550142` — the OTP step shows a **dev mock code**.

## Design notes

- Visual language inspired by Ukraine’s Diia web portal (bold brand mark, Manrope as stand-in for e-Ukraine, minimal chrome)
- Document cards echo Diia wallet cards (dark gradient ID-style tiles)
- Motion: hover lift on cards, modal fade/rise

## Env

`VITE_API_URL` — default `http://127.0.0.1:3001`
