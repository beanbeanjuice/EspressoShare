#!/bin/sh
# linuxserver.io-style entrypoint: fix ownership of bind-mounted dirs so
# whatever host user the operator chose can read/write them, then drop
# privileges from root to that user via gosu before exec'ing the CMD.
set -e

PUID="${PUID:-1001}"
PGID="${PGID:-1001}"

# Both must be plain numeric uid/gid values.
case "$PUID" in ''|*[!0-9]*) echo "docker-entrypoint: PUID must be numeric, got '$PUID'" >&2; exit 1 ;; esac
case "$PGID" in ''|*[!0-9]*) echo "docker-entrypoint: PGID must be numeric, got '$PGID'" >&2; exit 1 ;; esac

# If `docker run --user ...` / compose `user:` was set, we're not root and
# can't chown. Trust the operator's choice and just run the command.
if [ "$(id -u)" -ne 0 ]; then
    echo "docker-entrypoint: not running as root (uid=$(id -u)); skipping chown and exec'ing directly"
    exec "$@"
fi

# App writes to these at runtime. .next/cache is where next/image stores
# optimized images; create it so Next doesn't fall over on first request.
for dir in /app/uploads /app/videos /app/thumbnails /app/.next/cache; do
    mkdir -p "$dir"
    # Only chown if ownership is wrong -- a big /app/videos bind mount
    # shouldn't be walked on every container start.
    current="$(stat -c '%u:%g' "$dir")"
    if [ "$current" != "$PUID:$PGID" ]; then
        echo "docker-entrypoint: chowning $dir ($current -> $PUID:$PGID)"
        chown -R "$PUID:$PGID" "$dir"
    fi
done

exec gosu "$PUID:$PGID" "$@"
