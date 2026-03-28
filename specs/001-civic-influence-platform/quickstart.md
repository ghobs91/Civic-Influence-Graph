# Quickstart: Civic Influence Platform

Get the CIG platform running locally with docker-compose.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- 8 GB RAM minimum (16 GB recommended for OpenSearch + WebLLM)
- 20 GB free disk space (bulk FEC data)
- Node.js 20 LTS (for local development only)

## 1. Clone and Configure

```bash
git clone https://github.com/<your-org>/Civic-Influence-Graph.git
cd Civic-Influence-Graph
cp .env.example .env
```

Edit `.env` to set:

```dotenv
# Required
POSTGRES_PASSWORD=<strong-random-password>
FEC_API_KEY=<your-openfec-api-key>  # get from https://api.open.fec.gov/developers/

# Optional — restrict initial data scope
CIG_JURISDICTIONS=federal,CA,TX,NY,FL,IL
CIG_ELECTION_CYCLES=2024,2026
```

## 2. Start Services

```bash
docker compose up -d
```

This starts 6 services:

| Service | Port | Description |
|---------|------|-------------|
| postgres | 5432 | PostgreSQL 16 + Apache AGE |
| opensearch | 9200 | OpenSearch 2.x (search & disambiguation) |
| api | 3001 | REST API server |
| ingest | — | Data ingestion worker (no exposed port) |
| p2p | — | Hyperswarm P2P replication node |
| web | 3000 | Next.js web application |

Check all services are healthy:

```bash
docker compose ps
```

## 3. Run Initial Data Ingestion

### Option A: Bootstrap from P2P (fastest)

If you have a seed node's public key:

```bash
docker compose exec p2p node cli.js follow --key <seed-public-key>
```

This downloads the latest snapshot and syncs live updates.

### Option B: Ingest from FEC bulk files

```bash
# Download FEC bulk files for configured election cycles
docker compose exec ingest node cli.js download --cycles 2024,2026

# Run the 5-stage pipeline: download → parse → disambiguate → load → index
docker compose exec ingest node cli.js run --full
```

This takes significant time for a full load (~85M donation records). Progress is logged to stdout.

## 4. Verify

### Check entity count

```bash
curl http://localhost:3001/api/v1/search?q=smith&type=person | jq '.meta.total_count'
```

### Open the web UI

Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

### Test graph query

```bash
curl -X POST http://localhost:3001/api/v1/graph/query \
  -H 'Content-Type: application/json' \
  -d '{
    "center_entity_id": "<any-entity-id>",
    "depth": 1,
    "filters": { "edge_types": ["DONATED_TO"] },
    "max_nodes": 50
  }' | jq '.data.nodes | length'
```

## 5. Development

### Local dev (without Docker)

```bash
# Install dependencies
npm install

# Start PostgreSQL and OpenSearch via Docker
docker compose up -d postgres opensearch

# Run API in dev mode
cd services/api && npm run dev

# Run web app in dev mode
cd web && npm run dev
```

### Run tests

```bash
# Unit tests
npm run test

# Integration tests (requires running services)
npm run test:integration

# E2E tests
npm run test:e2e
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| OpenSearch OOM | Increase `OPENSEARCH_JAVA_OPTS` in `.env`: `-Xms1g -Xmx1g` |
| AGE extension not found | Ensure the postgres image includes AGE: `docker compose build postgres` |
| P2P no peers found | Check firewall allows UDP hole-punching; try adding `--relay` flag |
| Slow ingestion | Use `--parallel 4` flag on ingest CLI for multi-worker mode |
