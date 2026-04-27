import type { DemoDataset, ProcessRecord } from "../types/demo";

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
