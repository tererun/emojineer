FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Final image
FROM base
COPY --from=install /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json index.ts ./
COPY src ./src

CMD ["bun", "run", "index.ts"]
