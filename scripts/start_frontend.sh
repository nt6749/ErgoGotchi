#!/usr/bin/env bash
# Start ErgoGotchi Frontend / Desktop
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

echo "👾 Starting ErgoGotchi Vite App on http://localhost:5173..."
npm run dev
