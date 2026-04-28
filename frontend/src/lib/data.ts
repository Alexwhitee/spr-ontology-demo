import type { DemoDataset, OntologyDocument, OntologyOperation, ProcessRecord } from "../types/demo";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
const DATA_MODE = import.meta.env.VITE_DATA_MODE as string | undefined;

export async function loadDataset(): Promise<DemoDataset> {
  const url = DATA_MODE === "api" && API_BASE ? `${API_BASE}/api/dataset` : "/data/demo-dataset.json";
  const response = await fetch(url);
  if (!response.ok) throw new Error(`无法加载 Demo 数据：${response.status}`);
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
  return response.json() as Promise<OntologyDocument>;
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

function apiUrl(path: string): string {
  return DATA_MODE === "api" && API_BASE ? `${API_BASE}${path}` : path;
}

function authHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json"
  };
}

async function readOntologyWriteResponse(response: Response): Promise<{ versionId: string; document: OntologyDocument }> {
  const body = await response.json().catch(() => ({})) as { details?: string[]; error?: string };
  if (!response.ok) throw new Error(body?.details?.join?.("\n") ?? body?.error ?? `本体写入失败：${response.status}`);
  return body as { versionId: string; document: OntologyDocument };
}
