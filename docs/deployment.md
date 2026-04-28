# Cloudflare 部署说明

## Pages 前端

1. 在 Cloudflare Pages 创建项目。
2. Root directory 设置为仓库根目录。
3. Build command：

```bash
npm run build
```

4. Build output directory：

```text
frontend/dist
```

## Worker API

本地验证：

```bash
cp .dev.vars.example .dev.vars
cp frontend/.env.local.example frontend/.env.local
npm run worker:dev
```

另开一个终端启动前端：

```bash
npm run dev
```

此时前端会通过 `frontend/.env.local` 连接：

```text
http://localhost:8787/api/ontology/current
```

部署：

```bash
npx wrangler login
ADMIN_TOKEN="<your-admin-token>" npm run cf:setup
npm run cf:deploy:worker
```

`cf:setup` 会自动完成：

- 创建或复用 D1 数据库 `spr_ontology_versions`。
- 将 D1 `database_id` 写入 `backend/wrangler.toml`。
- 创建或复用 R2 bucket `spr-ontology-documents`。
- 应用 `backend/migrations/0001_ontology_versions.sql`。
- 当传入 `ADMIN_TOKEN` 时，写入 Worker Secret。

也可以只启动 Worker：

```bash
npx wrangler dev --config backend/wrangler.toml
```

只部署 Worker：

```bash
npx wrangler deploy --config backend/wrangler.toml
```

## 前端切换 API 模式

Pages 环境变量：

```env
VITE_DATA_MODE=api
VITE_API_BASE_URL=https://spr-demo-api.<your-subdomain>.workers.dev
```

默认不设置时，前端直接加载静态 JSON，适合离线演示和 Pages 静态部署。

如果用 CLI 部署 Pages：

```bash
cp frontend/.env.production.example frontend/.env.production
# 将 frontend/.env.production 里的 VITE_API_BASE_URL 改为实际 Worker URL
npm run cf:deploy:pages
```

## Worker 环境变量

```toml
[vars]
DATA_MODE = "static"
ALLOWED_ORIGIN = "*"
ADMIN_TOKEN = "<set with wrangler secret>"
```

上线后可将 `ALLOWED_ORIGIN` 改为 Pages 域名。

如果没有通过 `cf:setup` 设置写入密钥，可手动设置：

```bash
npx wrangler secret put ADMIN_TOKEN --config backend/wrangler.toml
```

## 本体编辑存储

在线本体编辑使用 Worker + D1 + R2：

1. `npm run cf:setup` 创建 D1/R2 并应用 migration。
2. Worker 首次写入时也会兜底创建 `ontology_versions` 和 `ontology_current` 表。
3. 前端“在线编辑”页输入 `ADMIN_TOKEN` 后，可上传 JSON、编辑图谱并保存版本。

## API

- `GET /api/dataset`
- `GET /api/summary`
- `GET /api/ontology`
- `GET /api/field-mapping`
- `GET /api/instances`
- `GET /api/instances/:id`
- `GET /api/curves/:id`
- `GET /api/subgraph/:id`
- `POST /api/reasoning/explain`
- `GET /api/demo-script?mode=5min`
- `GET /api/ontology/current`
- `GET /api/ontology/versions`
- `POST /api/ontology/import`
- `PATCH /api/ontology/operations`
- `POST /api/ontology/versions/:id/restore`

写接口需带：

```http
Authorization: Bearer <ADMIN_TOKEN>
```
