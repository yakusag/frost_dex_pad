#!/bin/bash
set -e

echo "Running post-merge setup..."
yarn install --frozen-lockfile 2>&1 || yarn install 2>&1
echo "Done."
