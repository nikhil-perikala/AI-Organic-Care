<<<<<<< HEAD
# Organic Care AI

**Personalized organic-food and wellness companion powered by RAG.**

The user tells the app how they feel — tired, bloated, stressed, fighting a cold — and the app returns three personalized meal recommendations with a clear, evidence-grounded explanation of why those foods help.

---

## Architecture

```
User Query
    │
    ▼
[Angular 17 Frontend]
    │  POST /api/v1/recommendations
    ▼
[FastAPI Backend]
    │
    ├─► Detect Ailments (ailment_mappings table)
    │
    ├─► Embed Query (OpenAI text-embedding-3-small)
    │
    ├─► Vector Search (pgvector HNSW)
    │       ├── knowledge_chunks  →  context for LLM
    │       └── recipes           →  candidates
    │
    ├─► Re-rank Recipes (vector sim + ailment overlap + efficacy)
    │
    ├─► Generate Explanation (gpt-4o-mini, RAG context)
    │
    └─► Return: 3 recipes + shopping list + AI explanation + session
```

### Two-Pipeline Design

| Pipeline | When | What |
|---|---|---|
| **Ingestion** (offline) | Weekly full / daily incremental | Web crawl → USDA API → PDF → Clean → Chunk → Embed → Store to pgvector |
| **Retrieval** (online) | Every user query | Embed → HNSW search → Re-rank → LLM → Stream to user |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 17 (Signals, standalone, Angular Material) |
| Backend | FastAPI 0.111, Python 3.12, SQLAlchemy 2.0 async |
| Database | PostgreSQL 16 + pgvector (HNSW index) |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) |
| LLM | OpenAI `gpt-4o-mini` (streaming SSE) |
| Auth | JWT (access + refresh tokens, bcrypt) |
| Ingestion | Custom Python scheduler (weekly full, daily incremental) |
| CI/CD | GitHub Actions |

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- OpenAI API key

### 1. Clone & configure

```bash
git clone <repo-url>
cd AI_Organic_Care
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

### 2. Start all services

```bash
docker-compose up -d
```

This starts:
- `db` — PostgreSQL 16 with pgvector
- `redis` — Redis (session cache)
- `backend` — FastAPI on `http://localhost:8000`
- `ingestion` — Ingestion scheduler (runs curated seed on startup)
- `frontend` — Angular on `http://localhost:4200`

### 3. Run migrations

```bash
docker-compose exec backend alembic upgrade head
```

### 4. Seed the database

```bash
# Seed curated knowledge (10 evidence-based nutrition articles)
docker-compose exec backend python -m ingestion.pipeline

# Seed 8 organic recipes with embeddings
docker-compose exec backend python -m ingestion.seed_recipes
```

### 5. Open the app

```
http://localhost:4200
```

Try: **"I'm tired"** → get 3 organic meal recommendations.

---

## Development Setup (without Docker)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL=postgresql+asyncpg://organic_user:organic_pass@localhost:5432/organic_care
export OPENAI_API_KEY=sk-...

# Run migrations
alembic upgrade head

# Seed data
python -m ingestion.pipeline
python -m ingestion.seed_recipes

# Start API
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
ng serve  # Starts on http://localhost:4200 with API proxy to :8000
```

---

## API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | — | Register |
| POST | `/api/v1/auth/login` | — | Login → tokens |
| POST | `/api/v1/auth/refresh` | — | Refresh access token |
| GET | `/api/v1/users/me` | ✓ | Current user |
| PUT | `/api/v1/users/me/profile` | ✓ | Update wellness profile |
| POST | `/api/v1/recommendations` | optional | **Main RAG endpoint** |
| POST | `/api/v1/recommendations/stream` | optional | SSE streaming version |
| GET | `/api/v1/recipes` | — | List recipes (filter by ailment) |
| GET | `/api/v1/recipes/{id}` | — | Recipe detail |
| GET | `/api/v1/pantry` | ✓ | List pantry items |
| POST | `/api/v1/pantry` | ✓ | Add item |
| POST | `/api/v1/pantry/bulk` | ✓ | Bulk add |
| DELETE | `/api/v1/pantry/{id}` | ✓ | Remove item |
| POST | `/api/v1/feedback` | optional | Like/dislike/save recipe |
| GET | `/api/v1/feedback/saved` | ✓ | Saved recipes |

Interactive API docs: `http://localhost:8000/docs`

