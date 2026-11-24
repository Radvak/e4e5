# Main commands of the project. `just` alone lists them.

set shell := ["bash", "-euo", "pipefail", "-c"]

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

# The GitHub Pages version (no server, local mode) in apps/web/dist, as the Pages workflow builds it
build-pages:
    VITE_BASE=/e4e5/ VITE_SERVERLESS=1 pnpm --filter web build
