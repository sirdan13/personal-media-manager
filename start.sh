#!/usr/bin/env bash
# ==============================================================================
# Personal Media Manager - Script di Avvio Integrato (Frontend + Backend)
# ==============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

echo ""
echo "================================================================"
echo "          🚀 AVVIO DI PERSONAL MEDIA MANAGER                   "
echo "================================================================"
echo ""

# 1. Verifica prerequisiti minimi
command -v python3 >/dev/null 2>&1 || { echo "❌ Python 3 non trovato. Installa Python 3 per continuare."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm/Node.js non trovato. Installa Node.js per continuare."; exit 1; }

# 2. Configurazione Backend
echo "📦 [1/4] Verifica ambiente virtuale Python Backend..."
cd "$BACKEND_DIR"
if [ ! -d "venv" ]; then
    echo "  Creazione venv in corso..."
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    pip install pillow requests
else
    source venv/bin/activate
fi

# 3. Configurazione Frontend
echo "📦 [2/4] Verifica dipendenze Frontend..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    echo "  Installazione moduli npm in corso..."
    npm install
fi

# 4. Avvio Backend in background
echo "⚙️  [3/4] Avvio Backend FastAPI su http://127.0.0.1:8000..."
cd "$BACKEND_DIR"
source venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 > /tmp/pmm_backend.log 2>&1 &
BACKEND_PID=$!

cleanup() {
    echo ""
    echo "🛑 Arresto dei servizi in corso..."
    if kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    echo "✓ Tutti i processi sono stati terminati correttamente."
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Attendi che il backend sia pronto
echo "  Attesa risposta healthcheck backend..."
for i in {1..30}; do
    if curl -s http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1; then
        echo "  ✓ Backend online e operativo!"
        break
    fi
    sleep 0.5
done

# 5. Avvio Frontend
echo "🌐 [4/4] Avvio Frontend Vite Web UI..."
cd "$FRONTEND_DIR"

# Apri automaticamente il browser dopo 1.5 secondi se su macOS o Linux
(
    sleep 1.5
    if command -v open >/dev/null 2>&1; then
        open "http://localhost:5173"
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "http://localhost:5173"
    fi
) &

echo ""
echo "================================================================"
echo "  🎉 Personal Media Manager è ATTIVO!"
echo "----------------------------------------------------------------"
echo "  💻 Web App:      http://localhost:5173"
echo "  📖 Swagger API:  http://127.0.0.1:8000/docs"
echo "  🔑 Account Demo: demo@example.com / demo123456"
echo "                   (oppure clicca 'Usa Account Demo' nel popup)"
echo "----------------------------------------------------------------"
echo "  Premi [Ctrl + C] in questo terminale per arrestare tutto."
echo "================================================================"
echo ""

npm run dev
