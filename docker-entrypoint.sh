#!/bin/sh
set -e

echo "⏳ 等待数据库就绪..."
i=0
until node node_modules/prisma/build/index.js db push --skip-generate >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "❌ 数据库连接超时"
    exit 1
  fi
  sleep 2
done

echo "🗄️ 同步数据库结构..."
node node_modules/prisma/build/index.js db push --skip-generate

echo "🌱 初始化种子数据（幂等，可重复执行）..."
node node_modules/tsx/dist/cli.mjs prisma/seed.ts

echo "🚀 启动服务..."
exec node node_modules/@react-router/serve/bin.cjs ./build/server/index.js
