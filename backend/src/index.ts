import { explainRecord } from "./services/reasoning";
import {
  applyOntologyOperations,
  createOntologyDocumentFromDataset,
  importDatabaseRows,
  mergeDatasetWithOntology,
  validateOntologyDocument,
  type OntologyDocument
} from "../../shared/ontology";
import {
  analyzeRootCause,
  createWarningReport,
  exportOwlXml,
  exportTopOntologyOwlXml,
  extractRuleCandidates,
  extractRuleCandidatesWithLlm,
  listOntologyClasses,
  listQualityRules,
  runDetection,
  validateOwl2Artifacts,
  type DetectionResult,
  type RuleExtractionCandidate,
  type RuleReviewStatus,
  type RootCauseAnalysis
} from "../../shared/ontology-service";
import type { DatabaseImportRequest, DemoDataset, Env, OntologyOperation, ProcessRecord, SprOntologyNode, SprOntologyRelation, TopSprMapping } from "./types/demo";

const DEFAULT_DATASET_URL = "https://spr-ontology-demo.pages.dev/data/demo-dataset.json";
const DEFAULT_CURVE_BASE_URL = "https://spr-ontology-demo.pages.dev/data/curves";
let cachedDataset: { value: DemoDataset; expiresAt: number } | null = null;
let runtimeImportedDataset: DemoDataset | null = null;

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
      if (url.pathname === "/api/dataset/import") return handleDatasetImport(request, env);

      const dataset = await getDataset(env);
      if (url.pathname === "/api/dataset") return json(dataset, env);
      if (url.pathname === "/api/summary") return json(dataset.summary, env);
      if (url.pathname === "/api/ontology/owl") return owl(exportOwlXml(dataset), env);
      if (url.pathname === "/api/ontology/top.owl") return owl(exportTopOntologyOwlXml(), env);
      if (url.pathname === "/api/ontology/validate") return json(validateOwl2Artifacts(dataset), env);
      if (url.pathname === "/api/ontology/classes") return json(listOntologyClasses(dataset), env);
      if (url.pathname === "/api/ontology/rules") return json(listQualityRules(dataset), env);
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
      if (url.pathname === "/api/detect/run") return handleDetectionRun(request, env, dataset);
      if (url.pathname === "/api/root-cause/analyze") return handleRootCauseAnalyze(request, env, dataset);
      if (url.pathname === "/api/reports/warning") return handleWarningReport(request, env, dataset);
      if (url.pathname === "/api/knowledge/rule-candidates") return handleRuleCandidatesList(request, env);
      if (url.pathname.startsWith("/api/knowledge/rule-candidates/") && url.pathname.endsWith("/review")) return handleRuleCandidateReview(request, env, url);
      if (url.pathname === "/api/knowledge/publish-rules") return handleRulePublish(request, env, dataset);
      if (url.pathname === "/api/knowledge/extract-rules") return handleRuleExtraction(request, env);
      return json({ status: "ok", service: "spr-demo-api" }, env);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, env, 500);
    }
  }
};

async function getDataset(env: Env): Promise<DemoDataset> {
  if (runtimeImportedDataset) return runtimeImportedDataset;
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

async function handleDatasetImport(request: Request, env: Env): Promise<Response> {
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method !== "POST") return json({ error: "method not allowed" }, env, 405);
  const body = await request.json().catch(() => ({})) as Partial<DatabaseImportRequest>;
  if (body.sourceTable !== "main" && body.sourceTable !== "rip_rop") {
    return json({ error: "sourceTable must be main or rip_rop" }, env, 400);
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return json({ error: "rows must be a non-empty array" }, env, 400);
  }
  const base = runtimeImportedDataset ?? await getDataset(env);
  const result = importDatabaseRows(base, { sourceTable: body.sourceTable, rows: body.rows });
  runtimeImportedDataset = result.dataset;
  cachedDataset = { value: result.dataset, expiresAt: Date.now() + 60_000 };
  return json(result, env);
}

async function getStoredOntologyDocument(env: Env): Promise<OntologyDocument | null> {
  if (!env.ONTOLOGY_D1) return null;
  await ensureOntologyStorage(env);
  const current = await env.ONTOLOGY_D1
    .prepare("SELECT c.version_id, v.object_key, v.document_json FROM ontology_current c JOIN ontology_versions v ON v.id = c.version_id WHERE c.singleton = 1")
    .bind()
    .first<{ version_id: string; object_key: string | null; document_json: string | null }>();
  if (!current) return null;
  const value = await loadStoredDocument(current, env);
  if (!value) return null;
  const validation = validateOntologyDocument(value);
  if (!validation.success || !validation.document) throw new Error(`stored ontology is invalid: ${validation.errors.join("; ")}`);
  return validation.document;
}

