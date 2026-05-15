import type { ProcessRecord } from "../../types/demo";
import type { DetectionResult, RootCauseAnalysis, WarningReport } from "../../../../shared/ontology-service";

export type DetectionRequestPhase = "idle" | "detecting" | "analyzing" | "reporting" | "complete" | "error";
export type FlowStepStatus = "ready" | "pending" | "running" | "done" | "error";

export type DetectionFlowStep = {
  key: string;
  title: string;
  detail: string;
  status: FlowStepStatus;
};

export type DetectionApiCallKey = "detect" | "root" | "report";

export type DetectionApiRuntimeCall = {
  key: DetectionApiCallKey;
  title: string;
  method: "POST";
  endpoint: string;
  status: FlowStepStatus;
  request: unknown;
  response?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
};

export type DetectionTraceStep = {
  key: "input" | DetectionApiCallKey | "final";
  title: string;
  description: string;
  method?: "POST";
  endpoint?: string;
  status: FlowStepStatus;
  input: unknown;
  output?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
};

export type DetectionFlowState = {
  phase: DetectionRequestPhase;
  recordId: string;
  detection: DetectionResult | null;
  rootCause: RootCauseAnalysis | null;
  report: WarningReport | null;
};

export function buildRecordOptionLabel(record: ProcessRecord): string {
  const fault = normalizeFaultCode(record.faultCode);
  if (fault) return `${record.id} / 故障：${fault}`;
  if (record.predictionCategory) return `${record.id} / pre编码：${record.predictionCategory}`;
  return `${record.id} / 未触发明确故障`;
}

export function buildRecordInputSummary(record: ProcessRecord | undefined): Array<{ label: string; value: string }> {
  if (!record) return [{ label: "记录", value: "未选择" }];
  return [
    { label: "记录 ID", value: record.id },
    { label: "来源表", value: record.source === "rip_rop" ? "RIP_ROP" : "主数据库 main" },
    { label: "设备", value: record.deviceName || "未提供" },
    { label: "程序", value: record.program || "未提供" },
    { label: "质量线索", value: normalizeFaultCode(record.faultCode) || (record.predictionCategory ? `pre 编码 ${record.predictionCategory}` : "未触发明确故障") }
  ];
}

export function buildDetectionFlowSteps(state: DetectionFlowState): DetectionFlowStep[] {
  const { phase, recordId, detection, rootCause, report } = state;
  const errorMode = phase === "error";
  const inputStatus: FlowStepStatus = recordId ? "done" : "ready";
  return [
    {
      key: "input",
      title: "输入记录",
      detail: recordId ? `把 ${recordId} 的字段、曲线摘要和本体路径作为检测输入。` : "先选择一条过程记录。",
      status: phase === "idle" ? "ready" : inputStatus
    },
    {
      key: "detect",
      title: "调用检测 API",
      detail: detection
        ? `${detection.modelMode === "llm" ? "LLM" : "本体规则"} 返回 ${categoryLabel(detection.prediction.category)}，置信度 ${formatPercent(detection.prediction.confidence)}。`
        : "POST /api/detect/run，Worker 读取模型配置并生成结构化预测。",
      status: statusForStep(phase, "detecting", Boolean(detection), errorMode)
    },
    {
      key: "root",
      title: "根因分析",
      detail: rootCause?.candidates[0]
        ? `首要候选：${rootCause.candidates[0].rootCause}，建议：${rootCause.candidates[0].recommendation}。`
        : "POST /api/root-cause/analyze，把异常映射到根因候选和复核动作。",
      status: statusForStep(phase, "analyzing", Boolean(rootCause), errorMode)
    },
    {
      key: "report",
      title: "生成预警报告",
      detail: report ? `${report.title}，输出 ${report.actions.length} 条复核动作。` : "POST /api/reports/warning，形成可汇报的预警摘要。",
      status: statusForStep(phase, "reporting", Boolean(report), errorMode)
    },
    {
      key: "explain",
      title: "展示语义结论",
      detail: report ? `${report.title}，沿 ${report.ontologyPath.join(" -> ")} 解释输入、模型、异常、根因和报告。` : "完成后展示置信度、证据、根因、报告和 OWL2 路径。",
      status: phase === "complete" ? "done" : errorMode ? "error" : "pending"
    }
  ];
}

