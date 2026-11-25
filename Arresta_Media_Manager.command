#!/usr/bin/env bash
# ==============================================================================
# Personal Media Manager - Script di Arresto Rapido
# ==============================================================================

echo -ne "\033]0;Arresta Personal Media Manager\007"
echo ""
echo "🛑 Arresto di tutte le istanze di Personal Media Manager..."

BACKEND_PIDS=$(lsof -ti:8000 2>/dev/null || true)
if [ -n "$BACKEND_PIDS" ]; then
    echo "  ↻ Terminazione Backend (porta 8000)..."
    echo "$BACKEND_PIDS" | xargs kill -9 2>/dev/null || true
else
    echo "  ✓ Backend non in esecuzione."
fi

FRONTEND_PIDS=$(lsof -ti:5173 2>/dev/null || true)
if [ -n "$FRONTEND_PIDS" ]; then
    echo "  ↻ Terminazione Frontend (porta 5173)..."
    echo "$FRONTEND_PIDS" | xargs kill -9 2>/dev/null || true
else
    echo "  ✓ Frontend non in esecuzione."
fi

echo ""
echo "✓ Personal Media Manager è stato arrestato con successo."
sleep 1.5