async function getOntologyDocumentByVersion(env: Env, versionId: string): Promise<OntologyDocument | null> {
  if (!env.ONTOLOGY_D1) return null;
  await ensureOntologyStorage(env);
  const version = await env.ONTOLOGY_D1
    .prepare("SELECT id, object_key, document_json FROM ontology_versions WHERE id = ?")
    .bind(versionId)
    .first<{ id: string; object_key: string | null; document_json: string | null }>();
  if (!version) return null;
  const value = await loadStoredDocument(version, env);
  if (!value) return null;
  const validation = validateOntologyDocument(value);
  if (!validation.success || !validation.document) throw new Error(`stored ontology is invalid: ${validation.errors.join("; ")}`);
  return validation.document;
}

async function saveOntologyVersion(env: Env, document: OntologyDocument, message: string): Promise<{ id: string; objectKey: string }> {
  if (!env.ONTOLOGY_D1) throw new Error("ontology D1 binding is not configured");
  await ensureOntologyStorage(env);
  const versionId = crypto.randomUUID();
  const objectKey = `ontology/${versionId}.json`;
  const createdAt = new Date().toISOString();
  const storedDocument: OntologyDocument = { ...document, generatedAt: createdAt };
  const documentJson = JSON.stringify(storedDocument);

  if (env.ONTOLOGY_BUCKET) await env.ONTOLOGY_BUCKET.put(objectKey, documentJson);
  await env.ONTOLOGY_D1
    .prepare("INSERT INTO ontology_versions (id, created_at, message, object_key, document_json) VALUES (?, ?, ?, ?, ?)")
    .bind(versionId, createdAt, message, env.ONTOLOGY_BUCKET ? objectKey : null, documentJson)
    .run();
  await env.ONTOLOGY_D1
    .prepare("INSERT INTO ontology_current (singleton, version_id) VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET version_id = excluded.version_id")
    .bind(versionId)
    .run();
  return { id: versionId, objectKey };
}

async function ensureOntologyStorage(env: Env): Promise<void> {
  if (!env.ONTOLOGY_D1) return;
  await env.ONTOLOGY_D1.prepare("CREATE TABLE IF NOT EXISTS ontology_versions (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, message TEXT NOT NULL, object_key TEXT, document_json TEXT)").run();
  await env.ONTOLOGY_D1.prepare("ALTER TABLE ontology_versions ADD COLUMN document_json TEXT").run().catch(() => undefined);
  await env.ONTOLOGY_D1.prepare("ALTER TABLE ontology_versions ADD COLUMN object_key TEXT").run().catch(() => undefined);
  await env.ONTOLOGY_D1.prepare("CREATE TABLE IF NOT EXISTS ontology_current (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), version_id TEXT NOT NULL)").run();
}

async function ensureKnowledgeRuleStorage(env: Env): Promise<void> {
  if (!env.ONTOLOGY_D1) return;
  await env.ONTOLOGY_D1.prepare([
    "CREATE TABLE IF NOT EXISTS knowledge_rule_candidates (",
    "id TEXT PRIMARY KEY,",
    "source_document TEXT NOT NULL,",
    "source_excerpt TEXT NOT NULL,",
    "rule_name TEXT NOT NULL,",
    "applicable_process TEXT NOT NULL,",
    "trigger_condition TEXT NOT NULL,",
    "defect_pattern TEXT NOT NULL,",
    "root_cause_candidate TEXT NOT NULL,",
    "evidence_fields_json TEXT NOT NULL,",
    "recommended_actions_json TEXT NOT NULL,",
    "review_status TEXT NOT NULL,",
    "confidence REAL,",
    "created_at TEXT NOT NULL,",
    "updated_at TEXT NOT NULL,",
    "published_version_id TEXT",
    ")"
  ].join(" ")).run();
}

