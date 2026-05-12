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
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function stubDatasetFetch() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(dataset), {
    status: 200,
    headers: { "content-type": "application/json" }
  })));
}

function createApiEnv() {
  return {
    ALLOWED_ORIGIN: "*",
    DATASET_URL: "https://unit.test/data/demo-dataset.json"
  };
}
