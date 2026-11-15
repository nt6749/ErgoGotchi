#!/usr/bin/env bash
# Enable ErgoGotchi repository safety hooks for team members
set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

chmod +x .githooks/*
git config core.hooksPath .githooks
echo "✓ Git safety hooks enabled! Direct pushes to 'main' are now blocked locally."