async function loadStoredDocument(row: { object_key?: string | null; document_json?: string | null }, env: Env): Promise<unknown | null> {
  if (row.document_json) return JSON.parse(row.document_json);
  if (!row.object_key || !env.ONTOLOGY_BUCKET) return null;
  const object = await env.ONTOLOGY_BUCKET.get(row.object_key);
  return object ? object.json() : null;
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

async function handleDetectionRun(request: Request, env: Env, dataset: DemoDataset): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method not allowed" }, env, 405);
  const body = await request.json().catch(() => ({})) as { recordId?: string; modelMode?: "mock" | "llm"; includeCurveSummary?: boolean };
  const recordId = body.recordId ?? dataset.records[0]?.id;
  if (!recordId) return json({ error: "recordId is required" }, env, 400);
  const modelMode = body.modelMode ?? (env.LLM_API_BASE_URL && env.LLM_API_KEY && env.LLM_MODEL ? "llm" : "mock");
  return json(await runDetection(dataset, {
    recordId,
    modelMode,
    includeCurveSummary: body.includeCurveSummary ?? true,
    llm: {
      apiBaseUrl: env.LLM_API_BASE_URL,
      apiKey: env.LLM_API_KEY,
      model: env.LLM_MODEL,
      timeoutMs: env.LLM_TIMEOUT_MS ? Number(env.LLM_TIMEOUT_MS) : undefined
    }
  }), env);
}

async function handleRootCauseAnalyze(request: Request, env: Env, dataset: DemoDataset): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method not allowed" }, env, 405);
  const body = await request.json().catch(() => ({})) as { recordId?: string; anomalyEventId?: string; detection?: DetectionResult };
  const detection = body.detection ?? await runDetection(dataset, { recordId: body.recordId ?? dataset.records[0]?.id ?? "", modelMode: "mock", includeCurveSummary: true });
  return json(analyzeRootCause(dataset, { anomalyEventId: body.anomalyEventId ?? detection.anomalyEvent?.id ?? "", detection }), env);
}

async function handleWarningReport(request: Request, env: Env, dataset: DemoDataset): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method not allowed" }, env, 405);
  const body = await request.json().catch(() => ({})) as { recordId?: string; detection?: DetectionResult; rootCause?: RootCauseAnalysis };
  const detection = body.detection ?? await runDetection(dataset, { recordId: body.recordId ?? dataset.records[0]?.id ?? "", modelMode: "mock", includeCurveSummary: true });
  const rootCause = body.rootCause ?? analyzeRootCause(dataset, { anomalyEventId: detection.anomalyEvent?.id ?? "", detection });
  return json(createWarningReport(dataset, { detection, rootCause }), env);
}

async function handleRuleExtraction(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method not allowed" }, env, 405);
  const body = await request.json().catch(() => ({})) as { text?: string; sourceDocument?: string };
  const useLlm = Boolean(env.LLM_API_BASE_URL && env.LLM_API_KEY && env.LLM_MODEL);
  const extraction = useLlm ? await extractRuleCandidatesWithLlm({
    text: body.text ?? "",
    sourceDocument: body.sourceDocument,
    modelMode: "llm",
    llm: {
      apiBaseUrl: env.LLM_API_BASE_URL,
      apiKey: env.LLM_API_KEY,
      model: env.LLM_MODEL,
      timeoutMs: env.LLM_TIMEOUT_MS ? Number(env.LLM_TIMEOUT_MS) : undefined
    }
  }) : extractRuleCandidates({
    text: body.text ?? "",
    sourceDocument: body.sourceDocument,
    modelMode: "mock"
  });
  if (env.ONTOLOGY_D1) await persistRuleCandidates(env, extraction.candidates);
  return json(extraction, env);
}

async function handleRuleCandidatesList(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return json({ error: "method not allowed" }, env, 405);
  if (!env.ONTOLOGY_D1) return json([], env);
  await ensureKnowledgeRuleStorage(env);
  const result = await env.ONTOLOGY_D1
    .prepare("SELECT * FROM knowledge_rule_candidates ORDER BY created_at DESC LIMIT 100")
    .bind()
    .all<RuleCandidateRow>();
  return json((result.results ?? []).map(rowToRuleCandidate), env);
}

async function handleRuleCandidateReview(request: Request, env: Env, url: URL): Promise<Response> {
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method !== "PATCH") return json({ error: "method not allowed" }, env, 405);
  if (!env.ONTOLOGY_D1) return json({ error: "ontology D1 binding is not configured" }, env, 503);
  const candidateId = decodeURIComponent(url.pathname.replace("/api/knowledge/rule-candidates/", "").replace("/review", ""));
  const body = await request.json().catch(() => ({})) as { reviewStatus?: RuleReviewStatus };
  if (body.reviewStatus !== "approved" && body.reviewStatus !== "rejected" && body.reviewStatus !== "pending") {
    return json({ error: "reviewStatus must be pending, approved, or rejected" }, env, 400);
  }
  await ensureKnowledgeRuleStorage(env);
  const existing = await getRuleCandidateRow(env, candidateId);
  if (!existing) return json({ error: "rule candidate not found" }, env, 404);
  const updatedAt = new Date().toISOString();
  await env.ONTOLOGY_D1
    .prepare("UPDATE knowledge_rule_candidates SET review_status = ?, updated_at = ? WHERE id = ?")
    .bind(body.reviewStatus, updatedAt, candidateId)
    .run();
  return json({ ...rowToRuleCandidate(existing), reviewStatus: body.reviewStatus, updatedAt }, env);
}