---

## Ingestion Pipeline

### Run manually

```bash
# Full ingestion (web + USDA + PDF)
docker-compose exec ingestion python -c "
import asyncio
from ingestion.pipeline import run_ingestion
asyncio.run(run_ingestion('full'))
"

# Curated knowledge only (fast seed)
docker-compose exec ingestion python -c "
import asyncio
from ingestion.pipeline import ingest_curated_knowledge
asyncio.run(ingest_curated_knowledge())
"
```

### Scheduled runs
- **Weekly** (Sunday 2am UTC): Full ingestion — web crawl + USDA + PDFs
- **Daily** (3am UTC): Incremental — new articles only

### Add custom PDFs

Place PDF files in `backend/data/pdfs/` — they are picked up on the next ingestion run.

### Add custom URLs

Edit `SEED_URLS` in `backend/ingestion/collectors/web_crawler.py`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | ✓ | OpenAI API key |
| `DATABASE_URL` | ✓ | PostgreSQL async URL |
| `SECRET_KEY` | ✓ | JWT signing secret (change in prod!) |
| `USDA_API_KEY` | optional | USDA FoodData Central API key |
| `OPENAI_CHAT_MODEL` | optional | Default: `gpt-4o-mini` |
| `TOP_K_CHUNKS` | optional | Knowledge chunks to retrieve (default: 8) |
| `TOP_K_RECIPES` | optional | Recipes to return (default: 3) |

---

## Project Structure

```
AI_Organic_Care/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app & lifespan
│   │   ├── config.py            # Settings (Pydantic)
│   │   ├── database.py          # AsyncEngine + session
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── schemas/             # Pydantic I/O schemas
│   │   ├── api/                 # Route handlers
│   │   ├── services/            # embedding, RAG, LLM, recommendations
│   │   └── core/                # JWT auth, dependencies
│   ├── ingestion/
│   │   ├── pipeline.py          # Main orchestrator
│   │   ├── scheduler.py         # Cron scheduler
│   │   ├── seed_recipes.py      # Curated recipe seeder
│   │   ├── collectors/          # Web, USDA, PDF
│   │   └── processors/          # Cleaner, chunker, embedder
│   ├── alembic/                 # DB migrations
│   └── tests/
├── frontend/
│   └── src/app/
│       ├── app.component.ts     # Shell with nav
│       ├── core/                # Services, guards, interceptors
│       └── features/            # home, auth, recommendations, pantry, profile
└── docker-compose.yml
```

---

## Core User Flow (Test Case)

1. User opens app → Home page with quick-symptom chips
2. Taps **"I'm tired"** → navigated to `/recommendations?q=...`
3. Backend:
   - Detects ailments: `["fatigue", "low energy"]`
   - Embeds query → HNSW search retrieves top 8 knowledge chunks
   - Retrieves top 3 recipes by `vector_sim + ailment_bonus + efficacy`
   - GPT-4o-mini generates personalized explanation
4. User sees:
   - Detected ailments
   - AI explanation (why iron, magnesium, and B vitamins help with fatigue)
   - Evidence summary with sources
   - 3 recipe cards with ingredients, nutrition, and pantry coverage
   - Shopping list for missing ingredients
   - Like / Dislike / Save buttons

---

## Security

- Passwords hashed with bcrypt (passlib)
- JWT tokens (access: 30min, refresh: 7 days)
- CORS restricted to configured origins
- All SQL uses parameterized queries (SQLAlchemy)
- No secrets in code — all from environment variables
- Input validation with Pydantic v2 on all endpoints
=======
# AI-Organic-Care
>>>>>>> b4384dfcc0bf93024f817f2e6a9d34a1a8618ebb
