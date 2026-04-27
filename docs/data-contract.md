# SPR Demo 数据契约

## ProcessRecord

```ts
type ProcessRecord = {
  id: string;
  source: "main" | "rip_rop";
  lineName?: string;
  deviceName?: string;
  program?: string;
  rivetId?: string;
  carBodyId?: string;
  timestamp?: string;
  faultCode?: string;
  predictionCategory?: string;
  errorRate?: number | string;
  raw: Record<string, string | number | boolean | null>;
  curveSummary?: {
    original?: CurveSummary;
    calculated?: CurveSummary;
    riveting?: CurveSummary;
    envelope?: CurveSummary;
  };
};
```

## 曲线文件

每条记录的曲线详情按需加载：

```text
frontend/public/data/curves/{recordId}.json
```

结构：

```ts
type CurveDetail = {
  id: string;
  curves: {
    original?: number[];
    calculated?: number[];
    riveting?: number[];
    envelope?: number[];
  };
  curveSummary: Record<string, CurveSummary>;
};
```

## 字段映射状态

- `已有类可承载`：映射到原 SPR 主链路中的已有类。
- `需补属性`：已有类可承载，但需要新增数据属性。
- `需新增扩展类`：需要 v0.3 新增类承载。
- `需确认`：业务含义未确认，Demo 保守展示。
