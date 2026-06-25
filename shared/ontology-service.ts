import type { DemoDataset, GraphEdge, GraphNode, ProcessRecord } from "./ontology";

export type { DemoDataset } from "./ontology";

export type OntologyModuleName = "core.owl" | "process.owl" | "resource.owl" | "quality.owl" | "model.owl" | "spr.owl";
export const TOP_ONTOLOGY_MODULES: OntologyModuleName[] = ["core.owl", "process.owl", "resource.owl", "quality.owl", "model.owl"];

export type OntologyClassDescriptor = {
  id: string;
  label: string;
  module: OntologyModuleName;
  parent?: string;
  description: string;
};

export type OntologyPropertyDescriptor = {
  id: string;
  label: string;
  domain: string;
  range: string;
  type: "object" | "data";
  module: OntologyModuleName;
  description: string;
};

export type QualityRuleDescriptor = {
  id: string;
  name: string;
  applicableProcess: string;
  triggerCondition: string;
  defectPattern: string;
  evidenceFields: string[];
  rootCauseCandidates: string[];
  recommendedActions: string[];
  severity: "normal" | "warning" | "critical";
};

export type OntologyValidationResult = {
  success: boolean;
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
  metrics: {
    classes: number;
    objectProperties: number;
    dataProperties: number;
    rules: number;
  };
};

export type DetectionRequest = {
  recordId: string;
  modelMode?: "mock" | "llm" | "marpp";
  includeCurveSummary?: boolean;
  llm?: LlmRuntimeConfig;
};

