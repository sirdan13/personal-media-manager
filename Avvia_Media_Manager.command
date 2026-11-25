#!/usr/bin/env bash
# ==============================================================================
# Personal Media Manager - Avvio Rapido macOS (Doppio Clic / Dock)
# ==============================================================================

# Assicura che i tool di Homebrew e standard macOS siano nel PATH
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Titolo della finestra del Terminale
echo -ne "\033]0;Personal Media Manager (In Esecuzione)\007"

# Directory del progetto
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

clear
cat << "EOF"
  ____                               _   __  __          _ _         
 |  _ \ ___ _ __ ___  ___  _ __   __ _| | |  \/  | ___   __| (_) __ _   
 | |_) / _ \ '__/ __|/ _ \| '_ \ / _` | | | |\/| |/ _ \ / _` | |/ _` |  
 |  __/  __/ |  \__ \ (_) | | | | (_| | | | |  | |  __/| (_| | | (_| |  
 |_|   \___|_|  |___/\___/|_| |_|\__,_|_| |_|  |_|\___| \__,_|_|\__,_|  
                                                                         
             🚀 GESTORE MULTIMEDIALE LOCALE & BACKUP PRIVATO             
==========================================================================
EOF

echo ""
echo "🔍 [1/4] Controllo processi e liberazione porte..."

# Se sono già presenti processi orfani sulle porte 8000 o 5173, arrestali
OLD_BACKEND_PIDS=$(lsof -ti:8000 2>/dev/null || true)
if [ -n "$OLD_BACKEND_PIDS" ]; then
    echo "  ↻ Chiusura istanze precedenti del Backend su porta 8000..."
    echo "$OLD_BACKEND_PIDS" | xargs kill -9 2>/dev/null || true
fi

OLD_FRONTEND_PIDS=$(lsof -ti:5173 2>/dev/null || true)
if [ -n "$OLD_FRONTEND_PIDS" ]; then
    echo "  ↻ Chiusura istanze precedenti del Frontend su porta 5173..."
    echo "$OLD_FRONTEND_PIDS" | xargs kill -9 2>/dev/null || true
fi
sleep 0.5

# Verifica ambiente virtuale Python Backend
if [ ! -d "$PROJECT_DIR/backend/venv" ]; then
    echo "📦 Creazione ambiente virtuale Python..."
    python3 -m venv "$PROJECT_DIR/backend/venv"
    source "$PROJECT_DIR/backend/venv/bin/activate"
    pip install -q -r "$PROJECT_DIR/backend/requirements.txt"
fi

# 2. Avvio Backend FastAPI
echo "⚙️  [2/4] Avvio Backend (FastAPI + SQLite + Cache Miniature)..."
cd "$PROJECT_DIR/backend"
"$PROJECT_DIR/backend/venv/bin/uvicorn" app.main:app --host 0.0.0.0 --port 8000 --reload > /tmp/pmm_backend.log 2>&1 &
BACKEND_PID=$!

# Cleanup alla chiusura
cleanup() {
    echo ""
    echo "=========================================================================="
    echo "🛑 Arresto di Personal Media Manager in corso..."
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    lsof -ti:5173 | xargs kill -9 2>/dev/null || true
    echo "✓ Servizi terminati correttamente. Puoi chiudere questa finestra."
    echo "=========================================================================="
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Attesa backend
echo "  ↻ Attesa disponibilità del server API..."
for i in {1..20}; do
    if curl -s http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1; then
        echo "  ✓ Backend API pronto su http://localhost:8000"
        break
    fi
    sleep 0.5
done

# 3. Avvio Frontend Vite
echo "🌐 [3/4] Avvio Interfaccia Web (React + Vite)..."
cd "$PROJECT_DIR/frontend"
npx vite --host 0.0.0.0 --port 5173 > /tmp/pmm_frontend.log 2>&1 &
FRONTEND_PID=$!

# Attesa frontend
for i in {1..20}; do
    if curl -s http://localhost:5173 >/dev/null 2>&1; then
        echo "  ✓ Frontend Web pronto su http://localhost:5173"
        break
    fi
    sleep 0.5
done

# 4. Apertura del Browser
echo "💻 [4/4] Apertura automatica nel browser predefinito..."
sleep 0.8
open "http://localhost:5173"

echo ""
echo "=========================================================================="
echo "  🎉 PERSONAL MEDIA MANAGER È ATTIVO E FUNZIONANTE!"
echo "--------------------------------------------------------------------------"
echo "  🌐 Web App:      http://localhost:5173"
echo "  📖 Documentazione API: http://localhost:8000/docs"
echo "  📄 Log Backend:  /tmp/pmm_backend.log"
echo "  📄 Log Frontend: /tmp/pmm_frontend.log"
echo "--------------------------------------------------------------------------"
echo "  💡 Per fermare l'applicazione: premi [q] o [Ctrl + C] in questa finestra."
echo "=========================================================================="
echo ""

# Loop di ascolto per uscita pulita
while true; do
    read -r -n 1 key
    if [[ $key == "q" || $key == "Q" ]]; then
        break
    fi
done
cleanup
