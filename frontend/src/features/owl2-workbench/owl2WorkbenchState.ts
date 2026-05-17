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

export type DetectionTraceExplanation = {
  stepKey: DetectionTraceStep["key"];
  title: string;
  inputMeaning: string;
  callMeaning: string;
  operationMeaning: string;
  outputMeaning: string;
  plainLanguageSummary: string;
};

export const TRACE_EXPLANATION_LABELS = {
  inputMeaning: "输入数据说明",
  callMeaning: "接口调用方式",
  operationMeaning: "系统处理逻辑",
  outputMeaning: "输出结果说明"
} as const;

export type RecordOptionGroup = {
  source: ProcessRecord["source"];
  label: string;
  description: string;
  records: ProcessRecord[];
};

export type DetectionFlowState = {
  phase: DetectionRequestPhase;
  recordId: string;
  detection: DetectionResult | null;
  rootCause: RootCauseAnalysis | null;
  report: WarningReport | null;
};

export function buildRecordOptionLabel(record: ProcessRecord): string {
  const fragments = [
    sourceTableLabel(record.source, record.sourceTableName),
    qualityClueLabel(record),
    record.deviceName ? `设备：${record.deviceName}` : "设备：未提供",
    record.timestamp ? `时间：${record.timestamp}` : "时间：未提供",
    `记录ID：${record.id}`
  ];
  return fragments.join(" | ");
}

export function buildRecordOptionGroups(records: ProcessRecord[], selectedRecordId?: string, limitPerSource = 60): RecordOptionGroup[] {
  const selected = selectedRecordId ? records.find((record) => record.id === selectedRecordId) : undefined;
  const sourceOrder: ProcessRecord["source"][] = ["rip_rop", "main", "new_table"];
  const sources = sourceOrder.filter((source) => records.some((record) => record.source === source));
  return sources.map((source) => {
    const sourceRecords = records
      .filter((record) => record.source === source)
      .sort(compareRecordsForPicker);
    const limited = sourceRecords.slice(0, limitPerSource);
    const selectedInSource = selected?.source === source && !limited.some((record) => record.id === selected.id)
      ? [selected, ...limited]
      : limited;
    return {
      source,
      label: recordGroupLabel(source, sourceRecords),
      description: recordGroupDescription(source, sourceRecords),
      records: selectedInSource
    };
  }).filter((group) => group.records.length > 0);
}