async function handleRulePublish(request: Request, env: Env, dataset: DemoDataset): Promise<Response> {
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method !== "POST") return json({ error: "method not allowed" }, env, 405);
  if (!env.ONTOLOGY_D1) return json({ error: "ontology D1 binding is not configured" }, env, 503);
  const body = await request.json().catch(() => ({})) as { candidateIds?: string[] };
  const candidateIds = Array.isArray(body.candidateIds) ? body.candidateIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0) : [];
  if (candidateIds.length === 0) return json({ error: "candidateIds must be a non-empty array" }, env, 400);

  await ensureKnowledgeRuleStorage(env);
  const rows = (await Promise.all(candidateIds.map((id) => getRuleCandidateRow(env, id)))).filter((row): row is RuleCandidateRow => Boolean(row));
  if (rows.length !== candidateIds.length) return json({ error: "one or more rule candidates were not found" }, env, 404);
  const notApproved = rows.find((row) => row.review_status !== "approved");
  if (notApproved) return json({ error: `rule candidate is not approved: ${notApproved.id}` }, env, 409);

  const current = await getCurrentOntologyDocument(env);
  const { document, publishedRules } = publishCandidatesToDocument(current, rows.map(rowToRuleCandidate), dataset);
  const version = await saveOntologyVersion(env, document, `Publish ${publishedRules.length} approved knowledge rule(s)`);
  const updatedAt = new Date().toISOString();
  await Promise.all(rows.map((row) => env.ONTOLOGY_D1!
    .prepare("UPDATE knowledge_rule_candidates SET published_version_id = ?, updated_at = ? WHERE id = ?")
    .bind(version.id, updatedAt, row.id)
    .run()));

  return json({ versionId: version.id, publishedRules, document }, env);
}

type RuleCandidateRow = {
  id: string;
  source_document: string;
  source_excerpt: string;
  rule_name: string;
  applicable_process: string;
  trigger_condition: string;
  defect_pattern: string;
  root_cause_candidate: string;
  evidence_fields_json: string;
  recommended_actions_json: string;
  review_status: string;
  confidence: number | null;
  created_at: string;
  updated_at: string;
  published_version_id: string | null;
};

async function persistRuleCandidates(env: Env, candidates: RuleExtractionCandidate[]): Promise<void> {
  if (!env.ONTOLOGY_D1) return;
  await ensureKnowledgeRuleStorage(env);
  const now = new Date().toISOString();
  await Promise.all(candidates.map((candidate) => env.ONTOLOGY_D1!
    .prepare([
      "INSERT INTO knowledge_rule_candidates",
      "(id, source_document, source_excerpt, rule_name, applicable_process, trigger_condition, defect_pattern, root_cause_candidate, evidence_fields_json, recommended_actions_json, review_status, confidence, created_at, updated_at, published_version_id)",
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "ON CONFLICT(id) DO UPDATE SET",
      "source_document = excluded.source_document,",
      "source_excerpt = excluded.source_excerpt,",
      "rule_name = excluded.rule_name,",
      "applicable_process = excluded.applicable_process,",
      "trigger_condition = excluded.trigger_condition,",
      "defect_pattern = excluded.defect_pattern,",
      "root_cause_candidate = excluded.root_cause_candidate,",
      "evidence_fields_json = excluded.evidence_fields_json,",
      "recommended_actions_json = excluded.recommended_actions_json,",
      "updated_at = excluded.updated_at"
    ].join(" "))
    .bind(
      candidate.candidateId,
      candidate.sourceDocument,
      candidate.sourceExcerpt,
      candidate.ruleName,
      candidate.applicableProcess,
      candidate.triggerCondition,
      candidate.defectPattern,
      candidate.rootCauseCandidate,
      JSON.stringify(candidate.evidenceFields),
      JSON.stringify(candidate.recommendedActions),
      candidate.reviewStatus,
      candidate.confidence ?? null,
      now,
      now,
      candidate.publishedVersionId ?? null
    )
    .run()));
}

async function getRuleCandidateRow(env: Env, candidateId: string): Promise<RuleCandidateRow | null> {
  if (!env.ONTOLOGY_D1) return null;
  await ensureKnowledgeRuleStorage(env);
  return await env.ONTOLOGY_D1
    .prepare("SELECT * FROM knowledge_rule_candidates WHERE id = ?")
    .bind(candidateId)
    .first<RuleCandidateRow>();
}

