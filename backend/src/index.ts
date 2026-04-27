import datasetJson from "../../data/processed/demo-dataset.json";
import curvesJson from "../../data/processed/curves.all.json";
import { explainRecord } from "./services/reasoning";
import type { DemoDataset, Env, ProcessRecord } from "./types/demo";

const dataset = datasetJson as unknown as DemoDataset;
const curves = curvesJson as Record<string, unknown>;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return withCors(null, env, 204);

    try {
      if (url.pathname === "/api/dataset") return json(dataset, env);
      if (url.pathname === "/api/summary") return json(dataset.summary, env);
      if (url.pathname === "/api/ontology") return json(dataset.ontology, env);
      if (url.pathname === "/api/top-ontology") return json(dataset.top_ontology, env);
      if (url.pathname === "/api/spr-ontology") return json(dataset.spr_ontology, env);
      if (url.pathname === "/api/top-spr-mappings") return json(dataset.top_spr_mappings, env);
      if (url.pathname === "/api/hierarchy-path") return json(findHierarchyPath(url.searchParams), env);
      if (url.pathname === "/api/field-mapping") return json(dataset.fieldMappings, env);
      if (url.pathname === "/api/demo-script") {
        const mode = url.searchParams.get("mode") ?? "5min";
        return json(dataset.demoScripts[mode] ?? dataset.demoScripts["5min"], env);
      }
      if (url.pathname === "/api/instances") return json(filterInstances(url.searchParams), env);
      if (url.pathname.startsWith("/api/instances/")) {
        const id = decodeURIComponent(url.pathname.replace("/api/instances/", ""));
        const record = dataset.records.find((item) => item.id === id);
        return record ? json(record, env) : json({ error: "record not found" }, env, 404);
      }
      if (url.pathname.startsWith("/api/curves/")) {
        const id = decodeURIComponent(url.pathname.replace("/api/curves/", ""));
        return curves[id] ? json(curves[id], env) : json({ error: "curves not found" }, env, 404);
      }
      if (url.pathname.startsWith("/api/subgraph/")) {
        const id = decodeURIComponent(url.pathname.replace("/api/subgraph/", ""));
        return json(buildSubgraph(id), env);
      }
      if (url.pathname === "/api/reasoning/explain") {
        const body = request.method === "POST" ? await request.json<{ id?: string }>().catch(() => ({ id: undefined })) : { id: undefined };
        const id = body.id ?? url.searchParams.get("id") ?? "";
        const record = dataset.records.find((item) => item.id === id) ?? dataset.records[0];
        return json(explainRecord(record), env);
      }
      return json({ status: "ok", service: "spr-demo-api" }, env);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, env, 500);
    }
  }
};

function filterInstances(params: URLSearchParams): ProcessRecord[] {
  const line = params.get("line");
  const fault = params.get("fault");
  const source = params.get("source");
  return dataset.records
    .filter((record) => !line || record.lineName === line)
    .filter((record) => !source || record.source === source)
    .filter((record) => !fault || normalizeFault(record.faultCode) === fault)
    .slice(0, Number(params.get("limit") ?? 100));
}

function findHierarchyPath(params: URLSearchParams) {
  const topId = params.get("top_id");
  const sprId = params.get("spr_id");
  const mapping = dataset.top_spr_mappings.find((item) => (!topId || item.top_id === topId) && (!sprId || item.spr_id === sprId));
  if (!mapping) return { error: "hierarchy path not found", top_id: topId, spr_id: sprId };
  const path = dataset.hierarchy_paths.find((item) => item.mapping_id === mapping.id);
  return { mapping, path };
}

function buildSubgraph(id: string) {
  const record = dataset.records.find((item) => item.id === id);
  if (!record) return { nodes: [], edges: [] };
  const nodes = [
    { id: record.id, label: record.id, type: "instance", group: "data" },
    { id: "record", label: "SPR过程记录类", type: "class", group: "spr-extension" },
    { id: "device", label: record.deviceName ?? "设备类", type: "class", group: "spr-core" },
    { id: "program", label: record.program ?? "程序类", type: "class", group: "spr-core" },
    { id: "curve-data", label: "SPR曲线数据类", type: "class", group: "spr-extension" },
    { id: "quality", label: "质量结果类", type: "class", group: "spr-core" }
  ];
  const edges = [
    { id: `${id}-type`, source: id, target: "record", label: "rdf:type", type: "inherits" },
    { id: `${id}-device`, source: "record", target: "device", label: "recordedByDevice", type: "objectProperty" },
    { id: `${id}-program`, source: "record", target: "program", label: "recordedWithProgram", type: "objectProperty" },
    { id: `${id}-curve`, source: "record", target: "curve-data", label: "hasCurveData", type: "objectProperty" },
    { id: `${id}-quality`, source: "record", target: "quality", label: "hasQualityResult", type: "objectProperty" }
  ];
  return { nodes, edges };
}

function normalizeFault(value: string | undefined): string {
  if (!value || value === "-") return "正常或未标记";
  return value.replace(/^DDC:\s*/, "");
}

function json(value: unknown, env: Env, status = 200): Response {
  return withCors(JSON.stringify(value), env, status, { "content-type": "application/json; charset=utf-8" });
}

function withCors(body: BodyInit | null, env: Env, status: number, headers: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: {
      ...headers,
      "access-control-allow-origin": env.ALLOWED_ORIGIN ?? "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