export function buildDetectionTraceSteps(state: DetectionFlowState & {
  record?: ProcessRecord;
  calls?: Partial<Record<DetectionApiCallKey, DetectionApiRuntimeCall>>;
}): DetectionTraceStep[] {
  const { phase, recordId, record, detection, rootCause, report, calls = {} } = state;
  const errorMode = phase === "error";
  const detectCall = calls.detect;
  const rootCall = calls.root;
  const reportCall = calls.report;

  return [
    {
      key: "input",
      title: "输入准备",
      description: "从所选过程记录组装检测请求，保留原始字段、曲线摘要和语义路径。",
      status: phase === "idle" ? "ready" : recordId ? "done" : "ready",
      input: buildRecordTraceInput(record),
      output: recordId ? {
        recordId,
        includeCurveSummary: true,
        next: "POST /api/detect/run",
        semanticPath: ["SPRProcessRecord", "SPRInspectionProcess", "DetectionModel"]
      } : "等待选择过程记录"
    },
    buildApiTraceStep({
      key: "detect",
      title: "检测 API",
      endpoint: "/api/detect/run",
      description: "调用 Worker 检测接口，返回模型或规则的结构化预测结果。",
      fallbackStatus: statusForStep(phase, "detecting", Boolean(detection), errorMode),
      fallbackInput: { recordId, includeCurveSummary: true },
      fallbackOutput: detection,
      call: detectCall
    }),
    buildApiTraceStep({
      key: "root",
      title: "根因分析 API",
      endpoint: "/api/root-cause/analyze",
      description: "把检测结果中的异常事件映射到根因候选、证据字段和建议动作。",
      fallbackStatus: statusForStep(phase, "analyzing", Boolean(rootCause), errorMode),
      fallbackInput: detection ? { detection } : "等待检测 API 输出",
      fallbackOutput: rootCause,
      call: rootCall
    }),
    buildApiTraceStep({
      key: "report",
      title: "预警报告 API",
      endpoint: "/api/reports/warning",
      description: "把检测结果和根因分析整理成可复核、可汇报的预警报告。",
      fallbackStatus: statusForStep(phase, "reporting", Boolean(report), errorMode),
      fallbackInput: detection && rootCause ? { detection, rootCause } : "等待根因分析 API 输出",
      fallbackOutput: report,
      call: reportCall
    }),
    {
      key: "final",
      title: "最终透明结论",
      description: "汇总完整链路输出，方便从输入记录追溯到模型判断、根因和报告动作。",
      status: phase === "complete" ? "done" : errorMode ? "error" : "pending",
      input: { detection, rootCause, report },
      output: report ? {
        decision: summarizeDetectionOutcome(detection).decision,
        severity: report.severity,
        triggeredRules: report.triggeredRules,
        actions: report.actions,
        ontologyPath: report.ontologyPath
      } : "等待全流程完成"
    }
  ];
}

export function summarizeDetectionOutcome(detection: DetectionResult | null): {
  confidenceLabel: string;
  modeLabel: string;
  categoryLabel: string;
  severityLabel: string;
  decision: string;
} {
  if (!detection) {
    return {
      confidenceLabel: "--",
      modeLabel: "待调用",
      categoryLabel: "未检测",
      severityLabel: "待运行",
      decision: "选择记录后点击运行，系统会返回模型判断、证据、根因和预警报告。"
    };
  }
  const needsReview = detection.prediction.needsReview || detection.prediction.severity !== "normal";
  return {
    confidenceLabel: formatPercent(detection.prediction.confidence),
    modeLabel: detection.modelMode === "llm" ? "阿里云 Qwen LLM" : "本体规则演示",
    categoryLabel: categoryLabel(detection.prediction.category),
    severityLabel: severityLabel(detection.prediction.severity),
    decision: needsReview ? "需要复核：该记录触发了质量异常线索。" : "无需阻塞：该记录未触发阻塞性质量规则。"
  };
}

export function statusText(status: FlowStepStatus): string {
  return {
    ready: "就绪",
    pending: "等待",
    running: "运行中",
    done: "完成",
    error: "失败"
  }[status];
}

function buildApiTraceStep(input: {
  key: DetectionApiCallKey;
  title: string;
  endpoint: string;
  description: string;
  fallbackStatus: FlowStepStatus;
  fallbackInput: unknown;
  fallbackOutput?: unknown;
  call?: DetectionApiRuntimeCall;
}): DetectionTraceStep {
  return {
    key: input.key,
    title: input.call?.title ?? input.title,
    description: input.description,
    method: input.call?.method ?? "POST",
    endpoint: input.call?.endpoint ?? input.endpoint,
    status: input.call?.status ?? input.fallbackStatus,
    input: input.call?.request ?? input.fallbackInput,
    output: input.call?.response ?? input.fallbackOutput,
    error: input.call?.error,
    startedAt: input.call?.startedAt,
    finishedAt: input.call?.finishedAt,
    durationMs: input.call?.durationMs
  };
}

function buildRecordTraceInput(record: ProcessRecord | undefined): unknown {
  if (!record) return "未选择过程记录";
  return {
    id: record.id,
    source: record.source,
    lineName: record.lineName,
    deviceName: record.deviceName,
    program: record.program,
    rivetId: record.rivetId,
    carBodyId: record.carBodyId,
    timestamp: record.timestamp,
    faultCode: record.faultCode,
    predictionCategory: record.predictionCategory,
    errorRate: record.errorRate,
    curveSummary: record.curveSummary,
    raw: record.raw
  };
}

function statusForStep(phase: DetectionRequestPhase, current: DetectionRequestPhase, hasValue: boolean, errorMode: boolean): FlowStepStatus {
  if (errorMode) return "error";
  if (hasValue || phase === "complete") return "done";
  if (phase === current) return "running";
  return "pending";
}

function normalizeFaultCode(value: string | undefined): string {
  if (!value || value === "-") return "";
  return value.replace(/^DDC:\s*/, "");
}

function categoryLabel(value: DetectionResult["prediction"]["category"]): string {
  return {
    normal: "正常",
    curve_above_envelope: "曲线高于包络线",
    curve_below_envelope: "曲线低于包络线",
    press_stroke_high: "冲压行程过大",
    prediction_review: "预测结果待复核"
  }[value];
}

function severityLabel(value: DetectionResult["prediction"]["severity"]): string {
  return {
    normal: "正常",
    warning: "预警",
    critical: "严重"
  }[value];
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
