import demoDataset from "../data/processed/demo-dataset.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOntologyDocumentFromDataset, type DemoDataset } from "../shared/ontology";
import {
  createRemoteWarningReport,
  extractKnowledgeRules,
  importDatabaseRowsRemote,
  loadKnowledgeRuleCandidates,
  parseOntologyDocument,
  publishKnowledgeRules,
  resolveApiUrl,
  reviewKnowledgeRuleCandidate,
  runRemoteDetection
} from "../frontend/src/lib/data";

const dataset = demoDataset as unknown as DemoDataset;

describe("ontology data client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects stale worker health responses before the editor uses them", () => {
    expect(() => parseOntologyDocument({ status: "ok", service: "spr-demo-api" })).toThrow("Worker");
  });

  it("accepts valid ontology documents returned by the worker", () => {
    const document = createOntologyDocumentFromDataset(dataset);

    expect(parseOntologyDocument(document).spr_ontology.nodes.record.name).toContain("SPR");
  });

  it("uses the deployed Worker as the production API fallback when Vite env is missing", () => {
    expect(resolveApiUrl("/api/detect/run", { dataMode: undefined, apiBaseUrl: undefined, isProduction: true }))
      .toBe("https://spr-demo-api.r3694211.workers.dev/api/detect/run");
    expect(resolveApiUrl("/api/detect/run", { dataMode: undefined, apiBaseUrl: undefined, isProduction: false }))
      .toBe("/api/detect/run");
  });

  it("posts detection requests to the Worker API instead of using the local mock function", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        recordId: "riprop-102",
        inspectionProcessId: "inspection-riprop-102",
        modelInvocationId: "model-call-riprop-102",
        modelMode: "mock",
        prediction: {
          category: "curve_above_envelope",
          confidence: 0.86,
          severity: "warning",
          evidence: ["fault code"],
          needsReview: true
        },
        anomalyEvent: {
          id: "anomaly-riprop-102",
          type: "curve high",
          severity: "warning"
        },
        ontologyPath: ["SPRProcessRecord", "SPRInspectionProcess"]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const result = await runRemoteDetection({
      recordId: "riprop-102",
      modelMode: "mock",
      includeCurveSummary: true
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/detect/run");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      recordId: "riprop-102",
      modelMode: "mock",
      includeCurveSummary: true
    });
    expect(result.modelInvocationId).toBe("model-call-riprop-102");
  });

  it("posts warning report creation through the Worker API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      reportId: "warning-riprop-102",
      title: "SPR warning",
      severity: "warning",
      summary: "review required",
      ontologyPath: ["SPRInspectionProcess", "RootCause"],
      triggeredRules: ["Rule-Curve-High"],
      actions: ["review parameters"]
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const result = await createRemoteWarningReport({ recordId: dataset.records[0].id });

    expect(result.reportId).toBe("warning-riprop-102");
    expect(result.triggeredRules).toContain("Rule-Curve-High");
  });

  it("submits expert text to the Worker rule extraction review queue", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        reviewStatus: "pending",
        sourceDocument: "spr-sop.md",
        candidates: [{
          candidateId: "candidate-1",
          ruleName: "Curve high review",
          reviewStatus: "pending",
          sourceExcerpt: "curve above envelope",
          evidenceFields: ["faultCode"],
          recommendedActions: ["review parameter set"]
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const result = await extractKnowledgeRules({
      sourceDocument: "spr-sop.md",
      text: "curve above envelope should trigger review"
    });

    expect(calls[0].url).toBe("/api/knowledge/extract-rules");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      sourceDocument: "spr-sop.md",
      text: "curve above envelope should trigger review"
    });
    expect(result.candidates[0].candidateId).toBe("candidate-1");
    expect(result.candidates[0].reviewStatus).toBe("pending");
  });

  it("loads, reviews, and publishes persistent knowledge rule candidates through the Worker API", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/api/knowledge/rule-candidates")) {
        return new Response(JSON.stringify([{
          candidateId: "candidate-1",
          ruleName: "Curve high review",
          reviewStatus: "pending",
          sourceExcerpt: "curve above envelope",
          evidenceFields: ["faultCode"],
          recommendedActions: ["review parameter set"]
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (String(url).endsWith("/api/knowledge/rule-candidates/candidate-1/review")) {
        return new Response(JSON.stringify({
          candidateId: "candidate-1",
          ruleName: "Curve high review",
          reviewStatus: "approved"
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        versionId: "version-1",
        publishedRules: [{ id: "rule-candidate-1", name: "Curve high review" }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const candidates = await loadKnowledgeRuleCandidates();
    const reviewed = await reviewKnowledgeRuleCandidate("candidate-1", "approved", "secret");
    const published = await publishKnowledgeRules(["candidate-1"], "secret");

    expect(candidates[0].candidateId).toBe("candidate-1");
    expect(reviewed.reviewStatus).toBe("approved");
    expect(published.versionId).toBe("version-1");
    expect(calls.map((call) => call.url)).toEqual([
      "/api/knowledge/rule-candidates",
      "/api/knowledge/rule-candidates/candidate-1/review",
      "/api/knowledge/publish-rules"
    ]);
    expect((calls[1].init?.headers as Record<string, string>).authorization).toBe("Bearer secret");
  });

  it("posts imported database rows to the Worker and receives the refreshed dataset", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        dataset: {
          ...dataset,
          records: [...dataset.records, { ...dataset.records[0], id: "riprop-auto-1" }]
        },
        importedRecordIds: ["riprop-auto-1"],
        automationSteps: [{ key: "records", title: "记录导入", detail: "已导入", status: "done" }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const result = await importDatabaseRowsRemote({
      sourceTable: "rip_rop",
      rows: [{ "实物编号": "auto-1", "故障代码": "DDC: 铆接曲线高于包络线" }]
    }, "secret");

    expect(calls[0].url).toBe("/api/dataset/import");
    expect(calls[0].init?.method).toBe("POST");
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe("Bearer secret");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      sourceTable: "rip_rop",
      rows: [{ "实物编号": "auto-1", "故障代码": "DDC: 铆接曲线高于包络线" }]
    });
    expect(result.importedRecordIds).toEqual(["riprop-auto-1"]);
    expect(result.dataset.records.some((record) => record.id === "riprop-auto-1")).toBe(true);
  });
});
