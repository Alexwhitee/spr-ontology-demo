import demoDataset from "../data/processed/demo-dataset.json";
import { describe, expect, it } from "vitest";
import {
  buildDetectionFlowSteps,
  buildDetectionTraceSteps,
  buildRecordOptionLabel,
  summarizeDetectionOutcome,
  type DetectionRequestPhase
} from "../frontend/src/features/owl2-workbench/owl2WorkbenchState";
import { analyzeRootCause, createWarningReport, runDetection, type DemoDataset } from "../shared/ontology-service";

const dataset = demoDataset as unknown as DemoDataset;

describe("owl2 workbench presentation state", () => {
  it("labels records by semantic meaning instead of raw numeric prediction codes", () => {
    const ripRop = dataset.records.find((record) => record.faultCode?.includes("高于包络线"));
    const main = dataset.records.find((record) => record.source === "main" && record.predictionCategory);
    expect(ripRop).toBeTruthy();
    expect(main).toBeTruthy();

    expect(buildRecordOptionLabel(ripRop!)).toContain("故障：铆接曲线高于包络线");
    expect(buildRecordOptionLabel(main!)).toContain("pre编码：");
  });

  it("builds a visible API progress story for idle, running, and completed detection", async () => {
    const record = dataset.records.find((item) => item.faultCode?.includes("高于包络线"))!;
    const idleSteps = buildDetectionFlowSteps({ phase: "idle", recordId: record.id, detection: null, rootCause: null, report: null });
    expect(idleSteps.map((step) => step.status)).toEqual(["ready", "pending", "pending", "pending", "pending"]);

    const runningSteps = buildDetectionFlowSteps({ phase: "detecting", recordId: record.id, detection: null, rootCause: null, report: null });
    expect(runningSteps.some((step) => step.status === "running" && step.title.includes("调用检测 API"))).toBe(true);

    const detection = await runDetection(dataset, { recordId: record.id, modelMode: "mock", includeCurveSummary: true });
    const rootCause = analyzeRootCause(dataset, { anomalyEventId: detection.anomalyEvent?.id ?? "", detection });
    const report = createWarningReport(dataset, { detection, rootCause });
    const completedSteps = buildDetectionFlowSteps({ phase: "complete", recordId: record.id, detection, rootCause, report });

    expect(completedSteps.map((step) => step.status)).toEqual(["done", "done", "done", "done", "done"]);
    expect(completedSteps.at(-1)?.detail).toContain(report.title);
  });

  it("summarizes LLM detection output in demo-friendly language", async () => {
    const record = dataset.records.find((item) => item.faultCode?.includes("高于包络线"))!;
    const detection = await runDetection(dataset, { recordId: record.id, modelMode: "mock", includeCurveSummary: true });
    const summary = summarizeDetectionOutcome(detection);

    expect(summary.confidenceLabel).toMatch(/%$/);
    expect(summary.modeLabel).toBe("本体规则演示");
    expect(summary.categoryLabel).toBe("曲线高于包络线");
    expect(summary.decision).toContain("需要复核");
  });

  it("marks all API stages as failed when the request fails", () => {
    const phase: DetectionRequestPhase = "error";
    const steps = buildDetectionFlowSteps({ phase, recordId: "main-1", detection: null, rootCause: null, report: null });

    expect(steps[0].status).toBe("done");
    expect(steps.slice(1).every((step) => step.status === "error")).toBe(true);
  });

  it("builds transparent API trace entries with inputs and outputs", async () => {
    const record = dataset.records.find((item) => item.faultCode?.includes("高于包络线"))!;
    const detection = await runDetection(dataset, { recordId: record.id, modelMode: "mock", includeCurveSummary: true });
    const rootCause = analyzeRootCause(dataset, { anomalyEventId: detection.anomalyEvent?.id ?? "", detection });
    const report = createWarningReport(dataset, { detection, rootCause });
    const traces = buildDetectionTraceSteps({ phase: "complete", recordId: record.id, record, detection, rootCause, report });
    const detectTrace = traces.find((step) => step.key === "detect")!;
    const finalTrace = traces.find((step) => step.key === "final")!;

    expect(traces.map((step) => step.key)).toEqual(["input", "detect", "root", "report", "final"]);
    expect(detectTrace.endpoint).toBe("/api/detect/run");
    expect(detectTrace.input).toEqual({ recordId: record.id, includeCurveSummary: true });
    expect((detectTrace.output as typeof detection).prediction.category).toBe("curve_above_envelope");
    expect((finalTrace.output as { triggeredRules: string[] }).triggeredRules).toContain("Rule-Curve-High");
  });
});
