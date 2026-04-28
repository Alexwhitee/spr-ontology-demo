import { explainRecord } from "./services/reasoning";
import {
  applyOntologyOperations,
  createOntologyDocumentFromDataset,
  mergeDatasetWithOntology,
  validateOntologyDocument,
  type OntologyDocument
} from "../../shared/ontology";
import type { DemoDataset, Env, OntologyOperation, ProcessRecord } from "./types/demo";

const DEFAULT_DATASET_URL = "https://spr-ontology-demo.pages.dev/data/demo-dataset.json";
const DEFAULT_CURVE_BASE_URL = "https://spr-ontology-demo.pages.dev/data/curves";
let cachedDataset: { value: DemoDataset; expiresAt: number } | null = null;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return withCors(null, env, 204);

    try {
      if (url.pathname === "/api/ontology/current") return json(await getCurrentOntologyDocument(env), env);
      if (url.pathname === "/api/ontology/import") return handleOntologyImport(request, env);
      if (url.pathname === "/api/ontology/operations") return handleOntologyOperations(request, env);
      if (url.pathname === "/api/ontology/versions") return handleOntologyVersions(request, env);
      if (url.pathname.startsWith("/api/ontology/versions/") && url.pathname.endsWith("/restore")) return handleOntologyRestore(request, env, url);

      const dataset = await getDataset(env);
      if (url.pathname === "/api/dataset") return json(dataset, env);
      if (url.pathname === "/api/summary") return json(dataset.summary, env);
      if (url.pathname === "/api/ontology") return json(dataset.ontology, env);
      if (url.pathname === "/api/top-ontology") return json(dataset.top_ontology, env);
      if (url.pathname === "/api/spr-ontology") return json(dataset.spr_ontology, env);
      if (url.pathname === "/api/top-spr-mappings") return json(dataset.top_spr_mappings, env);
      if (url.pathname === "/api/hierarchy-path") return json(findHierarchyPath(dataset, url.searchParams), env);
      if (url.pathname === "/api/field-mapping") return json(dataset.fieldMappings, env);
      if (url.pathname === "/api/demo-script") {
        const mode = parseDemoScriptMode(url.searchParams.get("mode"));
        return json(dataset.demoScripts[mode] ?? dataset.demoScripts["5min"], env);
      }
      if (url.pathname === "/api/instances") return json(filterInstances(dataset, url.searchParams), env);
      if (url.pathname.startsWith("/api/instances/")) {
        const id = decodeURIComponent(url.pathname.replace("/api/instances/", ""));
        const record = dataset.records.find((item) => item.id === id);
        return record ? json(record, env) : json({ error: "record not found" }, env, 404);
      }
      if (url.pathname.startsWith("/api/curves/")) {
        const id = decodeURIComponent(url.pathname.replace("/api/curves/", ""));
        const curve = await getCurve(id, env);
        return curve ? json(curve, env) : json({ error: "curves not found" }, env, 404);
      }
      if (url.pathname.startsWith("/api/subgraph/")) {
        const id = decodeURIComponent(url.pathname.replace("/api/subgraph/", ""));
        return json(buildSubgraph(dataset, id), env);
      }
      if (url.pathname === "/api/reasoning/explain") {
        const body = request.method === "POST" ? await request.json().catch(() => ({ id: undefined })) as { id?: string } : { id: undefined };
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

async function getDataset(env: Env): Promise<DemoDataset> {
  const dataset = await getBaseDataset(env);
  const currentDocument = await getStoredOntologyDocument(env);
  return currentDocument ? mergeDatasetWithOntology(dataset, currentDocument) : dataset;
}

async function getBaseDataset(env: Env): Promise<DemoDataset> {
  if (cachedDataset && cachedDataset.expiresAt > Date.now()) return cachedDataset.value;
  const response = await fetch(env.DATASET_URL ?? DEFAULT_DATASET_URL);
  if (!response.ok) throw new Error(`dataset fetch failed: ${response.status}`);
  const value = await response.json() as DemoDataset;
  cachedDataset = { value, expiresAt: Date.now() + 60_000 };
  return value;
}

async function getCurrentOntologyDocument(env: Env): Promise<OntologyDocument> {
  return await getStoredOntologyDocument(env) ?? createOntologyDocumentFromDataset(await getBaseDataset(env));
}

async function handleOntologyImport(request: Request, env: Env): Promise<Response> {
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method !== "POST") return json({ error: "method not allowed" }, env, 405);

  const body = await request.json().catch(() => ({ document: undefined })) as { document?: unknown; message?: string };
  const validation = validateOntologyDocument(body.document);
  if (!validation.success || !validation.document) return json({ error: "ontology validation failed", details: validation.errors }, env, 400);

  const version = await saveOntologyVersion(env, validation.document, body.message ?? "Import ontology JSON");
  return json({ versionId: version.id, document: validation.document }, env);
}

async function handleOntologyOperations(request: Request, env: Env): Promise<Response> {
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method !== "PATCH") return json({ error: "method not allowed" }, env, 405);

  const body = await request.json().catch(() => ({ operations: undefined })) as { operations?: OntologyOperation[]; message?: string; baseVersionId?: string };
  if (!Array.isArray(body.operations)) return json({ error: "operations must be an array" }, env, 400);

  const current = await getCurrentOntologyDocument(env);
  try {
    const next = applyOntologyOperations(current, body.operations);
    const version = await saveOntologyVersion(env, next, body.message ?? "Apply ontology operations");
    return json({ versionId: version.id, document: next }, env);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, env, 400);
  }
}

