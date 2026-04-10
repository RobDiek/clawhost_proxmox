FROM node:20-slim AS deps

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/i18n/package.json packages/i18n/

RUN pnpm install --frozen-lockfile

FROM node:20-slim AS piper

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/piper /opt/piper-models \
    && curl -fsSL https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz \
    | tar xz -C /opt/piper --strip-components=1 \
    && curl -fsSL -o /opt/piper-models/en_US-ryan-high.onnx \
    "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/high/en_US-ryan-high.onnx" \
    && curl -fsSL -o /opt/piper-models/en_US-ryan-high.onnx.json \
    "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/high/en_US-ryan-high.onnx.json"

FROM node:20-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/i18n/node_modules ./packages/i18n/node_modules
COPY --from=piper /opt/piper /opt/piper
COPY --from=piper /opt/piper-models /opt/piper-models

COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/i18n/package.json packages/i18n/

COPY packages/ packages/
COPY apps/api/src/ apps/api/src/
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/drizzle/ apps/api/drizzle/
COPY apps/api/drizzle.config.ts apps/api/

ENV NODE_ENV=production
ENV PORT=2222
ENV PIPER_BINARY=/opt/piper/piper
ENV PIPER_MODELS_DIR=/opt/piper-models

EXPOSE 2222

CMD ["pnpm", "--filter", "api", "exec", "tsx", "src/index.ts"]