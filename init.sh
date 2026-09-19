#!/bin/bash
set -euo pipefail

echo "=== Bootstrapping dev environment ==="

# Backend dependencies
cd backend && npm ci && npx prisma generate && npx prisma migrate deploy && npm run seed && cd ..

# Frontend dependencies
cd frontend && npm ci && cd ..

# Environment
if [ -f ".env.example" ] && [ ! -f ".env" ]; then
  cp .env.example .env
  echo "Created .env from .env.example — add your API keys"
fi

# Dev servers
# Local mode: start servers in the background
(cd backend && npm run dev &) 
(cd frontend && npm run dev &)

# Health checks
echo "Waiting for services..."
for i in 1 2 3 4 5; do curl -sf http://localhost:4000/health && break || sleep 2; done
curl -sf http://localhost:5173 >/dev/null || echo "frontend not ready yet"

echo "=== Environment ready ==="
