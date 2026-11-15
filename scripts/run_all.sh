#!/usr/bin/env bash
# ErgoGotchi All-in-One Launcher for Mac/Linux
set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

node scripts/launcher.cjs "$@"
