# Use `just <recipe>` to run a recipe
# https://just.systems/man/en/

# --- Default Group ---
# Shows the list of available recipes

default:
    @just --list

# Build the project using npm
[group('dev')]
build:
    npm install
    npm run build

# Force-update the v1 tag and push to origin
[group('dev')]
push-tag-v1:
    git tag -fa v1 -m "Update v1 tag"
    git push origin v1 --force
