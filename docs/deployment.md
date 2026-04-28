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
npx wrangler dev --config backend/wrangler.toml
```

部署：

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

## Worker 环境变量

```toml
[vars]
DATA_MODE = "static"
ALLOWED_ORIGIN = "*"
ADMIN_TOKEN = "<set with wrangler secret>"
```

上线后可将 `ALLOWED_ORIGIN` 改为 Pages 域名。

写接口需要设置密钥：

```bash
npx wrangler secret put ADMIN_TOKEN --config backend/wrangler.toml
```

## 本体编辑存储

在线本体编辑使用 Worker + D1 + R2：

1. 创建 D1 数据库，并把 `backend/wrangler.toml` 中的 `database_id` 替换成真实 ID。
2. 创建 R2 bucket，并确认 `bucket_name` 与 `backend/wrangler.toml` 一致。
3. Worker 首次写入时会自动创建 `ontology_versions` 和 `ontology_current` 表。
4. 前端“在线编辑”页输入 `ADMIN_TOKEN` 后，可上传 JSON、编辑图谱并保存版本。

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
