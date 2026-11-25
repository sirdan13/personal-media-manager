#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Build frontend if dist is missing
if [ ! -f "frontend/dist/index.html" ]; then
  echo "Compilazione frontend in corso..."
  npm --prefix frontend run build
fi

# 2. Open browser shortly after server starts
(sleep 1.5 && open "http://localhost:8089") &

# 3. Start self-contained FastAPI server serving both API and UI
echo "Avvio Personal Media Manager su http://localhost:8089 ..."
cd backend
exec ./venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8089
