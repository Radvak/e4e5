# Main commands of the project. `just` alone lists them.

set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

# Install the dependencies
install:
    pnpm install

# Web app on http://localhost:5173
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

# Production build of the web app
build:
    pnpm build

# Database migration, after changing packages/data/src/schema.ts
db-generate:
    pnpm db:generate

# The GitHub Pages version in apps/web/dist, as the Pages workflow builds it
build-pages:
    VITE_BASE=/e4e5/ pnpm --filter web build
