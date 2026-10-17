# ---------- 基础镜像 ----------
FROM node:22-alpine AS base
RUN npm install -g pnpm@12

# ---------- 安装依赖 ----------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ---------- 构建 ----------
FROM deps AS build
COPY . .
RUN pnpm prisma generate && pnpm build

# ---------- 运行 ----------
# 保留 devDependencies：entrypoint 需要 prisma CLI（db push）和 tsx（seed）
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/prisma ./prisma
# seed.ts 依赖 app/lib/types.ts（ROLE_PERMISSIONS）
COPY --from=build /app/app/lib/types.ts ./app/lib/types.ts
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
