#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Starting Invoice App..."

# Backend
echo "[backend] Starting FastAPI on :8001..."
cd "$ROOT/backend"
if [ ! -d venv ]; then
  python3 -m venv venv
  venv/bin/pip install -q -r requirements.txt
fi
venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001 --reload &
BACKEND_PID=$!

# Frontend
echo "[frontend] Starting Next.js on :3002..."
cd "$ROOT/frontend"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
npm run dev -- --port 3002 &
FRONTEND_PID=$!

echo ""
echo "  Backend:  http://localhost:8001"
echo "  Frontend: http://localhost:3002"
echo "  API docs: http://localhost:8001/docs"
echo ""
echo "Press Ctrl+C to stop."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
