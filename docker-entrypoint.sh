#!/bin/sh
# Fix ownership of bind-mounted directories

set -e

PUID="${PUID:-1001}"
PGID="${PGID:-1001}"

case "$PUID" in ''|*[!0-9]*) echo "docker-entrypoint: PUID must be numeric, got '$PUID'" >&2; exit 1 ;; esac
case "$PGID" in ''|*[!0-9]*) echo "docker-entrypoint: PGID must be numeric, got '$PGID'" >&2; exit 1 ;; esac

# If "user: 1000:1000" for example was set in the docker compose, trust the user and just run this
if [ "$(id -u)" -ne 0 ]; then
    echo "docker-entrypoint: not running as root (uid=$(id -u)); skipping chown and exec'ing directly"
    exec "$@"
fi

# App writes to these at runtime. .next/cache is where next/image stores
# optimized images so we create it so Next doesn't fall over on first request.
for dir in /app/uploads /app/videos /app/thumbnails /app/.next/cache; do
    mkdir -p "$dir"

    # We only need to change ownership if it's wrong. It shouldn't be done on every restart
    current="$(stat -c '%u:%g' "$dir")"
    if [ "$current" != "$PUID:$PGID" ]; then
        echo "docker-entrypoint: chowning $dir ($current -> $PUID:$PGID)"
        chown -R "$PUID:$PGID" "$dir"
    fi
done

exec gosu "$PUID:$PGID" "$@"