async function handleOntologyVersions(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return json({ error: "method not allowed" }, env, 405);
  if (!env.ONTOLOGY_D1) return json([], env);
  await ensureOntologyStorage(env);
  const result = await env.ONTOLOGY_D1
    .prepare("SELECT id, created_at, message, object_key FROM ontology_versions ORDER BY created_at DESC LIMIT 50")
    .bind()
    .all<{ id: string; created_at: string; message: string; object_key: string }>();
  return json(result.results ?? [], env);
}

async function handleOntologyRestore(request: Request, env: Env, url: URL): Promise<Response> {
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method !== "POST") return json({ error: "method not allowed" }, env, 405);

  const versionId = decodeURIComponent(url.pathname.replace("/api/ontology/versions/", "").replace("/restore", ""));
  const document = await getOntologyDocumentByVersion(env, versionId);
  if (!document) return json({ error: "ontology version not found" }, env, 404);
  const body = await request.json().catch(() => ({ message: undefined })) as { message?: string };
  const version = await saveOntologyVersion(env, document, body.message ?? `Restore ontology version ${versionId}`);
  return json({ versionId: version.id, document }, env);
}

async function getStoredOntologyDocument(env: Env): Promise<OntologyDocument | null> {
  if (!env.ONTOLOGY_D1 || !env.ONTOLOGY_BUCKET) return null;
  await ensureOntologyStorage(env);
  const current = await env.ONTOLOGY_D1
    .prepare("SELECT c.version_id, v.object_key FROM ontology_current c JOIN ontology_versions v ON v.id = c.version_id WHERE c.singleton = 1")
    .bind()
    .first<{ version_id: string; object_key: string }>();
  if (!current) return null;
  const object = await env.ONTOLOGY_BUCKET.get(current.object_key);
  if (!object) return null;
  const value = await object.json();
  const validation = validateOntologyDocument(value);
  if (!validation.success || !validation.document) throw new Error(`stored ontology is invalid: ${validation.errors.join("; ")}`);
  return validation.document;
}

