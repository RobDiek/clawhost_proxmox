FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/

RUN pnpm install --frozen-lockfile --filter api --filter @openclaw/shared --filter @openclaw/i18n

EXPOSE 3001
CMD ["pnpm", "--filter", "api", "start"]
