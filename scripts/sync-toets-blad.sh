#!/bin/sh
# Copy the running Fire-S app into staging/ so the toets-blad can
# have new screens without changing the live app at the site root.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
SRC=${1:-$ROOT}
DEST="$ROOT/staging"

if [ ! -f "$SRC/index.html" ] || [ ! -f "$SRC/fire-s-env.js" ]; then
  echo "sync-toets-blad: source is not a Fire-S app: $SRC" >&2
  exit 1
fi

mkdir -p "$DEST"
# Copy runtime files only. Keep live root files untouched when this
# folder is published on its own.
find "$SRC" -maxdepth 1 -type f \( \
    -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.json' \
    -o -name '*.png' -o -name '*.svg' -o -name '*.txt' -o -name '_redirects' \
  \) ! -name '*.bak' ! -name '*.sql' ! -name '*.md' ! -name '*.log' \
    ! -name 'INDEX-HTML-SNIPPET.html' ! -name 'PATCH_NOTES.txt' \
    ! -name 'README.txt' ! -name 'README_UPLOAD.txt' \
  -exec cp -a {} "$DEST"/ \;

# The toets-blad is this folder, not a bounce to live files.
if grep -q 'url=../?env=staging' "$DEST/index.html" 2>/dev/null; then
  echo "sync-toets-blad: refused to leave a live redirect in staging/index.html" >&2
  exit 1
fi

echo "sync-toets-blad: copied app into $DEST"