export type LlmRuntimeConfig = {
  apiBaseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type DetectionPrediction = {
  category: "normal" | "curve_above_envelope" | "curve_below_envelope" | "press_stroke_high" | "prediction_review";
  confidence: number;
  severity: "normal" | "warning" | "critical";
  evidence: string[];
  needsReview: boolean;
};

type RawModelPrediction = Partial<DetectionPrediction>;

export type DetectionResult = {
  recordId: string;
  inspectionProcessId: string;
  modelInvocationId: string;
  modelMode: "mock" | "llm" | "marpp";
  prediction: DetectionPrediction;
  anomalyEvent?: {
    id: string;
    type: string;
    severity: "warning" | "critical";
  };
  ontologyPath: string[];
  reconstructionPrediction?: ReconstructionPrediction;
  modelDiagnostics?: {
    attemptedModelMode: "mock" | "llm" | "marpp";
    fallbackReason?: string;
  };
};

export type ReconstructionPrediction = {
  modelName: "MARPP";
  modelVersion: string;
  mode: "live" | "cache" | "fallback";
  inputCurve: number[];
  reconstructionCurve: number[];
  pointError: number[];
  anomalyScore: number;
  threshold: number;
  riskCategory: "normal" | "abnormal" | "review";
  confidence: number;
  evidence: string[];
  durationMs?: number;
};

export type RootCauseCandidate = {
  rootCause: string;
  confidence: number;
  evidence: string[];
  recommendation: string;
};

export type RootCauseAnalysis = {
  anomalyEventId: string;
  defectPattern: string;
  candidates: RootCauseCandidate[];
};

export type WarningReport = {
  reportId: string;
  title: string;
  severity: "normal" | "warning" | "critical";
  summary: string;
  ontologyPath: string[];
  triggeredRules: string[];
  actions: string[];
};

export type RuleReviewStatus = "pending" | "approved" | "rejected";

export type RuleExtractionRequest = {
  text: string;
  sourceDocument?: string;
  modelMode?: "mock" | "llm";
  llm?: LlmRuntimeConfig;
};

export type RuleExtractionCandidate = {
  candidateId: string;
  ruleId?: string;
  ruleName: string;
  applicableProcess: string;
  triggerCondition: string;
  defectPattern: string;
  rootCauseCandidate: string;
  evidenceFields: string[];
  recommendedActions: string[];
  sourceDocument: string;
  sourceExcerpt: string;
  reviewStatus: RuleReviewStatus;
  confidence?: number;
  publishedVersionId?: string | null;
};

export type RuleExtractionResponse = {
  reviewStatus: RuleReviewStatus;
  sourceDocument: string;
  extractedAt: string;
  candidates: RuleExtractionCandidate[];
};

const classZh: Record<string, { label: string; description: string }> = {
  Entity: { label: "实体", description: "本体中所有可管理对象的基础父类。" },
  VersionedEntity: { label: "版本化实体", description: "带版本号、生命周期和变更记录的对象。" },
  TraceableEntity: { label: "可追溯实体", description: "可以追踪来源、时间和证据链的对象。" },
  Document: { label: "文档", description: "标准、SOP、报告、数据库记录说明等文档对象。" },
  ExpertDocument: { label: "专家文档", description: "用于抽取质量规则和复核知识的专家经验文档。" },
  Rule: { label: "规则", description: "可复用的判定、约束或推理规则。" },
  Event: { label: "事件", description: "业务、工艺或质量过程中发生的状态变化。" },
  Action: { label: "动作", description: "系统或人员可以执行的处理动作。" },
  Service: { label: "服务", description: "可调用的模型、接口或系统能力。" },
  Report: { label: "报告", description: "由检测、分析或复核流程生成的结论文档。" },
  ManufacturingProcess: { label: "制造工艺", description: "工艺过程的顶层抽象。" },
  ProcessRoute: { label: "工艺路线", description: "由多个工序和步骤组成的工艺路线。" },
  ProcessOperation: { label: "工序", description: "工艺路线中的一个操作阶段。" },
  ProcessStep: { label: "工艺步骤", description: "可以执行、配置参数并产生数据的最小步骤。" },
  ParameterSet: { label: "参数集", description: "力、行程、阈值等工艺参数的集合。" },
  ProcessWindow: { label: "工艺窗口", description: "用于判断过程是否合格的边界、阈值或参考窗口。" },
  OnlineProcessRecord: { label: "在线过程记录", description: "从设备或数据库采集到的一条在线过程数据。" },
  ProcessData: { label: "过程数据", description: "工艺执行过程中产生的数据对象。" },
  CurveData: { label: "曲线数据", description: "由一串采样点组成的过程曲线。" },
  ReferenceCurve: { label: "参考曲线", description: "用于评价实际曲线的基准曲线。" },
  EnvelopeCurve: { label: "包络线", description: "用于判断实际曲线是否越界的参考边界。" },
  DataProcessingProcess: { label: "数据处理流程", description: "从原始数据到特征、结果和报告的处理流水线。" },
  ProductionLine: { label: "产线", description: "工艺发生的生产线或生产区域。" },
  Workstation: { label: "工位", description: "产线内执行具体工艺任务的位置。" },
  Equipment: { label: "设备", description: "执行工艺过程的设备。" },
  MainEquipment: { label: "主设备", description: "承担主要加工或连接任务的设备。" },
  Robot: { label: "机器人", description: "参与工艺执行的工业机器人。" },
  Tooling: { label: "工装夹具", description: "夹具、模具或辅助工具。" },
  Sensor: { label: "传感器", description: "采集过程状态或质量信号的传感器。" },
  DigitalResource: { label: "数字资源", description: "程序、配方、模型或接口等数字对象。" },
  Program: { label: "程序", description: "设备执行的工艺程序或程序号。" },
  Person: { label: "人员", description: "参与复核、操作或管理的人或账号。" },
  Role: { label: "角色", description: "工程、质量、运维等职责角色。" },
  Qualification: { label: "资质", description: "人员或设备的授权与资质信息。" },
  Responsibility: { label: "职责", description: "角色需要承担的责任边界。" },
  QualityStandard: { label: "质量标准", description: "检测与判定使用的质量标准。" },
  QualityCharacteristic: { label: "质量特性", description: "被检测或评价的质量特征。" },
  InspectionPlan: { label: "检测计划", description: "定义检测范围、频次和要求的计划。" },
  InspectionMethod: { label: "检测方法", description: "超声、视觉、曲线判定等具体检测方法。" },
  InspectionProcess: { label: "检测流程", description: "执行质量检测并产出结果的流程。" },
  InspectionResult: { label: "检测结果", description: "记录检测结论、故障线索和质量证据。" },
  QualityStatus: { label: "质量状态", description: "合格、待复核、失败等质量状态。" },
  DefectPattern: { label: "缺陷模式", description: "系统识别出的缺陷或异常类型。" },
  AnomalyEvent: { label: "异常事件", description: "由异常质量证据生成的事件，用来连接检测结果、缺陷、根因和预警报告。" },
  RootCause: { label: "根因", description: "缺陷或异常背后的候选原因或确认原因。" },
  CorrectiveAction: { label: "纠正动作", description: "针对当前问题采取的纠正措施。" },
  PreventiveAction: { label: "预防动作", description: "用于降低问题再次发生概率的预防措施。" },
  DiagnosticEvidence: { label: "诊断证据", description: "根因分析使用的字段、曲线、模型结果或人工证据。" },
  QualityRule: { label: "质量规则", description: "用于质量判定和诊断的规则。" },
  WarningReport: { label: "预警报告", description: "由本体驱动流程生成的质量预警报告。" },
  DetectionModel: { label: "检测模型", description: "用于检测过程记录的 AI 模型或本体规则模型。" },
  TimeSeriesForecastModel: { label: "异常检测模型", description: "用于对过程曲线做重构式异常检测的模型，例如本地 MARPP 重构服务。" },
  ModelService: { label: "模型服务", description: "可被调用的模型服务接口。" },
  ModelInvocation: { label: "模型调用记录", description: "一次具体模型调用的请求、响应和状态记录。" },
  ModelInputTemplate: { label: "模型输入模板", description: "模型需要接收的字段结构。" },
  ModelOutputTemplate: { label: "模型输出模板", description: "模型需要返回的结构化结果。" },
  ModelPredictionResult: { label: "模型预测结果", description: "模型或规则服务输出的预测类别、置信度和证据。" },
  ForecastHorizon: { label: "序列长度", description: "重构式异常检测模型输入曲线的点数或时间跨度的语义描述。" },
  PredictedCurve: { label: "重构曲线", description: "模型对输入过程曲线进行重构得到的派生曲线。" },
  ForecastAnomalyEvent: { label: "重构异常事件", description: "由重构误差触发的异常事件。" },
  ModelCallLog: { label: "模型调用日志", description: "模型调用过程中的日志和降级状态。" },
  SPRProcess: { label: "SPR工艺", description: "SPR 自冲铆工艺扩展。" },
  SPRProcessRecord: { label: "SPR过程记录", description: "每一条 SPR 数据库记录的统一承载入口。" },
  SPRConnectionPoint: { label: "SPR连接点", description: "SPR 铆点或连接特征。" },
  SPRRivet: { label: "SPR铆钉", description: "SPR 工艺使用的铆钉对象。" },
  SPRDie: { label: "SPR铆模", description: "SPR 工艺中的铆模或模具。" },
  SPRProgram: { label: "SPR程序", description: "SPR 设备执行的工艺程序。" },
  SPRParameterSet: { label: "SPR参数集", description: "SPR 工艺参数集合。" },
  SPRCurveData: { label: "SPR曲线数据", description: "SPR 过程中的实际曲线和派生曲线。" },
  SPREnvelopeCurve: { label: "SPR包络线", description: "SPR 曲线判断使用的包络线。" },
  SPRInspectionProcess: { label: "SPR检测流程", description: "读取 SPR 过程记录、调用模型或规则并生成检测结果的流程。" },
  SPRInspectionResult: { label: "SPR检测结果", description: "SPR 检测流程输出的质量结果。" },
  SPRDefectPattern: { label: "SPR缺陷模式", description: "SPR 场景中的缺陷或异常类型。" },
  SPRRootCause: { label: "SPR根因", description: "SPR 缺陷对应的候选根因。" }
};

const propertyZh: Record<string, { label: string; description: string }> = {
  hasSourceDocument: { label: "来源文档", description: "表示一个对象来自哪份文档或记录。" },
  hasVersion: { label: "版本号", description: "记录对象的版本信息。" },
  triggeredBy: { label: "由事件触发", description: "表示动作由某个事件触发。" },
  generatesReport: { label: "生成报告", description: "表示动作会生成报告。" },
  hasRule: { label: "拥有规则", description: "表示对象关联了可执行或可解释的规则。" },
  hasOperation: { label: "包含工序", description: "工艺路线包含具体工序。" },
  hasStep: { label: "包含步骤", description: "工序包含可执行步骤。" },
  usesParameterSet: { label: "使用参数集", description: "工艺步骤使用一组参数。" },
  hasProcessWindow: { label: "拥有工艺窗口", description: "工艺步骤关联判断边界或阈值。" },
  hasProcessData: { label: "包含过程数据", description: "在线过程记录包含过程数据对象。" },
  hasCurveData: { label: "包含曲线数据", description: "在线过程记录包含实际曲线或参考曲线。" },
  hasReferenceCurve: { label: "包含参考曲线", description: "检测流程使用参考曲线。" },
  hasEnvelopeCurve: { label: "包含包络线", description: "检测流程使用包络线作为判定边界。" },
  derivedFrom: { label: "派生自", description: "一个数据对象由另一个数据对象加工得到。" },
  containsWorkstation: { label: "包含工位", description: "产线包含一个或多个工位。" },
  configuredWith: { label: "配置设备", description: "工位配置了执行设备。" },
  runsProgram: { label: "运行程序", description: "设备运行某个工艺程序。" },
  usesEquipment: { label: "使用设备", description: "工艺步骤需要使用设备。" },
  performedBy: { label: "执行人员", description: "检测流程由人员或账号执行。" },
  hasRole: { label: "拥有角色", description: "人员拥有某种角色。" },
  hasQualification: { label: "拥有资质", description: "人员拥有相关资质。" },
  hasResponsibility: { label: "拥有职责", description: "角色关联职责定义。" },
  hasQualityStandard: { label: "质量标准", description: "检测计划引用质量标准。" },
  hasQualityCharacteristic: { label: "质量特性", description: "检测计划关注的质量特征。" },
  hasInspectionPlan: { label: "检测计划", description: "制造工艺关联检测计划。" },
  hasInspectionProcess: { label: "检测流程", description: "在线过程记录进入一个检测流程。" },
  producesInspectionResult: { label: "产生检测结果", description: "检测流程输出检测结果。" },
  detectsDefectPattern: { label: "识别缺陷模式", description: "检测结果或规则识别出缺陷模式。" },
  hasAnomalyEvent: { label: "产生异常事件", description: "检测结果在异常时产生异常事件。" },
  hasRootCauseCandidate: { label: "候选根因", description: "异常事件关联候选根因。" },
  supportedByEvidence: { label: "由证据支持", description: "根因由诊断证据支持。" },
  correctedBy: { label: "纠正动作", description: "根因可以被纠正动作处理。" },
  preventedBy: { label: "预防动作", description: "根因可以通过预防动作降低复发概率。" },
  generatesWarningReport: { label: "生成预警报告", description: "异常事件生成可复核的预警报告。" },
  invokesModel: { label: "调用检测模型", description: "检测流程调用 AI 模型或规则模型。" },
  usesInputTemplate: { label: "使用输入模板", description: "模型调用使用输入字段模板。" },
  usesOutputTemplate: { label: "使用输出模板", description: "模型调用使用输出结构模板。" },
  producedByModel: { label: "由模型产生", description: "预测结果由检测模型产生。" },
  hasPredictionResult: { label: "包含预测结果", description: "检测流程包含模型预测结果。" },
  supportsInspectionResult: { label: "支持检测结果", description: "模型预测结果支撑检测结果。" },
  hasModelCallLog: { label: "模型调用日志", description: "模型调用记录关联调用日志。" },
  hasForecastHorizon: { label: "序列长度", description: "模型调用记录关联本次重构检测使用的输入序列长度。" },
  predictsCurve: { label: "重构曲线", description: "模型检测结果关联输出的重构过程曲线。" },
  recordId: { label: "记录ID", description: "数据库过程记录的唯一标识。" },
  sourceTable: { label: "来源表", description: "记录来自哪张数据库表。" },
  timestamp: { label: "时间戳", description: "记录采集或发生时间。" },
  parameterValue: { label: "参数值", description: "过程参数的数值。" },
  unit: { label: "单位", description: "质量特性或参数的计量单位。" },
  faultCode: { label: "故障代码", description: "原始质量故障文案或编码。" },
  predictionCategory: { label: "预测类别", description: "模型输出的预测分类。" },
  confidence: { label: "置信度", description: "模型或规则对判断的可信程度。" },
  severity: { label: "严重等级", description: "异常事件的严重程度。" },
  modelName: { label: "模型名称", description: "检测模型的名称。" },
  modelVersion: { label: "模型版本", description: "检测模型的版本号。" },
  apiEndpoint: { label: "API地址", description: "模型服务的调用地址。" },
  evidenceText: { label: "证据文本", description: "诊断证据的文字说明。" },
  reportSummary: { label: "报告摘要", description: "预警报告的摘要内容。" }
};

const ontologyClasses: OntologyClassDescriptor[] = [
  cls("Entity", "Entity", "core.owl", undefined, "Base class for managed ontology objects."),
  cls("VersionedEntity", "VersionedEntity", "core.owl", "Entity", "Objects with version and lifecycle metadata."),
  cls("TraceableEntity", "TraceableEntity", "core.owl", "Entity", "Objects with source and traceability metadata."),
  cls("Document", "Document", "core.owl", "TraceableEntity", "Standards, SOPs, reports, and records."),
  cls("ExpertDocument", "ExpertDocument", "core.owl", "Document", "Expert documents used to extract quality rules."),
  cls("Rule", "Rule", "core.owl", "Entity", "Reusable constraints and reasoning rules."),
  cls("Event", "Event", "core.owl", "TraceableEntity", "Business or process events."),
  cls("Action", "Action", "core.owl", "Entity", "Executable semantic action."),
  cls("Service", "Service", "core.owl", "Entity", "Callable capability or service."),
  cls("Report", "Report", "core.owl", "TraceableEntity", "Generated analysis report."),

  cls("ManufacturingProcess", "ManufacturingProcess", "process.owl", "Entity", "Top-level process abstraction."),
  cls("ProcessRoute", "ProcessRoute", "process.owl", "VersionedEntity", "A route containing operations and steps."),
  cls("ProcessOperation", "ProcessOperation", "process.owl", "Entity", "Operation phase within a process route."),
  cls("ProcessStep", "ProcessStep", "process.owl", "Entity", "Executable process step."),
  cls("ParameterSet", "ParameterSet", "process.owl", "VersionedEntity", "Parameter collection used by a step."),
  cls("ProcessWindow", "ProcessWindow", "process.owl", "VersionedEntity", "Allowed process boundary."),
  cls("OnlineProcessRecord", "OnlineProcessRecord", "process.owl", "TraceableEntity", "Online record collected from equipment or data platform."),
  cls("ProcessData", "ProcessData", "process.owl", "TraceableEntity", "Data produced during process execution."),
  cls("CurveData", "CurveData", "process.owl", "ProcessData", "Sampled curve data."),
  cls("ReferenceCurve", "ReferenceCurve", "process.owl", "CurveData", "Reference curve used for evaluation."),
  cls("EnvelopeCurve", "EnvelopeCurve", "process.owl", "ReferenceCurve", "Envelope boundary for curve-based process judgment."),
  cls("DataProcessingProcess", "DataProcessingProcess", "process.owl", "TraceableEntity", "Processing pipeline from raw data to derived data."),

  cls("ProductionLine", "ProductionLine", "resource.owl", "Entity", "Production line or manufacturing area."),
  cls("Workstation", "Workstation", "resource.owl", "Entity", "Station inside a production line."),
  cls("Equipment", "Equipment", "resource.owl", "Entity", "Equipment used to execute the process."),
  cls("MainEquipment", "MainEquipment", "resource.owl", "Equipment", "Main process equipment."),
  cls("Robot", "Robot", "resource.owl", "Equipment", "Industrial robot."),
  cls("Tooling", "Tooling", "resource.owl", "Entity", "Fixture, die, or tool."),
  cls("Sensor", "Sensor", "resource.owl", "Equipment", "Sensor used for process monitoring."),
  cls("DigitalResource", "DigitalResource", "resource.owl", "Entity", "Digital program, recipe, model, or interface."),
  cls("Program", "Program", "resource.owl", "DigitalResource", "Process program."),
  cls("Person", "Person", "resource.owl", "Entity", "Human or account subject."),
  cls("Role", "Role", "resource.owl", "Entity", "Engineering, quality, or operation role."),
  cls("Qualification", "Qualification", "resource.owl", "Entity", "Qualification or authorization."),
  cls("Responsibility", "Responsibility", "resource.owl", "Entity", "Responsibility definition."),

  cls("QualityStandard", "QualityStandard", "quality.owl", "Document", "Quality standard used by inspection."),
  cls("QualityCharacteristic", "QualityCharacteristic", "quality.owl", "Entity", "Quality feature or evaluation characteristic."),
  cls("InspectionPlan", "InspectionPlan", "quality.owl", "VersionedEntity", "Plan defining inspection scope and frequency."),
  cls("InspectionMethod", "InspectionMethod", "quality.owl", "Entity", "Inspection method such as UT, vision, or curve judgment."),
  cls("InspectionProcess", "InspectionProcess", "quality.owl", "TraceableEntity", "Executable inspection process."),
  cls("InspectionResult", "InspectionResult", "quality.owl", "TraceableEntity", "Inspection result and quality conclusion evidence."),
  cls("QualityStatus", "QualityStatus", "quality.owl", "Entity", "Status such as pass, review, or fail."),
  cls("DefectPattern", "DefectPattern", "quality.owl", "Entity", "Identified defect or anomaly pattern."),
  cls("AnomalyEvent", "AnomalyEvent", "quality.owl", "Event", "Event generated from abnormal quality evidence."),
  cls("RootCause", "RootCause", "quality.owl", "Entity", "Candidate or confirmed cause for a defect."),
  cls("CorrectiveAction", "CorrectiveAction", "quality.owl", "Action", "Corrective action for current issue."),
  cls("PreventiveAction", "PreventiveAction", "quality.owl", "Action", "Preventive action to reduce recurrence."),
  cls("DiagnosticEvidence", "DiagnosticEvidence", "quality.owl", "TraceableEntity", "Evidence used by root-cause analysis."),
  cls("QualityRule", "QualityRule", "quality.owl", "Rule", "Quality judgment and diagnosis rule."),
  cls("WarningReport", "WarningReport", "quality.owl", "Report", "Ontology-driven warning report."),

  cls("DetectionModel", "DetectionModel", "model.owl", "Service", "AI or rule model used by inspection."),
  cls("TimeSeriesForecastModel", "TimeSeriesForecastModel", "model.owl", "DetectionModel", "Forecast model used for process curve prediction."),
  cls("ModelService", "ModelService", "model.owl", "Service", "Callable model service endpoint."),
  cls("ModelInvocation", "ModelInvocation", "model.owl", "TraceableEntity", "Concrete model call record."),
  cls("ModelInputTemplate", "ModelInputTemplate", "model.owl", "Entity", "Model input schema."),
  cls("ModelOutputTemplate", "ModelOutputTemplate", "model.owl", "Entity", "Model output schema."),
  cls("ModelPredictionResult", "ModelPredictionResult", "model.owl", "InspectionResult", "Prediction output from a model."),
  cls("ForecastHorizon", "ForecastHorizon", "model.owl", "Entity", "Future point count or time span used by forecast inference."),
  cls("PredictedCurve", "PredictedCurve", "model.owl", "CurveData", "Future or derived curve predicted by a model."),
  cls("ForecastAnomalyEvent", "ForecastAnomalyEvent", "model.owl", "AnomalyEvent", "Anomaly event raised by predicted future curve risk."),
  cls("ModelCallLog", "ModelCallLog", "model.owl", "TraceableEntity", "Model call log and fallback status."),

  cls("SPRProcess", "SPRProcess", "spr.owl", "ManufacturingProcess", "SPR process extension."),
  cls("SPRProcessRecord", "SPRProcessRecord", "spr.owl", "OnlineProcessRecord", "SPR online process record."),
  cls("SPRConnectionPoint", "SPRConnectionPoint", "spr.owl", "Entity", "SPR connection point."),
  cls("SPRRivet", "SPRRivet", "spr.owl", "Entity", "SPR rivet."),
  cls("SPRDie", "SPRDie", "spr.owl", "Tooling", "SPR die or rivet die."),
  cls("SPRProgram", "SPRProgram", "spr.owl", "Program", "SPR process program."),
  cls("SPRParameterSet", "SPRParameterSet", "spr.owl", "ParameterSet", "SPR parameter set."),
  cls("SPRCurveData", "SPRCurveData", "spr.owl", "CurveData", "SPR curve data."),
  cls("SPREnvelopeCurve", "SPREnvelopeCurve", "spr.owl", "EnvelopeCurve", "SPR envelope curve."),
  cls("SPRInspectionProcess", "SPRInspectionProcess", "spr.owl", "InspectionProcess", "SPR inspection process."),
  cls("SPRInspectionResult", "SPRInspectionResult", "spr.owl", "InspectionResult", "SPR inspection result."),
  cls("SPRDefectPattern", "SPRDefectPattern", "spr.owl", "DefectPattern", "SPR defect pattern."),
  cls("SPRRootCause", "SPRRootCause", "spr.owl", "RootCause", "SPR root cause.")
];

const ontologyProperties: OntologyPropertyDescriptor[] = [
  objectProp("hasSourceDocument", "hasSourceDocument", "TraceableEntity", "Document", "core.owl"),
  dataProp("hasVersion", "hasVersion", "VersionedEntity", "xsd:string", "core.owl"),
  objectProp("triggeredBy", "triggeredBy", "Action", "Event", "core.owl"),
  objectProp("generatesReport", "generatesReport", "Action", "Report", "core.owl"),
  objectProp("hasRule", "hasRule", "Entity", "Rule", "core.owl"),

  objectProp("hasOperation", "hasOperation", "ProcessRoute", "ProcessOperation", "process.owl"),
  objectProp("hasStep", "hasStep", "ProcessOperation", "ProcessStep", "process.owl"),
  objectProp("usesParameterSet", "usesParameterSet", "ProcessStep", "ParameterSet", "process.owl"),
  objectProp("hasProcessWindow", "hasProcessWindow", "ProcessStep", "ProcessWindow", "process.owl"),
  objectProp("hasProcessData", "hasProcessData", "OnlineProcessRecord", "ProcessData", "process.owl"),
  objectProp("hasCurveData", "hasCurveData", "OnlineProcessRecord", "CurveData", "process.owl"),
  objectProp("hasReferenceCurve", "hasReferenceCurve", "InspectionProcess", "ReferenceCurve", "process.owl"),
  objectProp("hasEnvelopeCurve", "hasEnvelopeCurve", "InspectionProcess", "EnvelopeCurve", "process.owl"),
  objectProp("derivedFrom", "derivedFrom", "ProcessData", "ProcessData", "process.owl"),

  objectProp("containsWorkstation", "containsWorkstation", "ProductionLine", "Workstation", "resource.owl"),
  objectProp("configuredWith", "configuredWith", "Workstation", "Equipment", "resource.owl"),
  objectProp("runsProgram", "runsProgram", "Equipment", "Program", "resource.owl"),
  objectProp("usesEquipment", "usesEquipment", "ProcessStep", "Equipment", "resource.owl"),
  objectProp("performedBy", "performedBy", "InspectionProcess", "Person", "resource.owl"),
  objectProp("hasRole", "hasRole", "Person", "Role", "resource.owl"),
  objectProp("hasQualification", "hasQualification", "Person", "Qualification", "resource.owl"),
  objectProp("hasResponsibility", "hasResponsibility", "Role", "Responsibility", "resource.owl"),

  objectProp("hasQualityStandard", "hasQualityStandard", "InspectionPlan", "QualityStandard", "quality.owl"),
  objectProp("hasQualityCharacteristic", "hasQualityCharacteristic", "InspectionPlan", "QualityCharacteristic", "quality.owl"),
  objectProp("hasInspectionPlan", "hasInspectionPlan", "ManufacturingProcess", "InspectionPlan", "quality.owl"),
  objectProp("hasInspectionProcess", "hasInspectionProcess", "OnlineProcessRecord", "InspectionProcess", "quality.owl"),
  objectProp("producesInspectionResult", "producesInspectionResult", "InspectionProcess", "InspectionResult", "quality.owl"),
  objectProp("detectsDefectPattern", "detectsDefectPattern", "InspectionResult", "DefectPattern", "quality.owl"),
  objectProp("hasAnomalyEvent", "hasAnomalyEvent", "InspectionResult", "AnomalyEvent", "quality.owl"),
  objectProp("hasRootCauseCandidate", "hasRootCauseCandidate", "AnomalyEvent", "RootCause", "quality.owl"),
  objectProp("supportedByEvidence", "supportedByEvidence", "RootCause", "DiagnosticEvidence", "quality.owl"),
  objectProp("correctedBy", "correctedBy", "RootCause", "CorrectiveAction", "quality.owl"),
  objectProp("preventedBy", "preventedBy", "RootCause", "PreventiveAction", "quality.owl"),
  objectProp("generatesWarningReport", "generatesWarningReport", "AnomalyEvent", "WarningReport", "quality.owl"),

  objectProp("invokesModel", "invokesModel", "InspectionProcess", "DetectionModel", "model.owl"),
  objectProp("usesInputTemplate", "usesInputTemplate", "ModelInvocation", "ModelInputTemplate", "model.owl"),
  objectProp("usesOutputTemplate", "usesOutputTemplate", "ModelInvocation", "ModelOutputTemplate", "model.owl"),
  objectProp("producedByModel", "producedByModel", "ModelPredictionResult", "DetectionModel", "model.owl"),
  objectProp("hasPredictionResult", "hasPredictionResult", "InspectionProcess", "ModelPredictionResult", "model.owl"),
  objectProp("supportsInspectionResult", "supportsInspectionResult", "ModelPredictionResult", "InspectionResult", "model.owl"),
  objectProp("hasModelCallLog", "hasModelCallLog", "ModelInvocation", "ModelCallLog", "model.owl"),
  objectProp("hasForecastHorizon", "hasForecastHorizon", "ModelInvocation", "ForecastHorizon", "model.owl"),
  objectProp("predictsCurve", "predictsCurve", "ModelPredictionResult", "PredictedCurve", "model.owl"),

  dataProp("recordId", "recordId", "OnlineProcessRecord", "xsd:string", "process.owl"),
  dataProp("sourceTable", "sourceTable", "OnlineProcessRecord", "xsd:string", "process.owl"),
  dataProp("timestamp", "timestamp", "OnlineProcessRecord", "xsd:dateTime", "process.owl"),
  dataProp("parameterValue", "parameterValue", "ProcessData", "xsd:decimal", "process.owl"),
  dataProp("unit", "unit", "QualityCharacteristic", "xsd:string", "quality.owl"),
  dataProp("faultCode", "faultCode", "InspectionResult", "xsd:string", "quality.owl"),
  dataProp("predictionCategory", "predictionCategory", "ModelPredictionResult", "xsd:string", "model.owl"),
  dataProp("confidence", "confidence", "ModelPredictionResult", "xsd:decimal", "model.owl"),
  dataProp("severity", "severity", "AnomalyEvent", "xsd:string", "quality.owl"),
  dataProp("modelName", "modelName", "DetectionModel", "xsd:string", "model.owl"),
  dataProp("modelVersion", "modelVersion", "DetectionModel", "xsd:string", "model.owl"),
  dataProp("apiEndpoint", "apiEndpoint", "ModelService", "xsd:anyURI", "model.owl"),
  dataProp("evidenceText", "evidenceText", "DiagnosticEvidence", "xsd:string", "quality.owl"),
  dataProp("reportSummary", "reportSummary", "WarningReport", "xsd:string", "quality.owl")
];

const qualityRules: QualityRuleDescriptor[] = [
  {
    id: "Rule-Curve-High",
    name: "铆接曲线高于包络线",
    applicableProcess: "SPRInspectionProcess",
    triggerCondition: "故障代码或曲线摘要显示铆接曲线高于包络线。",
    defectPattern: "铆接曲线高于包络线",
    evidenceFields: ["故障代码", "铆接曲线", "包络线"],
    rootCauseCandidates: ["铆接力参数偏高", "铆模状态异常", "设备输出波动"],
    recommendedActions: ["复核参数集版本", "检查铆模状态", "对同产线近邻记录进行复核"],
    severity: "warning"
  },
  {
    id: "Rule-Curve-Low",
    name: "铆接曲线低于包络线",
    applicableProcess: "SPRInspectionProcess",
    triggerCondition: "故障代码或曲线摘要显示铆接曲线低于包络线。",
    defectPattern: "铆接曲线低于包络线",
    evidenceFields: ["故障代码", "铆接曲线", "包络线"],
    rootCauseCandidates: ["铆接力不足", "铆钉或材料组合异常", "设备压力不足"],
    recommendedActions: ["复核铆接力设定", "检查铆钉规格", "检查设备压力状态"],
    severity: "warning"
  },
  {
    id: "Rule-Press-Stroke-High",
    name: "冲压行程过大",
    applicableProcess: "SPRInspectionProcess",
    triggerCondition: "故障代码或过程字段显示冲压行程过大。",
    defectPattern: "冲压行程过大",
    evidenceFields: ["故障代码", "铆接线冲压行程"],
    rootCauseCandidates: ["材料厚度偏差", "铆模磨损", "程序参数不匹配"],
    recommendedActions: ["复核材料厚度", "检查铆模磨损", "核对程序号与参数集版本"],
    severity: "critical"
  },
  {
    id: "Rule-Prediction-Review",
    name: "模型预测复核",
    applicableProcess: "SPRInspectionProcess",
    triggerCondition: "模型预测误差率或异常概率超过复核阈值。",
    defectPattern: "预测结果待复核",
    evidenceFields: ["pre", "error_rate"],
    rootCauseCandidates: ["模型输入数据异常", "模型版本不匹配", "质量状态编码未确认"],
    recommendedActions: ["复核模型版本", "复核 pre 编码含义", "保留人工复核结论"],
    severity: "warning"
  }
];

export function listOntologyClasses(_dataset?: DemoDataset): OntologyClassDescriptor[] {
  return ontologyClasses;
}

export function listOntologyProperties(): OntologyPropertyDescriptor[] {
  return ontologyProperties;
}

export function listQualityRules(dataset?: DemoDataset): QualityRuleDescriptor[] {
  const dynamicRules = dataset ? extractDatasetQualityRules(dataset) : [];
  const seen = new Set<string>();
  return [...qualityRules, ...dynamicRules].filter((rule) => {
    if (seen.has(rule.id)) return false;
    seen.add(rule.id);
    return true;
  });
}

export function extractRuleCandidates(input: RuleExtractionRequest): RuleExtractionResponse {
  const text = input.text.slice(0, 4000);
  const normalizedText = text.toLowerCase();
  const sourceDocument = input.sourceDocument?.trim() || "manual-input";
  const matchedRules = qualityRules.filter((rule) => {
    const searchable = [
      rule.name,
      rule.triggerCondition,
      rule.defectPattern,
      ...rule.evidenceFields,
      ...rule.rootCauseCandidates,
      ...rule.recommendedActions
    ].join("\n").toLowerCase();
    return searchable.split(/\s+/).some((token) => token.length > 1 && normalizedText.includes(token))
      || normalizedText.includes(rule.defectPattern.toLowerCase())
      || rule.evidenceFields.some((field) => normalizedText.includes(field.toLowerCase()));
  });
  const rules = matchedRules.length > 0 ? matchedRules : qualityRules.slice(0, 1);
  const sourceExcerpt = excerptForRule(text, rules[0]);

  return {
    reviewStatus: "pending",
    sourceDocument,
    extractedAt: new Date().toISOString(),
    candidates: rules.map((rule, index) => ({
      candidateId: `candidate-${stableCandidateKey(sourceDocument, rule.id, index)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      applicableProcess: rule.applicableProcess,
      triggerCondition: rule.triggerCondition,
      defectPattern: rule.defectPattern,
      rootCauseCandidate: rule.rootCauseCandidates[0] ?? "待专家复核",
      evidenceFields: rule.evidenceFields,
      recommendedActions: rule.recommendedActions,
      sourceDocument,
      sourceExcerpt: excerptForRule(text, rule) || sourceExcerpt || text.slice(0, 160),
      reviewStatus: "pending"
    }))
  };
}

export async function extractRuleCandidatesWithLlm(input: RuleExtractionRequest): Promise<RuleExtractionResponse> {
  const llm = input.llm;
  if (input.modelMode === "mock" || !llm?.apiBaseUrl || !llm.apiKey || !llm.model) return extractRuleCandidates(input);

  const sourceDocument = input.sourceDocument?.trim() || "manual-input";
  const fetchImpl = llm.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(resolveChatCompletionsUrl(llm.apiBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${llm.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: llm.model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: [
              "Extract SPR quality rules from expert documents.",
              "Return JSON only with a candidates array.",
              "Each candidate must include ruleName, applicableProcess, triggerCondition, defectPattern, rootCauseCandidate, evidenceFields, recommendedActions, sourceExcerpt, and confidence."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({
              sourceDocument,
              text: input.text.slice(0, 8000),
              allowedApplicableProcess: "SPRInspectionProcess"
            })
          }
        ],
        response_format: { type: "json_object" }
      }),
      signal: createTimeoutSignal(llm.timeoutMs)
    });

    if (!response.ok) return extractRuleCandidates(input);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonObjectFromModelContent(content) as { candidates?: unknown[] } | null;
    const candidates = Array.isArray(parsed?.candidates)
      ? parsed.candidates.map((candidate, index) => normalizeRuleCandidate(candidate, input, index)).filter((candidate): candidate is RuleExtractionCandidate => Boolean(candidate))
      : [];

    if (candidates.length === 0) return extractRuleCandidates(input);
    return {
      reviewStatus: "pending",
      sourceDocument,
      extractedAt: new Date().toISOString(),
      candidates
    };
  } catch {
    return extractRuleCandidates(input);
  }
}

export function exportOwlXml(dataset?: DemoDataset): string {
  const rules = listQualityRules(dataset);
  const classXml = ontologyClasses.map((item) => {
    const parent = item.parent ? `\n    <rdfs:subClassOf rdf:resource="#${escapeXml(item.parent)}"/>` : "";
    return `  <owl:Class rdf:about="#${escapeXml(item.id)}">${parent}\n    <rdfs:label>${escapeXml(item.label)}</rdfs:label>\n    <rdfs:comment>${escapeXml(item.description)}</rdfs:comment>\n  </owl:Class>`;
  }).join("\n");
  const propertyXml = ontologyProperties.map((item) => {
    const tag = item.type === "object" ? "owl:ObjectProperty" : "owl:DatatypeProperty";
    const range = item.range.startsWith("xsd:") ? item.range : `#${item.range}`;
    return `  <${tag} rdf:about="#${escapeXml(item.id)}">\n    <rdfs:label>${escapeXml(item.label)}</rdfs:label>\n    <rdfs:domain rdf:resource="#${escapeXml(item.domain)}"/>\n    <rdfs:range rdf:resource="${escapeXml(range)}"/>\n  </${tag}>`;
  }).join("\n");
  const ruleXml = rules.map((item) => (
    `  <owl:NamedIndividual rdf:about="#${escapeXml(item.id)}">\n    <rdf:type rdf:resource="#QualityRule"/>\n    <rdfs:label>${escapeXml(item.name)}</rdfs:label>\n    <rdfs:comment>${escapeXml(item.triggerCondition)}</rdfs:comment>\n  </owl:NamedIndividual>`
  )).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"\n         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"\n         xmlns:owl="http://www.w3.org/2002/07/owl#"\n         xmlns:xsd="http://www.w3.org/2001/XMLSchema#"\n         xml:base="https://example.com/ontology/spr-owl2#">\n  <owl:Ontology rdf:about="https://example.com/ontology/spr-owl2">\n    <rdfs:comment>SPR process ontology OWL2 export generated from the demo ontology service.</rdfs:comment>\n  </owl:Ontology>\n${classXml}\n${propertyXml}\n${ruleXml}\n</rdf:RDF>\n`;
}

export function exportTopOntologyOwlXml(): string {
  return exportOwlImportAggregateXml({
    iri: "https://example.com/ontology/top-ontology",
    comment: "Aggregate top-level process ontology generated from core process modules.",
    modules: TOP_ONTOLOGY_MODULES
  });
}

export function validateOwl2Artifacts(dataset: DemoDataset): OntologyValidationResult {
  const requiredClasses = ["SPRInspectionProcess", "DetectionModel", "ModelPredictionResult", "AnomalyEvent", "RootCause", "WarningReport"];
  const requiredProperties = ["hasInspectionProcess", "invokesModel", "hasPredictionResult", "hasRootCauseCandidate", "generatesWarningReport"];
  const classIds = new Set(ontologyClasses.map((item) => item.id));
  const propertyIds = new Set(ontologyProperties.map((item) => item.id));
  const errors: OntologyValidationResult["errors"] = [];
  const warnings: OntologyValidationResult["warnings"] = [];

  for (const id of requiredClasses) {
    if (!classIds.has(id)) errors.push({ code: "MISSING_CLASS", message: `缺少 OWL2 类：${id}` });
  }
  for (const id of requiredProperties) {
    if (!propertyIds.has(id)) errors.push({ code: "MISSING_PROPERTY", message: `缺少 OWL2 属性：${id}` });
  }

  const uncertainFields = dataset.fieldMappings.filter((mapping) => mapping.status === "需确认").map((mapping) => mapping.sourceField);
  if (uncertainFields.length > 0) {
    warnings.push({
      code: "FIELD_NEEDS_CONFIRMATION",
      message: `以下字段含义仍需业务确认：${Array.from(new Set(uncertainFields)).join("、")}`
    });
  }
  if (dataset.records.length === 0) {
    warnings.push({ code: "NO_PROCESS_RECORDS", message: "当前数据集中没有过程记录，检测流程只能使用本体结构演示。" });
  }

  const owlValidation = validateOwlXml(exportOwlXml(dataset));
  errors.push(...owlValidation.errors);
  warnings.push(...owlValidation.warnings);

  return {
    success: errors.length === 0,
    errors,
    warnings,
    metrics: {
      classes: ontologyClasses.length,
      objectProperties: ontologyProperties.filter((item) => item.type === "object").length,
      dataProperties: ontologyProperties.filter((item) => item.type === "data").length,
      rules: listQualityRules(dataset).length
    }
  };
}

export async function runDetection(dataset: DemoDataset, request: DetectionRequest): Promise<DetectionResult> {
  const record = findRecord(dataset, request.recordId);
  const prediction = request.modelMode === "llm" ? await runLlmDetection(dataset, record, request) : classifyRecord(record);
  const anomalyEvent = prediction.severity === "normal"
    ? undefined
    : {
        id: `anomaly-${record.id}`,
        type: defectPatternForCategory(prediction.category),
        severity: prediction.severity
      };

  return {
    recordId: record.id,
    inspectionProcessId: `inspection-${record.id}`,
    modelInvocationId: `model-call-${record.id}`,
    modelMode: request.modelMode ?? "mock",
    prediction,
    anomalyEvent,
    ontologyPath: ["SPRProcessRecord", "SPRInspectionProcess", "DetectionModel", "ModelPredictionResult", "InspectionResult", "AnomalyEvent"]
  };
}

async function runLlmDetection(dataset: DemoDataset, record: ProcessRecord, request: DetectionRequest): Promise<DetectionPrediction> {
  const llm = request.llm;
  if (!llm?.apiBaseUrl || !llm.apiKey || !llm.model) {
    return {
      ...classifyRecord(record),
      evidence: ["LLM 模型配置不完整，已使用本体规则降级检测", ...classifyRecord(record).evidence],
      needsReview: true
    };
  }

  const fetchImpl = llm.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(resolveChatCompletionsUrl(llm.apiBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${llm.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: llm.model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: "You are an SPR quality inspection model. Return strict JSON only."
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "SPR quality inspection",
              ontologyContext: {
                inspectionProcess: "SPRInspectionProcess",
                qualityRules: qualityRules.map((rule) => rule.id),
                outputSchema: {
                  category: "normal | curve_above_envelope | curve_below_envelope | press_stroke_high | prediction_review",
                  confidence: "number between 0 and 1",
                  severity: "normal | warning | critical",
                  evidence: "string[]",
                  needsReview: "boolean"
                }
              },
              record: {
                recordId: record.id,
                sourceTable: record.source,
                faultCode: record.faultCode,
                predictionCategory: record.predictionCategory,
                errorRate: record.errorRate,
                deviceName: record.deviceName,
                program: record.program,
                curveSummary: request.includeCurveSummary ? record.curveSummary : undefined
              }
            })
          }
        ],
        response_format: { type: "json_object" }
      }),
      signal: createTimeoutSignal(llm.timeoutMs)
    });

    if (!response.ok) return reviewFallback(`模型服务返回 HTTP ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonObjectFromModelContent(content) as RawModelPrediction | null;
    if (!parsed) return reviewFallback("模型输出不是合法 JSON");
    return normalizeModelPrediction(parsed);
  } catch (error) {
    return reviewFallback(`模型调用失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeModelPrediction(value: RawModelPrediction): DetectionPrediction {
  const categories: DetectionPrediction["category"][] = ["normal", "curve_above_envelope", "curve_below_envelope", "press_stroke_high", "prediction_review"];
  const severities: DetectionPrediction["severity"][] = ["normal", "warning", "critical"];
  if (!categories.includes(value.category as DetectionPrediction["category"])) return reviewFallback("模型输出 category 不在允许范围");
  if (!severities.includes(value.severity as DetectionPrediction["severity"])) return reviewFallback("模型输出 severity 不在允许范围");
  if (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) return reviewFallback("模型输出 confidence 不在 0 到 1 范围");
  if (!Array.isArray(value.evidence) || value.evidence.some((item) => typeof item !== "string")) return reviewFallback("模型输出 evidence 不是字符串数组");
  if (typeof value.needsReview !== "boolean") return reviewFallback("模型输出 needsReview 不是布尔值");
  return {
    category: value.category as DetectionPrediction["category"],
    confidence: Number(value.confidence.toFixed(3)),
    severity: value.severity as DetectionPrediction["severity"],
    evidence: value.evidence,
    needsReview: value.needsReview
  };
}

function reviewFallback(reason: string): DetectionPrediction {
  return {
    category: "prediction_review",
    confidence: 0.5,
    severity: "warning",
    evidence: [reason, "已降级为待复核检测结果"],
    needsReview: true
  };
}

function createTimeoutSignal(timeoutMs?: number): AbortSignal | undefined {
  if (!timeoutMs || typeof AbortController === "undefined") return undefined;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export function analyzeRootCause(_dataset: DemoDataset, input: { anomalyEventId: string; detection: DetectionResult }): RootCauseAnalysis {
  const rule = ruleForCategory(input.detection.prediction.category);
  const defectPattern = rule?.defectPattern ?? "未触发明确异常";
  const candidates = (rule?.rootCauseCandidates ?? ["未识别到明确根因"]).map((rootCause, index) => ({
    rootCause,
    confidence: Number((0.72 - index * 0.11).toFixed(2)),
    evidence: rule?.evidenceFields ?? input.detection.prediction.evidence,
    recommendation: rule?.recommendedActions[index] ?? "保留人工复核结论"
  }));

  return {
    anomalyEventId: input.anomalyEventId || input.detection.anomalyEvent?.id || `anomaly-${input.detection.recordId}`,
    defectPattern,
    candidates
  };
}

export function createWarningReport(_dataset: DemoDataset, input: { detection: DetectionResult; rootCause: RootCauseAnalysis }): WarningReport {
  const rule = ruleForCategory(input.detection.prediction.category);
  const title = input.detection.prediction.severity === "normal" ? "SPR 检测无阻塞异常" : `SPR ${input.rootCause.defectPattern}预警`;
  const actions = input.rootCause.candidates.map((item) => item.recommendation);

  return {
    reportId: `warning-${input.detection.recordId}`,
    title,
    severity: input.detection.prediction.severity,
    summary: input.detection.prediction.severity === "normal"
      ? "该过程记录未触发阻塞性质量规则，保留为可追溯检测过程。"
      : "该过程记录触发质量规则，建议依据本体路径复核参数、设备和质量证据。",
    ontologyPath: ["SPRInspectionProcess", "InspectionResult", "AnomalyEvent", "DefectPattern", "RootCause"],
    triggeredRules: rule ? [rule.id] : ["Rule-No-Blocking-Fault"],
    actions: actions.length > 0 ? actions : ["保留人工复核结论"]
  };
}

export function buildOntologyWorkbenchGraph(_dataset?: DemoDataset): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const rules = listQualityRules(_dataset);
  const classIds = [
    "SPRProcessRecord",
    "SPRInspectionProcess",
    "DetectionModel",
    "ModelPredictionResult",
    "InspectionResult",
    "AnomalyEvent",
    "DefectPattern",
    "RootCause",
    "WarningReport"
  ];
  const nodes: GraphNode[] = [
    ...classIds.map((id) => {
      const descriptor = ontologyClasses.find((item) => item.id === id);
      return {
        id,
        label: descriptor?.label ?? id,
        type: "class" as const,
        group: id.startsWith("SPR") ? "spr-extension" as const : id.includes("Model") || id === "DetectionModel" ? "reasoning" as const : "top" as const,
        description: descriptor?.description
      };
    }),
    ...rules.map((rule) => ({
      id: rule.id,
      label: rule.name,
      type: "rule" as const,
      group: "reasoning" as const,
      description: rule.triggerCondition
    }))
  ];
  const edges: GraphEdge[] = [
    edge("workbench-record-inspection", "SPRProcessRecord", "SPRInspectionProcess", relationLabel("hasInspectionProcess"), "objectProperty"),
    edge("workbench-inspection-model", "SPRInspectionProcess", "DetectionModel", relationLabel("invokesModel"), "objectProperty"),
    edge("workbench-inspection-prediction", "SPRInspectionProcess", "ModelPredictionResult", relationLabel("hasPredictionResult"), "objectProperty"),
    edge("workbench-prediction-result", "ModelPredictionResult", "InspectionResult", relationLabel("supportsInspectionResult"), "objectProperty"),
    edge("workbench-result-anomaly", "InspectionResult", "AnomalyEvent", relationLabel("hasAnomalyEvent"), "objectProperty"),
    edge("workbench-anomaly-defect", "AnomalyEvent", "DefectPattern", relationLabel("detectsDefectPattern"), "objectProperty"),
    edge("workbench-anomaly-root", "AnomalyEvent", "RootCause", relationLabel("hasRootCauseCandidate"), "objectProperty"),
    edge("workbench-anomaly-report", "AnomalyEvent", "WarningReport", relationLabel("generatesWarningReport"), "objectProperty"),
    ...rules.map((rule) => edge(`rule-${rule.id}-inspection`, rule.id, "SPRInspectionProcess", "适用于", "mapsTo")),
    ...rules.map((rule) => edge(`rule-${rule.id}-defect`, rule.id, "DefectPattern", relationLabel("detectsDefectPattern"), "objectProperty"))
  ];

  return { nodes, edges };
}

export function validateOwlXml(owl: string): OntologyValidationResult {
  const errors: OntologyValidationResult["errors"] = [];
  const warnings: OntologyValidationResult["warnings"] = [];
  const classIds = collectXmlIds(owl, /<owl:Class\b[^>]*rdf:about="#([^"]+)"/g);
  const objectProperties = collectXmlIds(owl, /<owl:ObjectProperty\b[^>]*rdf:about="#([^"]+)"/g);
  const dataProperties = collectXmlIds(owl, /<owl:DatatypeProperty\b[^>]*rdf:about="#([^"]+)"/g);
  const ruleIds = collectXmlIds(owl, /<owl:NamedIndividual\b[^>]*rdf:about="#([^"]+)"/g);
  const descriptorClassIds = new Set(ontologyClasses.map((item) => item.id));
  const knownClasses = new Set([...descriptorClassIds, ...classIds]);
  const knownRules = new Set(ruleIds);
  const knownProperties = new Set([...objectProperties, ...dataProperties]);

  if (!owl.includes("<rdf:RDF") || !owl.includes("</rdf:RDF>")) {
    errors.push({ code: "INVALID_RDF_XML", message: "OWL document must contain rdf:RDF root element." });
  }
  for (const namespace of ["xmlns:rdf=", "xmlns:rdfs=", "xmlns:owl=", "xmlns:xsd="]) {
    if (!owl.includes(namespace)) errors.push({ code: "MISSING_NAMESPACE", message: `Missing namespace declaration: ${namespace}` });
  }
  for (const id of classIds) {
    if (id.trim() !== id || id.length === 0) errors.push({ code: "INVALID_CLASS_ID", message: `Invalid class id: ${id}` });
    if (!descriptorClassIds.has(id)) errors.push({ code: "UNKNOWN_CLASS_REFERENCE", message: `Unknown exported class: ${id}` });
  }
  for (const duplicated of duplicates([...classIds, ...objectProperties, ...dataProperties, ...ruleIds])) {
    errors.push({ code: "DUPLICATE_IRI", message: `Duplicate local IRI: ${duplicated}` });
  }
  for (const parent of collectXmlIds(owl, /<rdfs:subClassOf\b[^>]*rdf:resource="#([^"]+)"/g)) {
    if (!knownClasses.has(parent)) errors.push({ code: "UNKNOWN_CLASS_REFERENCE", message: `Unknown subclass reference: ${parent}` });
  }
  for (const domain of collectXmlIds(owl, /<rdfs:domain\b[^>]*rdf:resource="#([^"]+)"/g)) {
    if (!knownClasses.has(domain)) errors.push({ code: "UNKNOWN_CLASS_REFERENCE", message: `Unknown property domain: ${domain}` });
  }
  for (const range of collectXmlIds(owl, /<rdfs:range\b[^>]*rdf:resource="([^"]+)"/g)) {
    if (range.startsWith("#") && !knownClasses.has(range.slice(1))) errors.push({ code: "UNKNOWN_CLASS_REFERENCE", message: `Unknown property range: ${range.slice(1)}` });
    if (!range.startsWith("#") && !range.startsWith("xsd:")) warnings.push({ code: "EXTERNAL_RANGE_REFERENCE", message: `External range reference: ${range}` });
  }
  for (const ruleId of ruleIds) {
    const block = matchIndividualBlock(owl, ruleId);
    if (!block?.includes('rdf:resource="#QualityRule"')) errors.push({ code: "QUALITY_RULE_TYPE_MISSING", message: `Rule individual lacks QualityRule type: ${ruleId}` });
  }
  for (const property of ontologyProperties) {
    if (!knownProperties.has(property.id)) warnings.push({ code: "PROPERTY_NOT_EXPORTED", message: `Descriptor property not exported: ${property.id}` });
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
    metrics: {
      classes: classIds.length,
      objectProperties: objectProperties.length,
      dataProperties: dataProperties.length,
      rules: knownRules.size
    }
  };
}

function resolveChatCompletionsUrl(apiBaseUrl: string): string {
  const trimmed = apiBaseUrl.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

function parseJsonObjectFromModelContent(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  const candidates = [trimmed, fenced, extractBalancedJsonObject(trimmed)].filter((item): item is string => Boolean(item));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Try the next extraction strategy.
    }
  }
  return null;
}

function extractBalancedJsonObject(content: string): string | null {
  const start = content.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") inString = true;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return content.slice(start, index + 1);
    }
  }
  return null;
}

function normalizeRuleCandidate(value: unknown, input: RuleExtractionRequest, index: number): RuleExtractionCandidate | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const sourceDocument = input.sourceDocument?.trim() || "manual-input";
  const ruleName = stringValue(candidate.ruleName);
  const triggerCondition = stringValue(candidate.triggerCondition);
  const defectPattern = stringValue(candidate.defectPattern);
  if (!ruleName || !triggerCondition || !defectPattern) return null;
  const evidenceFields = stringArrayValue(candidate.evidenceFields);
  const recommendedActions = stringArrayValue(candidate.recommendedActions);
  if (evidenceFields.length === 0 || recommendedActions.length === 0) return null;
  const confidence = typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
    ? Math.max(0, Math.min(1, Number(candidate.confidence.toFixed(3))))
    : undefined;
  const sourceExcerpt = stringValue(candidate.sourceExcerpt) || input.text.slice(0, 180);
  return {
    candidateId: `candidate-${stableCandidateKey(sourceDocument, slugify(ruleName), index)}`,
    ruleName,
    applicableProcess: stringValue(candidate.applicableProcess) || "SPRInspectionProcess",
    triggerCondition,
    defectPattern,
    rootCauseCandidate: stringValue(candidate.rootCauseCandidate) || "Needs expert review",
    evidenceFields,
    recommendedActions,
    sourceDocument,
    sourceExcerpt,
    reviewStatus: "pending",
    confidence
  };
}

function extractDatasetQualityRules(dataset: DemoDataset): QualityRuleDescriptor[] {
  return Object.values(dataset.spr_ontology.nodes)
    .filter((node) => node.layer === "spr-rule")
    .map((node) => ({
      id: node.name.startsWith("Rule-") ? node.name : node.id,
      name: node.name,
      applicableProcess: "SPRInspectionProcess",
      triggerCondition: node.definition,
      defectPattern: node.properties.find((property) => property.name === "defectPattern")?.description || node.definition,
      evidenceFields: node.source_fields,
      rootCauseCandidates: node.properties.filter((property) => property.name === "rootCauseCandidate").map((property) => property.description),
      recommendedActions: node.properties.filter((property) => property.name === "recommendedAction").map((property) => property.description),
      severity: "warning"
    }));
}

function collectXmlIds(value: string, pattern: RegExp): string[] {
  return [...value.matchAll(pattern)].map((match) => unescapeXml(match[1]));
}

function matchIndividualBlock(owl: string, id: string): string | null {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return owl.match(new RegExp(`<owl:NamedIndividual\\b[^>]*rdf:about="#${escaped}"[\\s\\S]*?</owl:NamedIndividual>`))?.[0] ?? null;
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicateSet = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicateSet.add(value);
    seen.add(value);
  }
  return [...duplicateSet];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rule";
}

function cls(id: string, label: string, module: OntologyModuleName, parent: string | undefined, description: string): OntologyClassDescriptor {
  const zh = classZh[id];
  return { id, label: zh?.label ?? label, module, parent, description: zh?.description ?? description };
}

function objectProp(id: string, label: string, domain: string, range: string, module: OntologyModuleName): OntologyPropertyDescriptor {
  const zh = propertyZh[id];
  return { id, label: zh?.label ?? label, domain, range, type: "object", module, description: zh?.description ?? `${label} 对象属性。` };
}

function dataProp(id: string, label: string, domain: string, range: string, module: OntologyModuleName): OntologyPropertyDescriptor {
  const zh = propertyZh[id];
  return { id, label: zh?.label ?? label, domain, range, type: "data", module, description: zh?.description ?? `${label} 数据属性。` };
}

function edge(id: string, source: string, target: string, label: string, type: GraphEdge["type"]): GraphEdge {
  return { id, source, target, label, type };
}

function relationLabel(propertyId: string): string {
  return propertyZh[propertyId]?.label ?? propertyId;
}

function findRecord(dataset: DemoDataset, recordId: string): ProcessRecord {
  const record = dataset.records.find((item) => item.id === recordId);
  if (!record) throw new Error(`record not found: ${recordId}`);
  return record;
}

function classifyRecord(record: ProcessRecord): DetectionPrediction {
  const fault = record.faultCode ?? "";
  if (fault.includes("高于包络线")) {
    return {
      category: "curve_above_envelope",
      confidence: 0.86,
      severity: "warning",
      evidence: ["故障代码包含铆接曲线高于包络线", "检测过程关联铆接曲线与包络线"],
      needsReview: true
    };
  }
  if (fault.includes("低于包络线")) {
    return {
      category: "curve_below_envelope",
      confidence: 0.84,
      severity: "warning",
      evidence: ["故障代码包含铆接曲线低于包络线", "检测过程关联铆接曲线与包络线"],
      needsReview: true
    };
  }
  if (fault.includes("冲压行程过大")) {
    return {
      category: "press_stroke_high",
      confidence: 0.82,
      severity: "critical",
      evidence: ["故障代码包含冲压行程过大", "检测过程关联铆接线冲压行程"],
      needsReview: true
    };
  }
  if (record.errorRate !== undefined && Number(record.errorRate) > 0.01) {
    return {
      category: "prediction_review",
      confidence: 0.68,
      severity: "warning",
      evidence: ["error_rate 超过复核阈值", "pre 编码含义仍需业务确认"],
      needsReview: true
    };
  }
  return {
    category: "normal",
    confidence: 0.74,
    severity: "normal",
    evidence: ["未触发阻塞性质量规则"],
    needsReview: false
  };
}

function ruleForCategory(category: DetectionPrediction["category"]): QualityRuleDescriptor | undefined {
  return {
    curve_above_envelope: qualityRules[0],
    curve_below_envelope: qualityRules[1],
    press_stroke_high: qualityRules[2],
    prediction_review: qualityRules[3],
    normal: undefined
  }[category];
}

function defectPatternForCategory(category: DetectionPrediction["category"]): string {
  return ruleForCategory(category)?.defectPattern ?? "未触发明确异常";
}

function excerptForRule(text: string, rule: QualityRuleDescriptor): string {
  const terms = [rule.defectPattern, rule.name, ...rule.evidenceFields].filter(Boolean);
  const index = terms
    .map((term) => text.indexOf(term))
    .filter((value) => value >= 0)
    .sort((left, right) => left - right)[0] ?? -1;
  if (index < 0) return text.slice(0, 160);
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + 120);
  return text.slice(start, end);
}

function stableCandidateKey(sourceDocument: string, ruleId: string, index: number): string {
  const value = `${sourceDocument}:${ruleId}:${index}`;
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return `${ruleId.toLowerCase()}-${hash.toString(16)}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function exportOwlImportAggregateXml(input: { iri: string; comment: string; modules: OntologyModuleName[] }): string {
  const imports = input.modules.map((moduleName) => `    <owl:imports rdf:resource="../${moduleName}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"\n         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"\n         xmlns:owl="http://www.w3.org/2002/07/owl#"\n         xmlns:xsd="http://www.w3.org/2001/XMLSchema#">\n  <owl:Ontology rdf:about="${escapeXml(input.iri)}">\n    <rdfs:comment>${escapeXml(input.comment)}</rdfs:comment>\n${imports}\n  </owl:Ontology>\n</rdf:RDF>\n`;
}

function unescapeXml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}
