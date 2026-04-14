# Cybot — CLAUDE.md

## Project Overview

Cybot is a **cybersecurity AI assistant platform** with three main components:

- **Frontend** — React Native / Expo mobile app (iOS + Android)
- **Backend** — Django 5 REST API with AI/ML capabilities
- **Blockchain** — Solidity smart contracts on Polygon (PoS) via Hardhat

The app provides threat detection, privacy audits, an AI chatbot (GPT-4o), ML-based threat analysis, and on-chain data provenance verification.

---

## Repository Structure

```
cybot/
├── frontend/          # Expo React Native app
│   ├── src/
│   │   ├── screens/   # HomeScreen, ChatbotScreen, ThreatsScreen, etc.
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── hooks/
│   │   ├── navigation/ # AppNavigator.tsx
│   │   ├── services/  # API clients
│   │   ├── store/
│   │   └── utils/
│   ├── App.tsx
│   └── package.json
├── backend/           # Django 5 REST API
│   ├── core/          # Settings, middleware, Supabase client, URLs
│   ├── users/         # Auth, user management
│   ├── threats/       # Threat management + CybotChatbot (GPT-4o)
│   ├── privacy_audit/ # Privacy scanning
│   ├── blockchain_verify/ # On-chain hash verification
│   ├── ml_models/     # TensorFlow threat detection
│   └── requirements.txt
├── blockchain/        # Hardhat project (Polygon)
│   ├── contracts/DataVerifier.sol
│   └── scripts/
├── nginx/             # Reverse proxy config
├── supabase/          # Supabase config / edge functions
└── docker-compose.yml
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native 0.83, Expo ~55, TypeScript |
| Navigation | React Navigation v7 (bottom tabs + native stack) |
| Auth / DB | Supabase (PostgreSQL via transaction pooler port 6543) |
| Backend | Django 5, Django REST Framework, Gunicorn |
| AI Chatbot | OpenAI GPT-4o |
| ML / Detection | TensorFlow 2.20, scikit-learn |
| Blockchain | Solidity ^0.8.24, Hardhat, Polygon PoS |
| Cache / Rate-limit | Redis 7 |
| Proxy | Nginx |
| Container | Docker Compose |
| Deployment | AWS ECS (`ecs-task-definition.json`) |

---

## API Routes (Backend)

Base path: `/api/v1/`

| Prefix | App | Purpose |
|---|---|---|
| `users/` | `users` | Auth, registration, profile |
| `threats/` | `threats` | Threat CRUD, chatbot (`/chat/`) |
| `privacy/` | `privacy_audit` | Privacy scan results |
| `blockchain/` | `blockchain_verify` | Hash submission/verification |
| `ml/` | `ml_models` | Threat detection inference |
| `health/` | `core` | Liveness / readiness probes |

---

## Development Setup

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in required values
python manage.py migrate
python manage.py runserver
```

Required `.env` keys: `DJANGO_SECRET_KEY`, `DATABASE_URL` (Supabase pooler URL), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `REDIS_URL`.

### Frontend

```bash
cd frontend
npm install
npx expo start          # development server
npx expo run:ios        # iOS simulator
npx expo run:android    # Android emulator
```

### Blockchain

```bash
cd blockchain
npm install
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.js --network amoy   # testnet
```

### Full Stack (Docker)

```bash
docker compose up --build
```

Nginx listens on port 80, proxies to the Django backend. Redis runs on 6379 (internal only). Database is **not** containerised — it is managed by Supabase.

---

## Key Architecture Decisions

- **Auth is Supabase-managed.** The Django backend uses `SupabaseAuthMiddleware` (core/middleware.py) to validate JWT tokens from Supabase on every request. There is no Django session-based auth for API calls.
- **Zero-Trust middleware** (`ZeroTrustMiddleware`) runs after auth on every request.
- **Database uses the Supabase transaction pooler** on port 6543 (not the direct connection on 5432). `conn_max_age=60` is intentional for pooler compatibility.
- **Blockchain provenance** — `DataVerifier.sol` on Polygon stores SHA-256/keccak256 hashes of sensitive data for tamper-evident audit trails. The contract is append-only.
- **ML threat detection** — TensorFlow model lives in `ml_models/` with a `feature_extractor.py` + `threat_detector.py` pipeline. Training script is `train.py`.
- **CybotChatbot** wraps GPT-4o with a cybersecurity system prompt. It persists conversation history to Supabase `chat_logs` and maintains the last 5 exchange pairs as context.

---

## Testing

### Backend

```bash
cd backend
pytest                          # all tests
pytest tests/ -v                # verbose
pytest --cov=. --cov-report=html  # coverage
```

Config: `pytest.ini` + `conftest.py`. Uses `factory-boy` for fixtures. Tests use `pytest-django`.

### Frontend

```bash
cd frontend
npm test                  # jest --watchAll
npm test -- --coverage    # with coverage
```

Test files live in `src/__tests__/`. Uses `@testing-library/react-native`.

### Blockchain

```bash
cd blockchain
npx hardhat test
```

---

## Deployment

- **Backend + Nginx**: AWS ECS. Task definition at `ecs-task-definition.json`.
- **Frontend**: Expo EAS Build (`eas.json`). Build profiles defined there.
- **Blockchain**: Polygon mainnet via `deploy:polygon` script. Verify with `npm run verify`.

---

## Security Notes

- Brute-force protection via `django-axes`.
- Rate limiting via `django-ratelimit` + Redis.
- Never commit `.env` files. All secrets via environment variables.
- The `DataVerifier` contract is ownable — rotate the owner key via `transferOwnership()` if compromised.
- OpenAI key scoped to backend only; never exposed to frontend.
