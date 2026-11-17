# Main commands of the project. `just` alone lists them.

set shell := ["bash", "-euo", "pipefail", "-c"]

app := "mon-cahier"

default:
    @just --list

# Install the dependencies
install:
    pnpm install

# Server on :3000, web on http://localhost:5173
dev:
    pnpm dev

# Typecheck, then the tests
check: typecheck test

# Typecheck all packages
typecheck:
    pnpm typecheck

# Tests of all packages
test:
    pnpm test

# Production build (web, then server)
build:
    pnpm build

# Database migration, after changing apps/server/src/db/schema.ts
db-generate:
    pnpm db:generate

# Import explorer statistics (explorer cache or seed file)
stats-import file:
    pnpm --filter server stats:import {{file}}

# Export the statistics table to seed/<name>.json.gz
stats-export name:
    pnpm --filter server stats:export-seed {{name}}

# Fly's remote builders are unreachable behind the corporate proxy (CA and npm mirror passed as
# build secrets). The tag is the commit, with -dirty when there are uncommitted changes.
# Build the image locally, push it to Fly and deploy it
deploy:
    #!/usr/bin/env bash
    set -euo pipefail
    tag="registry.fly.io/{{app}}:$(git rev-parse --short HEAD)"
    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then tag="$tag-dirty"; echo "Uncommitted changes: deploying $tag"; fi
    secrets=()
    if [ -n "${NODE_EXTRA_CA_CERTS:-}" ]; then secrets+=(--secret "id=ca,src=$NODE_EXTRA_CA_CERTS"); fi
    if [ -f "$HOME/.npmrc" ]; then secrets+=(--secret "id=npmrc,src=$HOME/.npmrc"); fi
    docker build --platform linux/amd64 "${secrets[@]}" -t "$tag" . 2>&1 | tail -2
    fly auth docker >/dev/null 2>&1
    docker push "$tag" 2>&1 | tail -1
    fly deploy --image "$tag"

# Machine state and deployed image
status:
    fly status -a {{app}}

# Live logs of the app
logs:
    fly logs -a {{app}}

# Shell on the machine
ssh:
    fly ssh console -a {{app}}

# Copy of the production database to ./backups/
backup:
    mkdir -p backups
    fly ssh sftp get -a {{app}} /data/prepa-cahier.db "backups/prepa-cahier-$(date +%Y%m%d-%H%M%S).db"
