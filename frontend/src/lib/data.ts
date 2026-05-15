import type { DemoDataset, OntologyDocument, OntologyOperation, ProcessRecord } from "../types/demo";
import { validateOntologyDocument } from "../../../shared/ontology";
import type {
  DetectionRequest,
  DetectionResult,
  RootCauseAnalysis,
  RuleExtractionCandidate,
  RuleExtractionRequest,
  RuleExtractionResponse,
  RuleReviewStatus,
  WarningReport
} from "../../../shared/ontology-service";
import { labelApiError } from "../i18n/zhCN";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
const DATA_MODE = import.meta.env.VITE_DATA_MODE as string | undefined;

export async function loadDataset(): Promise<DemoDataset> {
  const url = DATA_MODE === "api" && API_BASE ? `${API_BASE}/api/dataset` : "/data/demo-dataset.json";
  const response = await fetch(url);
  if (!response.ok) throw new Error(`无法加载演示数据：${response.status}`);
  return response.json() as Promise<DemoDataset>;
}

export async function loadRecordCurves(record: ProcessRecord): Promise<ProcessRecord> {
  if (record.curves) return record;

  const url = DATA_MODE === "api" && API_BASE ? `${API_BASE}/api/curves/${record.id}` : `/data/curves/${record.id}.json`;
  const response = await fetch(url);
  if (!response.ok) return record;
  const detail = (await response.json()) as Pick<ProcessRecord, "curves" | "curveSummary">;
  return {
    ...record,
    curves: detail.curves,
    curveSummary: detail.curveSummary ?? record.curveSummary
  };
}

export async function loadCurrentOntologyDocument(): Promise<OntologyDocument> {
  const response = await fetch(apiUrl("/api/ontology/current"));
  if (!response.ok) throw new Error(`无法加载云端本体：${response.status}`);
  return parseOntologyDocument(await response.json());
}

export async function importOntologyDocument(document: OntologyDocument, token: string, message = "Import ontology JSON"): Promise<{ versionId: string; document: OntologyDocument }> {
  const response = await fetch(apiUrl("/api/ontology/import"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ document, message })
  });
  return readOntologyWriteResponse(response);
}

export async function applyRemoteOntologyOperations(operations: OntologyOperation[], token: string, message = "Apply ontology operations"): Promise<{ versionId: string; document: OntologyDocument }> {
  const response = await fetch(apiUrl("/api/ontology/operations"), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ operations, message })
  });
  return readOntologyWriteResponse(response);
}

export async function loadOntologyVersions(): Promise<Array<{ id: string; created_at: string; message: string; object_key: string }>> {
  const response = await fetch(apiUrl("/api/ontology/versions"));
  if (!response.ok) throw new Error(`无法加载本体版本：${response.status}`);
  return response.json() as Promise<Array<{ id: string; created_at: string; message: string; object_key: string }>>;
}

export async function restoreOntologyVersion(versionId: string, token: string): Promise<{ versionId: string; document: OntologyDocument }> {
  const response = await fetch(apiUrl(`/api/ontology/versions/${encodeURIComponent(versionId)}/restore`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ message: `Restore ${versionId}` })
  });
  return readOntologyWriteResponse(response);
}

export async function runRemoteDetection(request: Omit<DetectionRequest, "llm">): Promise<DetectionResult> {
  return postJson("/api/detect/run", request);
}

export async function analyzeRemoteRootCause(request: { recordId?: string; anomalyEventId?: string; detection?: DetectionResult }): Promise<RootCauseAnalysis> {
  return postJson("/api/root-cause/analyze", request);
}

export async function createRemoteWarningReport(request: { recordId?: string; detection?: DetectionResult; rootCause?: RootCauseAnalysis }): Promise<WarningReport> {
  return postJson("/api/reports/warning", request);
}

export async function extractKnowledgeRules(request: RuleExtractionRequest): Promise<RuleExtractionResponse> {
  return postJson("/api/knowledge/extract-rules", request);
}

export async function loadKnowledgeRuleCandidates(): Promise<RuleExtractionCandidate[]> {
  const response = await fetch(apiUrl("/api/knowledge/rule-candidates"));
  const value = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(labelApiError(value.error, response.status));
  return value as RuleExtractionCandidate[];
}

export async function reviewKnowledgeRuleCandidate(candidateId: string, reviewStatus: RuleReviewStatus, token: string): Promise<RuleExtractionCandidate> {
  const response = await fetch(apiUrl(`/api/knowledge/rule-candidates/${encodeURIComponent(candidateId)}/review`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ reviewStatus })
  });
  const value = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(labelApiError(value.error, response.status));
  return value as RuleExtractionCandidate;
}

export async function publishKnowledgeRules(candidateIds: string[], token: string): Promise<{ versionId: string; publishedRules: Array<{ id: string; name: string; candidateId?: string }>; document?: OntologyDocument }> {
  const response = await fetch(apiUrl("/api/knowledge/publish-rules"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ candidateIds })
  });
  const value = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(labelApiError(value.error, response.status));
  return value as { versionId: string; publishedRules: Array<{ id: string; name: string; candidateId?: string }>; document?: OntologyDocument };
}

export async function loadRemoteOwl(): Promise<string> {
  const response = await fetch(apiUrl("/api/ontology/owl"));
  if (!response.ok) throw new Error(`无法导出 OWL2：${response.status}`);
  return response.text();
}

function apiUrl(path: string): string {
  return DATA_MODE === "api" && API_BASE ? `${API_BASE}${path}` : path;
}

function authHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json"
  };
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const value = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(labelApiError(value.error, response.status));
  return value as T;
}

async function readOntologyWriteResponse(response: Response): Promise<{ versionId: string; document: OntologyDocument }> {
  const body = await response.json().catch(() => ({})) as { details?: string[]; error?: string; versionId?: string; document?: unknown };
  if (!response.ok) throw new Error(body?.details?.join?.("\n") ?? labelApiError(body?.error, response.status));
  if (!body.versionId) throw new Error("Worker 写入响应缺少 versionId，请确认已部署最新 Worker。");
  return {
    versionId: body.versionId,
    document: parseOntologyDocument(body.document)
  };
}

export function parseOntologyDocument(value: unknown): OntologyDocument {
  const validation = validateOntologyDocument(value);
  if (!validation.success || !validation.document) {
    throw new Error(`Worker 返回的本体文档无效：${validation.errors.join("；") || "空响应"}`);
  }
  return validation.document;
}