function rowToRuleCandidate(row: RuleCandidateRow): RuleExtractionCandidate & { createdAt?: string; updatedAt?: string } {
  return {
    candidateId: row.id,
    ruleName: row.rule_name,
    applicableProcess: row.applicable_process,
    triggerCondition: row.trigger_condition,
    defectPattern: row.defect_pattern,
    rootCauseCandidate: row.root_cause_candidate,
    evidenceFields: parseJsonArray(row.evidence_fields_json),
    recommendedActions: parseJsonArray(row.recommended_actions_json),
    sourceDocument: row.source_document,
    sourceExcerpt: row.source_excerpt,
    reviewStatus: normalizeReviewStatus(row.review_status),
    confidence: row.confidence ?? undefined,
    publishedVersionId: row.published_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publishCandidatesToDocument(document: OntologyDocument, candidates: RuleExtractionCandidate[], dataset: DemoDataset): { document: OntologyDocument; publishedRules: Array<{ id: string; name: string; candidateId: string }> } {
  const next: OntologyDocument = JSON.parse(JSON.stringify(document)) as OntologyDocument;
  const publishedRules: Array<{ id: string; name: string; candidateId: string }> = [];
  const topRuleId = next.top_ontology.nodes["rule-top"] ? "rule-top" : Object.keys(next.top_ontology.nodes)[0];
  const defectTarget = next.spr_ontology.nodes.defect ? "defect" : Object.keys(next.spr_ontology.nodes)[0];
  const rootCauseTarget = next.spr_ontology.nodes["root-cause"] ? "root-cause" : defectTarget;

  for (const candidate of candidates) {
    const id = uniqueSprRuleId(next, candidate);
    const node: SprOntologyNode = {
      id,
      name: candidate.ruleName,
      layer: "spr-rule",
      parent_top_id: topRuleId,
      inheritance_relation: "subclass-of",
      definition: candidate.triggerCondition,
      source_fields: candidate.evidenceFields,
      properties: [
        { name: "defectPattern", description: candidate.defectPattern },
        { name: "rootCauseCandidate", description: candidate.rootCauseCandidate },
        ...candidate.recommendedActions.map((action) => ({ name: "recommendedAction", description: action }))
      ],
      relations: [],
      source_doc: candidate.sourceDocument
    };
    const relations: SprOntologyRelation[] = [
      { id: `${id}-defect`, source: id, target: defectTarget, label: "detectsDefectPattern", type: "objectProperty" },
      { id: `${id}-root-cause`, source: id, target: rootCauseTarget, label: "hasRootCauseCandidate", type: "objectProperty" }
    ];
    const mapping: TopSprMapping = {
      id: `mapping-${id}`,
      top_id: topRuleId,
      spr_id: id,
      relation: "candidate-extension",
      evidence: candidate.sourceExcerpt,
      source_section: candidate.sourceDocument
    };

    next.spr_ontology.nodes[id] = node;
    next.spr_ontology.relations = [
      ...next.spr_ontology.relations.filter((relation) => !relations.some((item) => item.id === relation.id)),
      ...relations
    ];
    next.top_spr_mappings = [
      ...next.top_spr_mappings.filter((item) => item.id !== mapping.id),
      mapping
    ];
    publishedRules.push({ id, name: candidate.ruleName, candidateId: candidate.candidateId });
  }
  next.generatedAt = new Date().toISOString();
  const validation = validateOntologyDocument(next);
  if (!validation.success || !validation.document) throw new Error(`published ontology is invalid: ${validation.errors.join("; ")}`);
  return { document: validation.document, publishedRules };
}

function uniqueSprRuleId(document: OntologyDocument, candidate: RuleExtractionCandidate): string {
  const base = `rule-${slugify(candidate.ruleName) || candidate.candidateId.replace(/^candidate-/, "").slice(0, 32)}`;
  let id = base;
  let index = 2;
  while (document.spr_ontology.nodes[id] && document.spr_ontology.nodes[id].name !== candidate.ruleName) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
}

function normalizeReviewStatus(value: string): RuleReviewStatus {
  return value === "approved" || value === "rejected" ? value : "pending";
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeFault(value: string | undefined): string {
  if (!value || value === "-") return "正常或未标记";
  return value.replace(/^DDC:\s*/, "");
}

function json(value: unknown, env: Env, status = 200): Response {
  return withCors(JSON.stringify(value), env, status, { "content-type": "application/json; charset=utf-8" });
}

function owl(value: string, env: Env, status = 200): Response {
  return withCors(value, env, status, { "content-type": "application/rdf+xml; charset=utf-8" });
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
