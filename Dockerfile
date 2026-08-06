# Imagem de producao para o servidor MicroFirma
FROM node:22-slim

# Instala pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copia arquivos de gerenciamento de pacotes
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/world-engine/package.json ./packages/world-engine/
COPY packages/synthetic/package.json ./packages/synthetic/

# Instala dependencias sem devDependencies para producao
RUN pnpm install --frozen-lockfile --prod --filter @microfirma/server...

# Copia codigo fonte
COPY apps/server ./apps/server
COPY packages ./packages
COPY tsconfig.base.json ./
COPY tsconfig.json ./

# Build do servidor
RUN pnpm --filter @microfirma/server build

EXPOSE 8787

CMD ["node", "apps/server/dist/server.js"]
