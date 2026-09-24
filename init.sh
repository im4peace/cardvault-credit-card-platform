#!/bin/bash
set -euo pipefail

echo "=== Bootstrapping demo environment (the seed resets local demo data) ==="

# Backend configuration and dependencies. Preserve an existing local .env.
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env from backend/.env.example (demo settings only)"
fi
cd backend && npm ci && npx prisma generate && npx prisma migrate deploy && npm run seed && cd ..

# Frontend dependencies
cd frontend && npm ci && cd ..

# Dev servers
# Local mode: start servers in the background
(cd backend && npm run dev &) 
(cd frontend && npm run dev &)

# Health checks
echo "Waiting for services..."
for i in 1 2 3 4 5; do curl -sf http://localhost:4000/health && break || sleep 2; done
curl -sf http://localhost:5173 >/dev/null || echo "frontend not ready yet"

echo "=== Environment ready ==="
