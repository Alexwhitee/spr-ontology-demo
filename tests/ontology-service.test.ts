import demoDataset from "../data/processed/demo-dataset.json";
import { describe, expect, it } from "vitest";
import {
  analyzeRootCause,
  buildOntologyWorkbenchGraph,
  createWarningReport,
  exportOwlXml,
  extractRuleCandidatesWithLlm,
  listOntologyClasses,
  listQualityRules,
  runDetection,
  validateOwlXml,
  validateOwl2Artifacts,
  type DemoDataset
} from "../shared/ontology-service";

const dataset = demoDataset as unknown as DemoDataset;

describe("OWL2 ontology service core", () => {
  it("exports OWL2 modules with the required ontology classes and properties", () => {
    const owl = exportOwlXml(dataset);

    expect(owl).toContain("owl:Ontology");
    expect(owl).toContain("SPRInspectionProcess");
    expect(owl).toContain("DetectionModel");
    expect(owl).toContain("WarningReport");
    expect(owl).toContain("hasInspectionProcess");
    expect(owl).toContain("hasRootCauseCandidate");
  });

  it("validates semantic artifacts and keeps unresolved field semantics as warnings", () => {
    const result = validateOwl2Artifacts(dataset);

    expect(result.success).toBe(true);
    expect(result.metrics.classes).toBeGreaterThan(25);
    expect(result.metrics.objectProperties).toBeGreaterThan(10);
    expect(result.metrics.rules).toBeGreaterThanOrEqual(4);
    expect(result.warnings.some((warning) => warning.code === "FIELD_NEEDS_CONFIRMATION")).toBe(true);
  });

  it("runs detection, root-cause analysis, and warning report generation from ontology rules", async () => {
    const record = dataset.records.find((item) => item.faultCode?.includes("高于包络线")) ?? dataset.records.find((item) => item.source === "rip_rop");
    expect(record).toBeTruthy();

    const detection = await runDetection(dataset, { recordId: record!.id, modelMode: "mock", includeCurveSummary: true });
    const rootCause = analyzeRootCause(dataset, { anomalyEventId: detection.anomalyEvent?.id ?? "", detection });
    const report = createWarningReport(dataset, { detection, rootCause });

    expect(detection.inspectionProcessId).toBe(`inspection-${record!.id}`);
    expect(detection.prediction.category).toBe("curve_above_envelope");
    expect(detection.prediction.evidence.join("\n")).toContain("包络线");
    expect(rootCause.candidates[0].rootCause).toContain("参数");
    expect(report.ontologyPath).toEqual(["SPRInspectionProcess", "InspectionResult", "AnomalyEvent", "DefectPattern", "RootCause"]);
    expect(report.actions.length).toBeGreaterThan(0);
  });

  it("builds a graph-focused ontology workbench model without data graph semantics", () => {
    const graph = buildOntologyWorkbenchGraph(dataset);
    const classes = listOntologyClasses(dataset);
    const rules = listQualityRules();

    expect(graph.nodes.some((node) => node.id === "SPRInspectionProcess" && node.type === "class")).toBe(true);
    expect(graph.nodes.some((node) => node.id === "Rule-Curve-High" && node.type === "rule")).toBe(true);
    expect(graph.edges.some((edge) => edge.label === "invokesModel")).toBe(true);
    expect(graph.nodes.every((node) => !node.label.includes("实例图谱"))).toBe(true);
    expect(classes.some((item) => item.id === "SPRInspectionProcess" && item.module === "spr.owl")).toBe(true);
    expect(rules.map((rule) => rule.id)).toContain("Rule-Curve-High");
  });

  it("uses an OpenAI-compatible LLM endpoint when model configuration is provided", async () => {
    const record = dataset.records.find((item) => item.source === "main" && item.errorRate !== undefined)!;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              category: "prediction_review",
              confidence: 0.77,
              severity: "warning",
              evidence: ["LLM 认为 error_rate 需要复核"],
              needsReview: true
            })
          }
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const detection = await runDetection(dataset, {
      recordId: record.id,
      modelMode: "llm",
      includeCurveSummary: true,
      llm: {
        apiBaseUrl: "https://llm.example.com/v1",
        apiKey: "test-key",
        model: "generic-llm",
        fetchImpl: fakeFetch
      }
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://llm.example.com/v1/chat/completions");
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    expect(JSON.stringify(detection)).not.toContain("test-key");
    expect(detection.modelMode).toBe("llm");
    expect(detection.prediction.category).toBe("prediction_review");
    expect(detection.prediction.evidence).toContain("LLM 认为 error_rate 需要复核");
  });

  it("falls back to review-safe output when the LLM returns invalid structured JSON", async () => {
    const record = dataset.records[0];
    const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: "not-json" } }]
    }), { status: 200, headers: { "content-type": "application/json" } });

    const detection = await runDetection(dataset, {
      recordId: record.id,
      modelMode: "llm",
      llm: {
        apiBaseUrl: "https://llm.example.com/v1",
        apiKey: "test-key",
        model: "generic-llm",
        fetchImpl: fakeFetch
      }
    });

    expect(detection.prediction.category).toBe("prediction_review");
    expect(detection.prediction.needsReview).toBe(true);
    expect(detection.prediction.evidence.join("\n")).toContain("模型输出不是合法 JSON");
  });
});
