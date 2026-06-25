import demoDataset from "../data/processed/demo-dataset.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../backend/src/index";
import type { DemoDataset } from "../shared/ontology";

const dataset = demoDataset as unknown as DemoDataset;

describe("ontology Worker real API endpoints", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves OWL, detection, root-cause, and warning report endpoints over HTTP", async () => {
    stubDatasetFetch();
    const env = createApiEnv();

    const owl = await worker.fetch(new Request("https://unit.test/api/ontology/owl"), env);
    expect(owl.status).toBe(200);
    expect(owl.headers.get("content-type")).toContain("application/rdf+xml");
    expect(await owl.text()).toContain("SPRInspectionProcess");

    const topOwl = await worker.fetch(new Request("https://unit.test/api/ontology/top.owl"), env);
    expect(topOwl.status).toBe(200);
    expect(topOwl.headers.get("content-type")).toContain("application/rdf+xml");
    const topOwlBody = await topOwl.text();
    expect(topOwlBody).toContain("https://example.com/ontology/top-ontology");
    expect(topOwlBody).toContain("../process.owl");
    expect(topOwlBody).not.toContain("spr.owl");

    const detection = await worker.fetch(jsonRequest("https://unit.test/api/detect/run", {
      recordId: "riprop-2",
      modelMode: "mock",
      includeCurveSummary: true
    }), env);
    expect(detection.status).toBe(200);
    const detectionBody = await detection.json() as { anomalyEvent?: { id: string }; modelInvocationId: string; prediction: { category: string } };
    expect(detectionBody.modelInvocationId).toBe("model-call-riprop-2");
    expect(detectionBody.prediction.category).toBe("curve_above_envelope");

    const rootCause = await worker.fetch(jsonRequest("https://unit.test/api/root-cause/analyze", {
      detection: detectionBody
    }), env);
    expect(rootCause.status).toBe(200);
    const rootCauseBody = await rootCause.json() as { anomalyEventId: string; candidates: Array<{ rootCause: string }> };
    expect(rootCauseBody.anomalyEventId).toBe(detectionBody.anomalyEvent?.id);
    expect(rootCauseBody.candidates.length).toBeGreaterThan(0);

    const report = await worker.fetch(jsonRequest("https://unit.test/api/reports/warning", {
      detection: detectionBody,
      rootCause: rootCauseBody
    }), env);
    expect(report.status).toBe(200);
    const reportBody = await report.json() as { reportId: string; ontologyPath: string[]; triggeredRules: string[] };
    expect(reportBody.reportId).toBe("warning-riprop-2");
    expect(reportBody.ontologyPath).toContain("RootCause");
    expect(reportBody.triggeredRules).toContain("Rule-Curve-High");
  });

  it("returns reviewable rule extraction candidates with source excerpts", async () => {
    stubDatasetFetch();
    const response = await worker.fetch(jsonRequest("https://unit.test/api/knowledge/extract-rules", {
      sourceDocument: "expert-sop.md",
      text: "铆接曲线高于包络线时，需要复核参数集版本并检查铆模状态。"
    }), createApiEnv());

    expect(response.status).toBe(200);
    const body = await response.json() as {
      reviewStatus: string;
      sourceDocument: string;
      candidates: Array<{
        candidateId: string;
        ruleName: string;
        reviewStatus: string;
        sourceExcerpt: string;
        recommendedActions: string[];
      }>;
    };
    expect(body.reviewStatus).toBe("pending");
    expect(body.sourceDocument).toBe("expert-sop.md");
    expect(body.candidates[0].candidateId).toMatch(/^candidate-/);
    expect(body.candidates[0].reviewStatus).toBe("pending");
    expect(body.candidates[0].sourceExcerpt).toContain("铆接曲线");
    expect(body.candidates[0].recommendedActions.length).toBeGreaterThan(0);
  });

  it("imports database rows and immediately serves refreshed dataset and detection results", async () => {
    stubDatasetFetch();
    const env = createApiEnv();

    const imported = await worker.fetch(authorizedJsonRequest("https://unit.test/api/dataset/import", {
      sourceTable: "rip_rop",
      rows: [{
        "实物编号": "auto-e2e-1",
        Devicename: "RIVETER-E2E",
        "程序": "NietProg.E2E",
        "铆钉计数器": "E2E-1",
        "日期/时间": "2026/5/17 13:00:00",
        "故障代码": "DDC: 铆接曲线低于包络线",
        "铆接曲线": "1,2,3",
        "包络线": "5,6,7"
      }]
    }), env);

    expect(imported.status).toBe(200);
    const importedBody = await imported.json() as { importedRecordIds: string[]; dataset: DemoDataset; automationSteps: Array<{ status: string }> };
    expect(importedBody.importedRecordIds).toEqual(["riprop-auto-e2e-1"]);
    expect(importedBody.automationSteps.every((step) => step.status === "done")).toBe(true);
    expect(importedBody.dataset.records.some((record) => record.id === "riprop-auto-e2e-1")).toBe(true);

    const refreshedDataset = await worker.fetch(new Request("https://unit.test/api/dataset"), env);
    expect(((await refreshedDataset.json()) as DemoDataset).records.some((record) => record.id === "riprop-auto-e2e-1")).toBe(true);

    const detection = await worker.fetch(jsonRequest("https://unit.test/api/detect/run", {
      recordId: "riprop-auto-e2e-1",
      modelMode: "mock",
      includeCurveSummary: true
    }), env);
    expect(((await detection.json()) as { prediction: { category: string } }).prediction.category).toBe("curve_below_envelope");
  });

  it("uses MARPP service output when modelMode is marpp", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/spr-detect/detect")) {
        return new Response(JSON.stringify({
          recordId: "riprop-2",
          modelName: "MARPP",
          modelVersion: "spr-marpp-heuristic-v1",
          mode: "live",
          inputCurve: [1, 2, 3],
          reconstructionCurve: [1.1, 2.1, 3.1],
          pointError: [0.1, 0.1, 0.1],
          anomalyScore: 0.83,
          threshold: 0.5,
          riskCategory: "abnormal",
          confidence: 0.86,
          evidence: ["MARPP 实时重构显示该曲线重构误差显著偏高，存在异常风险"],
          durationMs: 9
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/data/curves/riprop-2.json")) {
        return new Response(JSON.stringify({
          id: "riprop-2",
          curves: {
            riveting: Array.from({ length: 120 }, (_, index) => index),
            envelope: Array.from({ length: 120 }, () => 50)
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify(dataset), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }));

    const response = await worker.fetch(jsonRequest("https://unit.test/api/detect/run", {
      recordId: "riprop-2",
      modelMode: "marpp",
      includeCurveSummary: true
    }), createApiEnv({ marpp: true }));

    const body = await response.json() as { modelMode: string; prediction: { category: string; severity: string }; reconstructionPrediction?: { modelName: string; riskCategory: string }; modelDiagnostics?: { attemptedModelMode: string } };
    expect(response.status).toBe(200);
    expect(body.modelMode).toBe("marpp");
    expect(body.prediction.severity).toBe("warning");
    expect(body.reconstructionPrediction?.modelName).toBe("MARPP");
    expect(body.reconstructionPrediction?.riskCategory).toBe("abnormal");
    expect(body.modelDiagnostics?.attemptedModelMode).toBe("marpp");
    expect(JSON.stringify(body)).not.toContain("marpp-secret");
  });

  it("falls back to ontology rules when MARPP service is unavailable", async () => {
    stubDatasetFetch();
    const response = await worker.fetch(jsonRequest("https://unit.test/api/detect/run", {
      recordId: "riprop-2",
      modelMode: "marpp",
      includeCurveSummary: true
    }), createApiEnv());

    const body = await response.json() as { modelMode: string; prediction: { category: string }; modelDiagnostics?: { attemptedModelMode: string; fallbackReason?: string } };
    expect(response.status).toBe(200);
    expect(body.modelMode).toBe("mock");
    expect(body.modelDiagnostics?.attemptedModelMode).toBe("marpp");
    expect(body.modelDiagnostics?.fallbackReason).toContain("SPR_DETECTOR_API_BASE_URL");
  });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function authorizedJsonRequest(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { authorization: "Bearer secret", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function stubDatasetFetch() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(dataset), {
    status: 200,
    headers: { "content-type": "application/json" }
  })));
}

function createApiEnv(options: { marpp?: boolean } = {}) {
  return {
    ALLOWED_ORIGIN: "*",
    ADMIN_TOKEN: "secret",
    DATASET_URL: "https://unit.test/data/demo-dataset.json",
    CURVE_BASE_URL: "https://unit.test/data/curves",
    ...(options.marpp ? {
      SPR_DETECTOR_API_BASE_URL: "https://marpp.unit.test",
      SPR_DETECTOR_TIMEOUT_MS: "3000",
      SPR_DETECTOR_API_KEY: "marpp-secret"
    } : {})
  };
}
