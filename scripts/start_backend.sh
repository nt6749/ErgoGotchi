#!/usr/bin/env bash
# Start ErgoGotchi Backend Server
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

export PYTHONPATH="$DIR/backend"
echo "🚀 Starting ErgoGotchi Backend on http://localhost:8000..."
python3 backend/app/main.py
