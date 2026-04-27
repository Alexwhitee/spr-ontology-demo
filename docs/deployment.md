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
```

上线后可将 `ALLOWED_ORIGIN` 改为 Pages 域名。

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
