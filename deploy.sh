#!/usr/bin/env bash
# deploy.sh - Build and deploy blog to VPS
# Usage: ./deploy.sh

set -e

VPS_HOST="root@182.92.95.136"
VPS_TARGET="/usr/share/nginx/html/blog"
SSH_KEY="$HOME/.ssh/blog_deploy_key"

echo "📦 Clearing Astro cache..."
rm -rf .astro

echo "📦 Building blog..."
pnpm run build

echo "🚀 Deploying to VPS..."
tar cf - -C dist . | ssh -o BatchMode=yes -o IdentitiesOnly=yes -i "$SSH_KEY" "$VPS_HOST" "cd $VPS_TARGET && rm -rf * && tar xf -"

echo "✅ Deployed to $VPS_HOST:$VPS_TARGET"