async function getOntologyDocumentByVersion(env: Env, versionId: string): Promise<OntologyDocument | null> {
  if (!env.ONTOLOGY_D1 || !env.ONTOLOGY_BUCKET) return null;
  await ensureOntologyStorage(env);
  const version = await env.ONTOLOGY_D1
    .prepare("SELECT id, object_key FROM ontology_versions WHERE id = ?")
    .bind(versionId)
    .first<{ id: string; object_key: string }>();
  if (!version) return null;
  const object = await env.ONTOLOGY_BUCKET.get(version.object_key);
  if (!object) return null;
  const validation = validateOntologyDocument(await object.json());
  if (!validation.success || !validation.document) throw new Error(`stored ontology is invalid: ${validation.errors.join("; ")}`);
  return validation.document;
}

async function saveOntologyVersion(env: Env, document: OntologyDocument, message: string): Promise<{ id: string; objectKey: string }> {
  if (!env.ONTOLOGY_D1 || !env.ONTOLOGY_BUCKET) throw new Error("ontology storage bindings are not configured");
  await ensureOntologyStorage(env);
  const versionId = crypto.randomUUID();
  const objectKey = `ontology/${versionId}.json`;
  const createdAt = new Date().toISOString();
  const storedDocument: OntologyDocument = { ...document, generatedAt: createdAt };

  await env.ONTOLOGY_BUCKET.put(objectKey, JSON.stringify(storedDocument));
  await env.ONTOLOGY_D1
    .prepare("INSERT INTO ontology_versions (id, created_at, message, object_key) VALUES (?, ?, ?, ?)")
    .bind(versionId, createdAt, message, objectKey)
    .run();
  await env.ONTOLOGY_D1
    .prepare("INSERT INTO ontology_current (singleton, version_id) VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET version_id = excluded.version_id")
    .bind(versionId)
    .run();
  return { id: versionId, objectKey };
}

async function ensureOntologyStorage(env: Env): Promise<void> {
  if (!env.ONTOLOGY_D1) return;
  await env.ONTOLOGY_D1.prepare("CREATE TABLE IF NOT EXISTS ontology_versions (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, message TEXT NOT NULL, object_key TEXT NOT NULL)").run();
  await env.ONTOLOGY_D1.prepare("CREATE TABLE IF NOT EXISTS ontology_current (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), version_id TEXT NOT NULL)").run();
}

function requireAdmin(request: Request, env: Env): Response | null {
  const token = env.ADMIN_TOKEN;
  if (!token) return json({ error: "ADMIN_TOKEN is not configured" }, env, 401);
  const authorization = request.headers.get("authorization") ?? "";
  return authorization === `Bearer ${token}` ? null : json({ error: "unauthorized" }, env, 401);
}

function parseDemoScriptMode(value: string | null): "3min" | "5min" | "10min" {
  return value === "3min" || value === "10min" ? value : "5min";
}

async function getCurve(id: string, env: Env): Promise<unknown | null> {
  const response = await fetch(`${env.CURVE_BASE_URL ?? DEFAULT_CURVE_BASE_URL}/${encodeURIComponent(id)}.json`);
  if (!response.ok) return null;
  return response.json();
}

function filterInstances(dataset: DemoDataset, params: URLSearchParams): ProcessRecord[] {
  const line = params.get("line");
  const fault = params.get("fault");
  const source = params.get("source");
  return dataset.records
    .filter((record) => !line || record.lineName === line)
    .filter((record) => !source || record.source === source)
    .filter((record) => !fault || normalizeFault(record.faultCode) === fault)
    .slice(0, Number(params.get("limit") ?? 100));
}

function findHierarchyPath(dataset: DemoDataset, params: URLSearchParams) {
  const topId = params.get("top_id");
  const sprId = params.get("spr_id");
  const mapping = dataset.top_spr_mappings.find((item) => (!topId || item.top_id === topId) && (!sprId || item.spr_id === sprId));
  if (!mapping) return { error: "hierarchy path not found", top_id: topId, spr_id: sprId };
  const path = dataset.hierarchy_paths.find((item) => item.mapping_id === mapping.id);
  return { mapping, path };
}

function buildSubgraph(dataset: DemoDataset, id: string) {
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
      "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
      "access-control-allow-headers": "authorization,content-type"
    }
  });
}
