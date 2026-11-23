FROM node:lts-slim AS base

RUN npm install -g corepack@latest && corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Just placeholders.
ENV DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder" \
    BETTER_AUTH_SECRET="placeholder" \
    BETTER_AUTH_URL="http://placeholder"

RUN pnpm run build

RUN pnpm dlx esbuild@0.28.2 prisma.config.ts \
      --bundle --platform=node --target=node22 --outfile=prisma.config.js \
 && pnpm dlx esbuild@0.28.2 prisma/seed.ts \
      --bundle --platform=node --target=node22 --outfile=prisma/seed.js

RUN node -p "require('prisma/package.json').version" > /app/.prisma-version

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# The main thing I made this app for (ffmpeg). gosu is used by the entrypoint
# to drop privileges to the PUID/PGID the operator asks for.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg gosu \
 && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/.prisma-version /tmp/.prisma-version
RUN mkdir -p /opt/prisma \
 && printf '{"private":true}\n' > /opt/prisma/package.json \
 && npm install --prefix /opt/prisma --no-save --no-audit --no-fund "prisma@$(cat /tmp/.prisma-version)" \
 && rm /tmp/.prisma-version \
 && chown -R nextjs:nodejs /opt/prisma

COPY --from=builder --chown=nextjs:nodejs /app/public ./public

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.js ./prisma.config.js
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Create the folders and whatnot so it can actually touch them
RUN mkdir -p /app/videos /app/thumbnails /app/uploads && chown -R nextjs:nodejs /app

# Entrypoint fixes ownership of bind-mounted dirs and drops to PUID:PGID with gosu
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# The container must start as root so the entrypoint can chown bind-mounted
# but the entrypoint then drops privileges with gosu

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# can override at runtime
ENV PUID=1001 PGID=1001

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["sh", "-c", "/opt/prisma/node_modules/.bin/prisma migrate deploy && exec node server.js"]
