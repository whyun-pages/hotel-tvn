#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="hotel-tvn"
DIRECTORY="$SCRIPT_DIR/../output"

pnpm exec wrangler pages deploy "$DIRECTORY" --project-name="$PROJECT_NAME"
