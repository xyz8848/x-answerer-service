# X Answerer Service (XAS)

一个基于 React Router v7 的全栈题库服务平台，提供题目录入与管理、AI 自动作答、多题库聚合搜题，兼容 OCSJS / TikuAdapter 查题协议。

## 技术栈

React Router v8 (SSR) · React 19 · Tailwind CSS v4 · Prisma + PostgreSQL · jose (JWT) · Nodemailer

## 快速开始

```bash
# 环境要求：Node.js ≥ 22.9，pnpm ≥ 9，PostgreSQL
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入数据库连接串：DATABASE_URL=postgresql://用户名:密码@localhost:5432/xas?schema=public

# 初始化数据库（建表 + 种子数据）
pnpm db:setup
```

Seed 会创建 OWNER 引导账号 `admin@example.com` / `ChangeMe123!`（**登录后立即修改密码**）；JWT 密钥首次启动时自动生成并入库，无需手动配置。

```bash
pnpm dev      # 开发模式（http://localhost:3000）
pnpm build    # 生产构建
pnpm start    # 生产运行
```

## Docker 部署

无需克隆代码，下载 `docker-compose.yml` 后直接启动（自动拉取 GHCR 最新发行版镜像）：

```bash
curl -O https://raw.githubusercontent.com/xyz8848/x-answerer-service/main/docker-compose.yml
docker compose up -d
```

或克隆仓库后在项目根目录 `docker compose up -d --build`（拉取不到镜像时自动回退为本地构建）。

启动后访问 `http://localhost:3000`，使用引导账号 `admin@example.com` / `ChangeMe123!` 登录（登录后立即修改密码）。

容器启动时会自动完成：同步数据库结构（`prisma db push`）→ 初始化种子数据（幂等，可重复执行）→ 启动服务。数据通过 `db-data` 卷持久化。

如需外接已有 PostgreSQL，改掉 `docker-compose.yml` 中 `app.environment.DATABASE_URL` 并删除 `db` 服务即可。

## 功能

- **题目管理**：单选 / 多选 / 判断 / 填空 / 简答，状态流 `待收录 → 已解答 → 已验证`，未命中题目自动收录，支持批量导入与批量 AI 补全
- **AI 作答**：多供应商管理，作答模型链按优先级依次尝试，支持排序与单项禁用
- **其它题库**：可配置多个外部题库作为上游，带全局总开关
- **API Key**：用户自助管理，查题接口支持 `token` / `?token=` / `X-API-Key` 三种鉴权方式
- **权限**：OWNER / ADMIN / USER 三级角色，权限组可自定义

## API

| 接口 | 说明 |
| --- | --- |
| `POST /api/v1/questions/search/ocsjs` | OCSJS 协议查题（需 API Key） |
| `POST /api/v1/questions/search/tiku-adapter` | TikuAdapter 协议查题（需 API Key） |
| `/api/auth/*` | 登录、注册、Passkey 等 |
| `/api/search/*` | 题目收录、作答、验证、批量补全 |
| `/api/users`、`/api/keys`、`/api/permissions/*` | 用户、API Key、权限组管理 |

## License

[MIT](LICENSE)
