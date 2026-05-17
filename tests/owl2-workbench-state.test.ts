import demoDataset from "../data/processed/demo-dataset.json";
import { describe, expect, it } from "vitest";
import {
  buildDetectionFlowSteps,
  buildDetectionTraceExplanations,
  buildDetectionTraceSteps,
  buildRecordOptionLabel,
  buildRecordOptionGroups,
  TRACE_EXPLANATION_LABELS,
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

    expect(buildRecordOptionLabel(ripRop!)).toContain("RIP_ROP 表");
    expect(buildRecordOptionLabel(ripRop!)).toContain("故障代码：铆接曲线高于包络线");
    expect(buildRecordOptionLabel(ripRop!)).toContain("记录ID");
    expect(buildRecordOptionLabel(main!)).toContain("main 主表");
    expect(buildRecordOptionLabel(main!)).toContain("预测编码 pre=");
    expect(buildRecordOptionLabel(main!)).toContain("业务含义待确认");
    expect(buildRecordOptionLabel(main!)).not.toMatch(/^main-\d+ \/ pre编码/);
  });

  it("groups record picker options by source table with beginner-readable table explanations", () => {
    const selected = dataset.records.find((record) => record.source === "rip_rop")!;
    const groups = buildRecordOptionGroups(dataset.records, selected.id);

    expect(groups.map((group) => group.source)).toEqual(["rip_rop", "main"]);
    expect(groups[0].label).toContain("RIP_ROP 表");
    expect(groups[0].description).toContain("故障代码");
    expect(groups[1].label).toContain("main 主表");
    expect(groups[1].description).toContain("pre");
    expect(groups[0].records.some((record) => record.id === selected.id)).toBe(true);
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

  it("explains each transparent trace step in beginner-friendly Chinese", async () => {
    const record = dataset.records.find((item) => item.faultCode?.includes("高于包络线"))!;
    const detection = await runDetection(dataset, { recordId: record.id, modelMode: "mock", includeCurveSummary: true });
    const rootCause = analyzeRootCause(dataset, { anomalyEventId: detection.anomalyEvent?.id ?? "", detection });
    const report = createWarningReport(dataset, { detection, rootCause });
    const traces = buildDetectionTraceSteps({ phase: "complete", recordId: record.id, record, detection, rootCause, report });
    const explanations = buildDetectionTraceExplanations(traces);

    expect(explanations).toHaveLength(traces.length);
    expect(explanations.map((item) => item.stepKey)).toEqual(traces.map((step) => step.key));
    expect(TRACE_EXPLANATION_LABELS.inputMeaning).toBe("输入数据说明");
    expect(TRACE_EXPLANATION_LABELS.callMeaning).toBe("接口调用方式");
    expect(TRACE_EXPLANATION_LABELS.operationMeaning).toBe("系统处理逻辑");
    expect(TRACE_EXPLANATION_LABELS.outputMeaning).toBe("输出结果说明");
    expect(Object.values(TRACE_EXPLANATION_LABELS).join("\n")).not.toContain("是什么意思");
    expect(Object.values(TRACE_EXPLANATION_LABELS).join("\n")).not.toContain("怎么调用");
    expect(explanations[0].inputMeaning).toContain("ProcessRecord");
    expect(explanations.find((item) => item.stepKey === "detect")?.callMeaning).toContain("POST /api/detect/run");
    expect(explanations.find((item) => item.stepKey === "root")?.operationMeaning).toContain("根因");
    expect(explanations.find((item) => item.stepKey === "report")?.outputMeaning).toContain("复核动作");
    expect(explanations.at(-1)?.plainLanguageSummary).toContain("从数据库记录到预警报告");
  });
});
