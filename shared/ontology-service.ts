import type { DemoDataset, GraphEdge, GraphNode, ProcessRecord } from "./ontology";

export type { DemoDataset } from "./ontology";

export type OntologyModuleName = "core.owl" | "process.owl" | "resource.owl" | "quality.owl" | "model.owl" | "spr.owl";

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
  modelMode?: "mock" | "llm";
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
  modelMode: "mock" | "llm";
  prediction: DetectionPrediction;
  anomalyEvent?: {
    id: string;
    type: string;
    severity: "warning" | "critical";
  };
  ontologyPath: string[];
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
  cls("ModelService", "ModelService", "model.owl", "Service", "Callable model service endpoint."),
  cls("ModelInvocation", "ModelInvocation", "model.owl", "TraceableEntity", "Concrete model call record."),
  cls("ModelInputTemplate", "ModelInputTemplate", "model.owl", "Entity", "Model input schema."),
  cls("ModelOutputTemplate", "ModelOutputTemplate", "model.owl", "Entity", "Model output schema."),
  cls("ModelPredictionResult", "ModelPredictionResult", "model.owl", "InspectionResult", "Prediction output from a model."),
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
    edge("workbench-record-inspection", "SPRProcessRecord", "SPRInspectionProcess", "hasInspectionProcess", "objectProperty"),
    edge("workbench-inspection-model", "SPRInspectionProcess", "DetectionModel", "invokesModel", "objectProperty"),
    edge("workbench-inspection-prediction", "SPRInspectionProcess", "ModelPredictionResult", "hasPredictionResult", "objectProperty"),
    edge("workbench-prediction-result", "ModelPredictionResult", "InspectionResult", "supportsInspectionResult", "objectProperty"),
    edge("workbench-result-anomaly", "InspectionResult", "AnomalyEvent", "hasAnomalyEvent", "objectProperty"),
    edge("workbench-anomaly-defect", "AnomalyEvent", "DefectPattern", "detectsDefectPattern", "objectProperty"),
    edge("workbench-anomaly-root", "AnomalyEvent", "RootCause", "hasRootCauseCandidate", "objectProperty"),
    edge("workbench-anomaly-report", "AnomalyEvent", "WarningReport", "generatesWarningReport", "objectProperty"),
    ...rules.map((rule) => edge(`rule-${rule.id}-inspection`, rule.id, "SPRInspectionProcess", "appliesTo", "mapsTo")),
    ...rules.map((rule) => edge(`rule-${rule.id}-defect`, rule.id, "DefectPattern", "detectsDefectPattern", "objectProperty"))
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
  return { id, label, module, parent, description };
}

function objectProp(id: string, label: string, domain: string, range: string, module: OntologyModuleName): OntologyPropertyDescriptor {
  return { id, label, domain, range, type: "object", module };
}

function dataProp(id: string, label: string, domain: string, range: string, module: OntologyModuleName): OntologyPropertyDescriptor {
  return { id, label, domain, range, type: "data", module };
}

function edge(id: string, source: string, target: string, label: string, type: GraphEdge["type"]): GraphEdge {
  return { id, source, target, label, type };
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

function unescapeXml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}
