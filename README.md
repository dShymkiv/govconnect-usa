# GovConnect USA

Master’s Project prototype: a U.S. *Diia*-inspired **digital identity wallet** and mock e-government services, with a security-first Node/Express backend and React UI.

## Documentation (start here)

| Document | Description |
|----------|-------------|
| **[docs/README.md](docs/README.md)** | Full documentation index |
| [docs/DEFENSE_DOCUMENTATION.md](docs/DEFENSE_DOCUMENTATION.md) | Defense pack entry + demo script |
| [docs/presentation/GovConnect_USA_Defense.pptx](docs/presentation/GovConnect_USA_Defense.pptx) | Defense PowerPoint |
| [docs/presentation/GovConnect_USA_Defense.pdf](docs/presentation/GovConnect_USA_Defense.pdf) | Defense PDF |
| [docs/presentation/index.html](docs/presentation/index.html) | Defense slides (browser) |
| [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | Problem, scope, goals |
| [docs/REQUIREMENTS_TRACEABILITY.md](docs/REQUIREMENTS_TRACEABILITY.md) | Requirements ↔ evidence matrix |
| [docs/COMPARATIVE_ANALYSIS.md](docs/COMPARATIVE_ANALYSIS.md) | Diia vs U.S. rationale |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Citizen demo walkthrough |
| [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) | Setup, env, migrations, tests |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | REST API |
| [backend/docs/SECURITY.md](backend/docs/SECURITY.md) | NIST IAL/AAL & controls |
| [backend/docs/TEST_CASES.md](backend/docs/TEST_CASES.md) | Test case catalog |

## What’s included

| Piece | Path |
|-------|------|
| Backend API | `backend/` |
| React UI (2FA login + wallet + verify) | `frontend/` |
| Docker Compose (Postgres + optional stack) | `docker-compose.yml` |

## Quick start

### Postgres + local API/UI

```bash
docker compose up db -d
cd backend && npm install && npm run migrate && npm run seed && npm run dev
# other terminal
cd frontend && npm install && npm run dev
```

- UI: http://localhost:5173  
- API health: http://127.0.0.1:3001/health  

### Full Compose

```bash
docker compose up --build
```

## Auth (UI)

1. Phone + password  
2. SMS one-time code (Twilio Verify)  
3. Session mapped to **AAL2** for this prototype  

Seeded demo: `+13129609078` / `DemoPass123!` (Twilio trial: verify the phone in Console).

**Present / verify:** optional for using services; for demos use **Open verify page** after creating a presentation (phone QR needs same Wi‑Fi / LAN).

## Tests

```bash
cd backend && npm test   # 37 cases
```

## License

UNLICENSED — academic prototype for Northeastern Illinois University CS master’s project use.