export function buildRecordInputSummary(record: ProcessRecord | undefined): Array<{ label: string; value: string }> {
  if (!record) return [{ label: "记录", value: "未选择" }];
  return [
    { label: "记录 ID", value: record.id },
    { label: "来源表", value: sourceTableLabel(record.source, record.sourceTableName) },
    { label: "设备", value: record.deviceName || "未提供" },
    { label: "程序", value: record.program || "未提供" },
    { label: "时间", value: record.timestamp || "未提供" },
    { label: "质量线索", value: qualityClueLabel(record) }
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

export function buildDetectionTraceExplanations(steps: DetectionTraceStep[]): DetectionTraceExplanation[] {
  return steps.map((step) => {
    const endpoint = step.endpoint ? `${step.method} ${step.endpoint}` : "本地整理，不发起网络请求";
    if (step.key === "input") {
      return {
        stepKey: step.key,
        title: step.title,
        inputMeaning: "输入对象是一条已经标准化的 ProcessRecord 过程记录。它把原始数据库行中的设备、程序、时间、车身标识、铆钉编号、故障代码、pre 预测编码、曲线摘要和原始字段统一放到同一个结构中，后续流程不再直接依赖某一张表的字段名称。",
        callMeaning: "本阶段属于页面内的数据准备阶段，不发起新的网络请求。页面会从当前数据集中读取用户选择的记录，并生成后续检测接口需要的 JSON 请求体。",
        operationMeaning: "系统确认记录 ID 后，会保留 recordId 和 includeCurveSummary=true。recordId 用于让后端定位完整记录，includeCurveSummary 表示检测时同步携带曲线统计摘要，便于规则或模型判断曲线是否越过包络线。",
        outputMeaning: "输出结果是检测请求草稿，核心字段包括 recordId、includeCurveSummary 和语义路径。它不是最终检测结论，而是发送到检测 API 前的标准化输入。",
        plainLanguageSummary: "本步骤的作用是把一行数据库数据整理成后端能够稳定识别的检测任务。"
      };
    }
    if (step.key === "detect") {
      return {
        stepKey: step.key,
        title: step.title,
        inputMeaning: "输入数据是检测请求 JSON，通常包含 recordId 和 includeCurveSummary。后端会根据 recordId 读取完整 ProcessRecord，包括故障代码、pre 预测编码、error_rate、铆接曲线摘要和包络线摘要。",
        callMeaning: `接口调用采用 ${endpoint}。请求体以 JSON 形式提交，返回值也使用 JSON，便于页面把检测类别、证据字段和异常事件逐项展示出来。`,
        operationMeaning: "Worker 会先查找记录，再按照本体规则或模型策略进行判断：RIP_ROP 表优先使用故障代码和曲线/包络线摘要；main 主表优先保留 pre 与 error_rate 作为预测线索；新增来源表在字段语义确认前先作为可追溯过程记录保守处理。系统会把结果归入正常、曲线高于包络线、曲线低于包络线、冲压行程过大或预测结果待复核等类别。",
        outputMeaning: "输出结果是结构化检测结论，包含预测类别、置信度、严重等级、证据字段、异常事件和本体路径。页面后续的根因分析和预警报告都基于这个输出继续处理。",
        plainLanguageSummary: "本步骤把一条数据库记录转换成可解释、可追溯的质量检测判断。"
      };
    }
    if (step.key === "root") {
      return {
        stepKey: step.key,
        title: step.title,
        inputMeaning: "输入数据是检测 API 的输出，重点包括异常类别、异常事件、触发证据和本体路径。只有先知道“发生了哪类异常”，根因分析才能继续推断“可能由什么导致”。",
        callMeaning: `接口调用采用 ${endpoint}。页面会把检测结果作为 JSON 请求体传入，不需要用户再次手动填写故障代码或曲线字段。`,
        operationMeaning: "系统根据质量规则和 OWL2 本体关系，把异常事件映射到候选根因。例如曲线高于包络线会关联到铆接力参数偏高、铆模状态异常、设备输出波动等候选原因，并同时保留证据字段。",
        outputMeaning: "输出结果是根因候选列表。每个候选根因都会带有置信度、证据字段和建议复核动作，因此它是辅助人工复核的依据，而不是直接替代人工定责。",
        plainLanguageSummary: "本步骤把检测出的异常继续解释为可复核的原因方向。"
      };
    }
    if (step.key === "report") {
      return {
        stepKey: step.key,
        title: step.title,
        inputMeaning: "输入数据由两部分组成：检测结果说明异常是什么，根因分析结果说明可能原因和证据是什么。预警报告会同时读取这两部分，避免只给出孤立的模型分数。",
        callMeaning: `接口调用采用 ${endpoint}。页面将检测结果和根因结果一起提交为 JSON，请求后端生成可复核的报告内容。`,
        operationMeaning: "系统把技术侧的检测类别、根因候选、证据字段和严重等级整理成质量人员能够执行的任务，包括报告标题、摘要、触发规则、复核动作和本体路径。",
        outputMeaning: "输出结果是预警报告。它包含严重等级、摘要、触发规则、复核动作和 OWL2 本体路径，便于后续汇报、追溯和闭环处理。",
        plainLanguageSummary: "本步骤把算法和规则结果整理成质量人员可以直接阅读和处理的预警任务。"
      };
    }
    return {
      stepKey: step.key,
      title: step.title,
      inputMeaning: "输入数据是前面所有阶段的结果集合，包括检测结论、根因候选、预警报告和本体路径。它反映了从数据库记录到业务报告的完整链路。",
      callMeaning: "本阶段属于页面汇总展示，不再调用新的后端 API。页面直接读取前面各接口已经返回的结果。",
      operationMeaning: "系统把各阶段输出串联成一条可追溯链路：数据库记录进入检测流程，检测结果生成异常事件，异常事件关联根因候选，最后形成预警报告。",
      outputMeaning: "输出结果是最终透明结论，包含判断文案、严重等级、触发规则、建议动作和 OWL2 本体路径，便于用户核对每一步的来源。",
      plainLanguageSummary: "本步骤把从数据库记录到预警报告的全流程收束成一份可检查的解释链。"
    };
  });
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

export function sourceTableLabel(source: ProcessRecord["source"], sourceTableName?: string): string {
  if (source === "rip_rop") return "RIP_ROP 表（铆接过程明细）";
  if (source === "main") return "main 主表（主过程记录）";
  return `${sourceTableName || "新增来源表"}（新增来源表）`;
}

function recordGroupLabel(source: ProcessRecord["source"], records: ProcessRecord[]): string {
  if (source === "rip_rop") return `RIP_ROP 表：铆接过程明细（${records.length.toLocaleString("zh-CN")} 条）`;
  if (source === "main") return `main 主表：主过程记录与预测编码（${records.length.toLocaleString("zh-CN")} 条）`;
  const tableNames = Array.from(new Set(records.map((record) => record.sourceTableName || "未命名新表")));
  return `新增来源表：${tableNames.join("、")}（${records.length.toLocaleString("zh-CN")} 条）`;
}

function recordGroupDescription(source: ProcessRecord["source"], records: ProcessRecord[]): string {
  if (source === "rip_rop") return "RIP_ROP 表来自铆接过程明细，优先显示带故障代码、曲线和包络线的记录，适合演示异常检测。";
  if (source === "main") return "main 主表来自主过程记录，pre 是模型或算法输出的预测编码；编码业务含义尚待确认，所以系统会保守标注为待复核线索。";
  const fieldCount = new Set(records.flatMap((record) => Object.keys(record.raw))).size;
  return `新增来源表暂作为可追溯过程记录进入本体，已保留 ${fieldCount.toLocaleString("zh-CN")} 个原始字段，等待业务确认后再细分语义。`;
}

function qualityClueLabel(record: ProcessRecord): string {
  const fault = normalizeFaultCode(record.faultCode);
  if (fault) return `故障代码：${fault}`;
  if (record.predictionCategory) return `预测编码 pre=${record.predictionCategory}（业务含义待确认）`;
  if (record.errorRate !== undefined && record.errorRate !== "") return `误差率 error_rate=${record.errorRate}`;
  return "未触发明确故障线索";
}

function compareRecordsForPicker(left: ProcessRecord, right: ProcessRecord): number {
  const leftScore = recordPickerPriority(left);
  const rightScore = recordPickerPriority(right);
  if (leftScore !== rightScore) return rightScore - leftScore;
  return timestampValue(right.timestamp) - timestampValue(left.timestamp);
}

function recordPickerPriority(record: ProcessRecord): number {
  let score = 0;
  if (normalizeFaultCode(record.faultCode)) score += 40;
  if (record.curveSummary?.riveting || record.curveSummary?.envelope) score += 20;
  if (record.predictionCategory && record.predictionCategory !== "1.000") score += 16;
  if (record.errorRate && Number(record.errorRate) > 0) score += 10;
  return score;
}

function timestampValue(value: string | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(/\//g, "-");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
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
