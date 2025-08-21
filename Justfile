# Use `just <recipe>` to run a recipe
# https://just.systems/man/en/

# --- Default Group ---
# Shows the list of available recipes

default:
    @just --list

alias fmt := format

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

# Format all files using treefmt
[group('linter')]
format args='':
    treefmt {{ args }}

# Format all files using pre-commit
[group('linter')]
format-all args='':
    pre-commit run --all-files {{ args }}

# Add git commit hashes to the .git-blame-ignore-revs file
[group('linter')]
add-git-blame-ignore-revs:
    git log --pretty=format:"%H" --grep="^lint" >> .git-blame-ignore-revs
    sort .git-blame-ignore-revs | uniq > .git-blame-ignore-revs.tmp
    mv .git-blame-ignore-revs.tmp .git-blame-ignore-revs
