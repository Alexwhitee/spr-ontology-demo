import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ClipboardCheck,
  FileCode2,
  GitBranch,
  Loader2,
  Radar,
  ShieldCheck,
  Siren,
  XCircle
} from "lucide-react";
import { OntologyGraph } from "../../components/OntologyGraph";
import {
  analyzeRemoteRootCause,
  createRemoteWarningReport,
  extractKnowledgeRules,
  loadKnowledgeRuleCandidates,
  publishKnowledgeRules,
  reviewKnowledgeRuleCandidate,
  runRemoteDetection
} from "../../lib/data";
import type { DemoDataset, GraphNode, ProcessRecord } from "../../types/demo";
import {
  buildOntologyWorkbenchGraph,
  exportOwlXml,
  exportTopOntologyOwlXml,
  listOntologyClasses,
  listOntologyProperties,
  listQualityRules,
  validateOwl2Artifacts,
  type DetectionResult,
  type RootCauseAnalysis,
  type RuleExtractionResponse,
  type RuleReviewStatus,
  type WarningReport
} from "../../../../shared/ontology-service";
import {
  buildDetectionFlowSteps,
  buildDetectionTraceExplanations,
  buildDetectionTraceSteps,
  buildRecordInputSummary,
  buildRecordOptionLabel,
  buildRecordOptionGroups,
  TRACE_EXPLANATION_LABELS,
  statusText,
  summarizeDetectionOutcome,
  type DetectionApiCallKey,
  type DetectionApiRuntimeCall,
  type DetectionRequestPhase,
  type FlowStepStatus
} from "./owl2WorkbenchState";
import { labelReviewStatus } from "../../i18n/zhCN";

export type WorkbenchMode = "structure" | "rules" | "detect" | "root" | "report" | "knowledge";
type RuleCandidate = RuleExtractionResponse["candidates"][number];

const modeItems: Array<{ key: WorkbenchMode; label: string; icon: typeof FileCode2 }> = [
  { key: "structure", label: "OWL2结构", icon: FileCode2 },
  { key: "rules", label: "质量规则", icon: ShieldCheck },
  { key: "detect", label: "检测流程", icon: Activity },
  { key: "root", label: "根因分析", icon: Radar },
  { key: "report", label: "预警报告", icon: Siren },
  { key: "knowledge", label: "规则抽取复核", icon: ClipboardCheck }
];

export function Owl2WorkbenchView({ dataset, initialMode = "structure", initialRecordId }: { dataset: DemoDataset; initialMode?: WorkbenchMode; initialRecordId?: string }) {
  const [mode, setMode] = useState<WorkbenchMode>(initialMode);
  const [selectedId, setSelectedId] = useState("SPRInspectionProcess");
  const defaultRecordId = useMemo(() => (
    dataset.records.find((record) => record.faultCode?.includes("高于包络线"))?.id ?? dataset.records[0]?.id ?? ""
  ), [dataset.records]);
  const [recordId, setRecordId] = useState(initialRecordId ?? defaultRecordId);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [rootCause, setRootCause] = useState<RootCauseAnalysis | null>(null);
  const [report, setReport] = useState<WarningReport | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionPhase, setDetectionPhase] = useState<DetectionRequestPhase>("idle");
  const [detectError, setDetectError] = useState<string | null>(null);
  const [apiCalls, setApiCalls] = useState<Partial<Record<DetectionApiCallKey, DetectionApiRuntimeCall>>>({});
  const [selectedTraceKey, setSelectedTraceKey] = useState("input");
  const [sourceDocument, setSourceDocument] = useState("expert-sop.md");
  const [knowledgeText, setKnowledgeText] = useState("铆接曲线高于包络线时，需要复核参数集版本并检查铆模状态。");
  const [extraction, setExtraction] = useState<RuleExtractionResponse | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, RuleReviewStatus>>({});
  const [reviewToken, setReviewToken] = useState("");
  const [candidateQueue, setCandidateQueue] = useState<RuleExtractionResponse["candidates"]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const graph = useMemo(() => buildOntologyWorkbenchGraph(dataset), [dataset]);
  const validation = useMemo(() => validateOwl2Artifacts(dataset), [dataset]);
  const classes = useMemo(() => listOntologyClasses(dataset), [dataset]);
  const properties = useMemo(() => listOntologyProperties(), []);
  const rules = useMemo(() => listQualityRules(), []);
  const recordGroups = useMemo(() => buildRecordOptionGroups(dataset.records, recordId), [dataset.records, recordId]);
  const selectedRecord = useMemo(() => dataset.records.find((record) => record.id === recordId), [dataset.records, recordId]);
  const selected = graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes[0];
  const selectedClass = classes.find((item) => item.id === selected?.id);
  const selectedRule = rules.find((item) => item.id === selected?.id);
  const selectedProperties = getClassProperties(selectedClass, classes, properties);
  const owlUrl = useMemo(() => URL.createObjectURL(new Blob([exportOwlXml(dataset)], { type: "application/rdf+xml" })), [dataset]);
  const topOwlUrl = useMemo(() => URL.createObjectURL(new Blob([exportTopOntologyOwlXml()], { type: "application/rdf+xml" })), []);

  useEffect(() => {
    if (!recordId && defaultRecordId) setRecordId(defaultRecordId);
  }, [defaultRecordId, recordId]);

  useEffect(() => {
    if (initialRecordId && dataset.records.some((record) => record.id === initialRecordId)) setRecordId(initialRecordId);
  }, [dataset.records, initialRecordId]);

  useEffect(() => {
    setDetection(null);
    setRootCause(null);
    setReport(null);
    setDetectError(null);
    setDetectionPhase("idle");
    setApiCalls({});
    setSelectedTraceKey("input");
  }, [recordId]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    loadKnowledgeRuleCandidates()
      .then(setCandidateQueue)
      .catch(() => undefined);
  }, []);

  useEffect(() => () => URL.revokeObjectURL(owlUrl), [owlUrl]);
  useEffect(() => () => URL.revokeObjectURL(topOwlUrl), [topOwlUrl]);

  const highlightedIds = useMemo(() => {
    if (mode === "detect") return ["SPRProcessRecord", "SPRInspectionProcess", "DetectionModel", "ModelPredictionResult", "InspectionResult", "AnomalyEvent"];
    if (mode === "root") return ["AnomalyEvent", "DefectPattern", "RootCause"];
    if (mode === "report") return ["AnomalyEvent", "RootCause", "WarningReport"];
    if (mode === "rules" || mode === "knowledge") return rules.map((rule) => rule.id);
    return [selected?.id ?? "SPRInspectionProcess"];
  }, [mode, rules, selected?.id]);

  async function handleRunDetection() {
    if (!recordId) return;
    setIsDetecting(true);
    setDetectionPhase("detecting");
    setDetectError(null);
    setDetection(null);
    setRootCause(null);
    setReport(null);
    setApiCalls({});
    setSelectedTraceKey("detect");
    setMode("detect");
    try {
      const detectRequest = { recordId, includeCurveSummary: true };
      const nextDetection = await runTrackedApiCall("detect", "检测 API", "/api/detect/run", detectRequest, () => runRemoteDetection(detectRequest));
      setDetection(nextDetection);
      setDetectionPhase("analyzing");
      const rootRequest = { detection: nextDetection };
      const nextRootCause = await runTrackedApiCall("root", "根因分析 API", "/api/root-cause/analyze", rootRequest, () => analyzeRemoteRootCause(rootRequest));
      setRootCause(nextRootCause);
      setDetectionPhase("reporting");
      const reportRequest = { detection: nextDetection, rootCause: nextRootCause };
      const nextReport = await runTrackedApiCall("report", "预警报告 API", "/api/reports/warning", reportRequest, () => createRemoteWarningReport(reportRequest));
      setReport(nextReport);
      setDetectionPhase("complete");
      setSelectedTraceKey("final");
    } catch (error) {
      setDetectError(error instanceof Error ? error.message : String(error));
      setDetectionPhase("error");
    } finally {
      setIsDetecting(false);
    }
  }

  async function runTrackedApiCall<T>(
    key: DetectionApiCallKey,
    title: string,
    endpoint: string,
    request: unknown,
    runner: () => Promise<T>
  ): Promise<T> {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    setSelectedTraceKey(key);
    setApiCalls((current) => ({
      ...current,
      [key]: {
        key,
        title,
        method: "POST",
        endpoint,
        status: "running",
        request,
        startedAt
      }
    }));

    try {
      const response = await runner();
      setApiCalls((current) => ({
        ...current,
        [key]: {
          ...(current[key] ?? { key, title, method: "POST", endpoint, request }),
          status: "done",
          response,
          finishedAt: new Date().toISOString(),
          durationMs: Math.round(performance.now() - started)
        }
      }));
      return response;
    } catch (error) {
      setApiCalls((current) => ({
        ...current,
        [key]: {
          ...(current[key] ?? { key, title, method: "POST", endpoint, request }),
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          finishedAt: new Date().toISOString(),
          durationMs: Math.round(performance.now() - started)
        }
      }));
      throw error;
    }
  }

  async function handleExtractRules() {
    setIsExtracting(true);
    setExtractError(null);
    setPublishMessage(null);
    try {
      const result = await extractKnowledgeRules({ sourceDocument, text: knowledgeText });
      const latestQueue = await loadKnowledgeRuleCandidates().catch(() => []);
      setExtraction(result);
      setCandidateQueue(mergeRuleCandidates(result.candidates, latestQueue));
      setReviewOverrides({});
      setMode("knowledge");
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleReviewCandidate(candidateId: string, reviewStatus: RuleReviewStatus) {
    setExtractError(null);
    setPublishMessage(null);
    try {
      const reviewed = await reviewKnowledgeRuleCandidate(candidateId, reviewStatus, reviewToken);
      setReviewOverrides((current) => ({ ...current, [candidateId]: reviewed.reviewStatus }));
      setCandidateQueue((current) => mergeRuleCandidates(current, [reviewed]));
      setExtraction((current) => current ? {
        ...current,
        candidates: mergeRuleCandidates(current.candidates, [reviewed])
      } : current);
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handlePublishApproved() {
    const approvedIds = getVisibleRuleCandidates(extraction, candidateQueue, reviewOverrides)
      .filter((candidate) => candidate.reviewStatus === "approved" && !candidate.publishedVersionId)
      .map((candidate) => candidate.candidateId);
    if (approvedIds.length === 0) return;
    setIsPublishing(true);
    setPublishMessage(null);
    setExtractError(null);
    try {
      const result = await publishKnowledgeRules(approvedIds, reviewToken);
      setPublishMessage(`已发布 ${result.publishedRules.length} 条规则到本体版本 ${result.versionId}`);
      const latest = await loadKnowledgeRuleCandidates();
      setCandidateQueue(latest);
      setExtraction((current) => current ? { ...current, candidates: latest } : current);
      setReviewOverrides({});
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <section className="ontology-page owl2-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">OWL2 语义工作台</span>
          <h2>本体驱动检测、根因与预警闭环</h2>
        </div>
        <div className="page-actions">
          <a className="icon-text-button" href={topOwlUrl} download="top-ontology.owl">
            <FileCode2 size={16} />
            <span>导出顶层OWL2</span>
          </a>
          <a className="icon-text-button" href={owlUrl} download="spr-ontology-current.owl">
            <FileCode2 size={16} />
            <span>导出 OWL2</span>
          </a>
        </div>
      </div>

      <div className="semantic-status">
        <div>
          <strong>{validation.metrics.classes}</strong>
          <span>OWL2 类</span>
        </div>
        <div>
          <strong>{validation.metrics.objectProperties}</strong>
          <span>对象属性</span>
        </div>
        <div>
          <strong>{validation.metrics.rules}</strong>
          <span>质量规则</span>
        </div>
        <div className={validation.success ? "status-ok" : "status-blocked"}>
          <strong>{validation.success ? "通过" : "阻塞"}</strong>
          <span>本体校验</span>
        </div>
      </div>

      <div className="toolbar semantic-toolbar">
        {modeItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.key} className={mode === item.key ? "active" : ""} onClick={() => setMode(item.key)}>
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
        <div className="record-picker-panel">
          <div className="record-picker-copy">
            <GitBranch size={16} />
            <span>
              <strong>检测记录选择</strong>
              <em>列表按来源表分组：RIP_ROP 表用于铆接故障与曲线检测，main 主表用于主过程记录和 pre 预测编码复核。</em>
            </span>
          </div>
          <label className="record-picker">
            <select value={recordId} onChange={(event) => setRecordId(event.target.value)} aria-label="选择要运行检测流程的数据库记录">
              {recordGroups.map((group) => (
                <optgroup key={group.source} label={group.label}>
                  {group.records.map((record) => (
                    <option key={record.id} value={record.id}>{buildRecordOptionLabel(record)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {selectedRecord && (
            <div className="record-picker-summary">
              <span>{selectedRecord.source === "rip_rop" ? "RIP_ROP 表" : "main 主表"}</span>
              <span>{selectedRecord.deviceName || "设备未提供"}</span>
              <span>{selectedRecord.timestamp || "时间未提供"}</span>
            </div>
          )}
        </div>
        <button type="button" className="primary-action" onClick={handleRunDetection} disabled={isDetecting || !recordId}>
          {isDetecting ? <Loader2 size={16} /> : <Activity size={16} />}
          {isDetecting ? "检测中" : "调用检测 API"}
        </button>
      </div>

      <div className="ontology-workbench owl2-workbench">
        <OntologyGraph
          nodes={graph.nodes}
          edges={graph.edges}
          view="all"
          layout="breadthfirst"
          selectedId={selected?.id}
          highlightedIds={highlightedIds}
          onSelect={(node: GraphNode) => setSelectedId(node.id)}
        />
        <aside className="inspector semantic-inspector">
          <div className={`node-badge ${selected?.type === "rule" ? "spr-rule" : "top"}`}>{selected?.type === "rule" ? "质量规则" : selectedClass?.module ?? "OWL2"}</div>
          <h2>{selected?.label}</h2>
          <p>{selectedRule?.triggerCondition ?? selectedClass?.description ?? selected?.description}</p>
          {selectedClass && (
            <>
              <dl className="detail-grid">
                <dt>模块</dt>
                <dd>{selectedClass.module}</dd>
                <dt>父类</dt>
                <dd>{classes.find((item) => item.id === selectedClass.parent)?.label ?? selectedClass.parent ?? "顶层类"}</dd>
                <dt>IRI</dt>
                <dd>#{selectedClass.id}</dd>
                <dt>属性数</dt>
                <dd>{selectedProperties.length}</dd>
              </dl>
              <h4>属性明细</h4>
              <div className="property-detail-list">
                {selectedProperties.map((property) => (
                  <div key={property.id}>
                    <strong>{property.label}</strong>
                    <span>{property.domain === selectedClass.id ? "作为起点" : property.range === selectedClass.id ? "作为终点" : "继承属性"}：#{property.domain} → #{property.range}</span>
                    <p>{property.description}</p>
                  </div>
                ))}
                {selectedProperties.length === 0 && <p className="muted">当前类暂未在 OWL2 属性中作为起点或终点出现。</p>}
              </div>
            </>
          )}
          {selectedRule && (
            <dl className="detail-grid">
              <dt>适用工艺</dt>
              <dd>{selectedRule.applicableProcess}</dd>
              <dt>异常模式</dt>
              <dd>{selectedRule.defectPattern}</dd>
              <dt>等级</dt>
              <dd>{selectedRule.severity}</dd>
              <dt>证据字段</dt>
              <dd>{selectedRule.evidenceFields.join(" / ")}</dd>
            </dl>
          )}
          <h4>校验提示</h4>
          <div className="evidence-list">
            {validation.warnings.slice(0, 3).map((warning) => (
              <div key={warning.code}>
                <strong>{warning.code}</strong>
                <span>{warning.message}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {mode === "structure" && <StructurePanel classes={classes} properties={properties} />}
      {mode === "rules" && <RulesPanel rules={rules} onSelect={setSelectedId} />}
      {mode === "detect" && (
        <DetectionPanel
          record={selectedRecord}
          recordId={recordId}
          phase={detectionPhase}
          detection={detection}
          rootCause={rootCause}
          report={report}
          apiCalls={apiCalls}
          selectedTraceKey={selectedTraceKey}
          isRunning={isDetecting}
          error={detectError}
          onRun={handleRunDetection}
          onSelectTrace={setSelectedTraceKey}
        />
      )}
      {mode === "root" && <RootCausePanel rootCause={rootCause} />}
      {mode === "report" && <ReportPanel report={report} />}
      {mode === "knowledge" && (
        <KnowledgeExtractionPanel
          sourceDocument={sourceDocument}
          text={knowledgeText}
          extraction={extraction}
          isExtracting={isExtracting}
          error={extractError}
          reviewOverrides={reviewOverrides}
          reviewToken={reviewToken}
          candidateQueue={candidateQueue}
          isPublishing={isPublishing}
          publishMessage={publishMessage}
          onSourceDocumentChange={setSourceDocument}
          onTextChange={setKnowledgeText}
          onReviewTokenChange={setReviewToken}
          onExtract={handleExtractRules}
          onReview={handleReviewCandidate}
          onPublishApproved={handlePublishApproved}
        />
      )}
    </section>
  );
}

function StructurePanel({ classes, properties }: { classes: ReturnType<typeof listOntologyClasses>; properties: ReturnType<typeof listOntologyProperties> }) {
  return (
    <div className="semantic-panels">
      <section className="panel semantic-panel-wide">
        <div className="section-heading">
          <h3>OWL2 模块覆盖</h3>
          <span>{classes.length} 类</span>
        </div>
        <p className="principle-copy">工作原理：这里把系统内部的概念拆成多个 OWL2 模块。类表示“是什么”，对象属性表示“谁和谁有关”，数据属性表示“对象身上有哪些字段值”。检测流程会沿这些类和属性把数据库记录、模型结果、异常事件、根因和报告连起来。</p>
        <div className="module-grid">
          {(["core.owl", "process.owl", "resource.owl", "quality.owl", "model.owl", "spr.owl"] as const).map((module) => (
            <div key={module}>
              <strong>{module}</strong>
              <span>{classes.filter((item) => item.module === module).length} 个类</span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h3>关键属性</h3>
          <span>{properties.length}</span>
        </div>
        <p className="principle-copy">工作原理：属性就是本体中的“连接线”。例如“产生异常事件”表示检测结果可以生成异常事件，“候选根因”表示异常事件会继续指向根因候选。</p>
        <div className="relation-list compact">
          {properties.slice(0, 12).map((property) => (
            <div key={property.id}>#{property.domain}{" -> "}<strong>{property.label}</strong>{" -> "}#{property.range}</div>
          ))}
        </div>
      </section>
    </div>
  );
}

function getClassProperties(
  selectedClass: ReturnType<typeof listOntologyClasses>[number] | undefined,
  classes: ReturnType<typeof listOntologyClasses>,
  properties: ReturnType<typeof listOntologyProperties>
) {
  if (!selectedClass) return [];
  const classIds = new Set<string>();
  let current: typeof selectedClass | undefined = selectedClass;
  while (current) {
    classIds.add(current.id);
    current = current.parent ? classes.find((item) => item.id === current?.parent) : undefined;
  }
  return properties.filter((property) => classIds.has(property.domain) || classIds.has(property.range));
}

function RulesPanel({ rules, onSelect }: { rules: ReturnType<typeof listQualityRules>; onSelect: (id: string) => void }) {
  return (
    <div className="semantic-panels">
      <section className="panel semantic-panel-wide">
        <div className="section-heading">
          <h3>质量规则工作原理</h3>
          <span>{rules.length} 条规则</span>
        </div>
        <p className="principle-copy">系统先把数据库字段映射到本体类，再用质量规则检查字段和曲线摘要。每条规则都说明适用工艺、触发条件、异常模式、证据字段、候选根因和建议动作，所以后续检测结果不是黑盒分数，而是可追溯的语义判断。</p>
      </section>
      {rules.map((rule) => (
        <button key={rule.id} type="button" className="rule-row" onClick={() => onSelect(rule.id)}>
          <span>{rule.id}</span>
          <strong>{rule.name}</strong>
          <em>{rule.defectPattern}</em>
        </button>
      ))}
    </div>
  );
}

function DetectionPanel({
  record,
  recordId,
  phase,
  detection,
  rootCause,
  report,
  apiCalls,
  selectedTraceKey,
  isRunning,
  error,
  onRun,
  onSelectTrace
}: {
  record: ProcessRecord | undefined;
  recordId: string;
  phase: DetectionRequestPhase;
  detection: DetectionResult | null;
  rootCause: RootCauseAnalysis | null;
  report: WarningReport | null;
  apiCalls: Partial<Record<DetectionApiCallKey, DetectionApiRuntimeCall>>;
  selectedTraceKey: string;
  isRunning: boolean;
  error: string | null;
  onRun: () => void;
  onSelectTrace: (key: string) => void;
}) {
  const summary = summarizeDetectionOutcome(detection);
  const flowSteps = buildDetectionFlowSteps({ phase, recordId, detection, rootCause, report });
  const traceSteps = buildDetectionTraceSteps({ phase, recordId, record, detection, rootCause, report, calls: apiCalls });
  const traceExplanations = buildDetectionTraceExplanations(traceSteps);
  const activeTrace = traceSteps.find((step) => step.key === selectedTraceKey) ?? traceSteps[0];
  const inputSummary = buildRecordInputSummary(record);
  const primaryRootCause = rootCause?.candidates[0];

  return (
    <div className="detect-experience">
      <section className="panel detect-command-center">
        <div className="section-heading">
          <h3>检测 API 全流程</h3>
          <span>{phase === "idle" ? "待运行" : phase === "complete" ? "已完成" : phase === "error" ? "调用失败" : "运行中"}</span>
        </div>
          <p className="principle-copy">工作原理：这条流程把“一条数据库记录”依次变成“检测判断”“根因候选”“预警报告”。每一步都会保留输入、接口、输出和本体路径，因此可以从数据库原始字段一直追溯到最终预警动作。</p>
          <div className="flow-explain-banner">
            <strong>全流程阅读顺序</strong>
            <span>先看输入记录来自哪张表，再看检测 API 给出的异常类别，然后看根因 API 如何把异常映射到候选原因，最后看报告 API 如何生成复核动作。</span>
          </div>
        <div className="detect-brief">
          <div>
            <span>输入</span>
            <strong>{recordId || "未选择记录"}</strong>
            <p>系统把这条过程记录的原始字段、曲线摘要和本体路径发给 Worker，由 Worker 调用模型或规则服务。</p>
          </div>
          <button type="button" className="primary-action detect-run-button" onClick={onRun} disabled={isRunning || !recordId}>
            {isRunning ? <Loader2 size={18} /> : <Activity size={18} />}
            {isRunning ? "正在执行全流程" : detection ? "重新运行全流程" : "运行检测全流程"}
          </button>
        </div>
        {error && <p className="api-error">{error}</p>}

        <div className="api-flow">
          {flowSteps.map((step, index) => (
            <div key={step.key} className={`api-flow-step status-${step.status}`}>
              <div className="step-marker">{step.status === "running" ? <Loader2 size={16} /> : step.status === "done" ? <CheckCircle2 size={16} /> : index + 1}</div>
              <div>
                <div className="step-heading">
                  <strong>{step.title}</strong>
                  <span>{statusText(step.status)}</span>
                </div>
                <p>{step.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel api-trace-panel">
        <div className="section-heading">
          <h3>透明调用台</h3>
          <span>{traceSteps.filter((step) => step.status === "done").length}/{traceSteps.length} 已输出</span>
        </div>
        <p className="principle-copy">工作原理：透明调用台把每个接口调用拆开显示。左侧是步骤，右侧是该步骤真实发送的 JSON 输入和返回的 JSON 输出，用来证明系统没有只展示最终结论。</p>
        <div className="api-trace-layout">
          <div className="api-trace-list" aria-label="API 调用阶段">
            {traceSteps.map((step, index) => (
              <button
                key={step.key}
                type="button"
                className={activeTrace.key === step.key ? "active" : ""}
                onClick={() => onSelectTrace(step.key)}
              >
                <span className={`trace-index status-${step.status}`}>{index + 1}</span>
                <span>
                  <strong>{step.title}</strong>
                  <em>{step.endpoint ? `${step.method} ${step.endpoint}` : step.description}</em>
                </span>
                <small>{step.durationMs !== undefined ? `${step.durationMs}ms` : statusText(step.status)}</small>
              </button>
            ))}
          </div>
          <div className="api-trace-detail">
            <div className="trace-detail-head">
              <div>
                <strong>{activeTrace.title}</strong>
                <p>{activeTrace.description}</p>
              </div>
              <span className={`trace-status status-${activeTrace.status}`}>{statusText(activeTrace.status)}</span>
            </div>
            <div className="trace-meta">
              <span>{activeTrace.endpoint ? `${activeTrace.method} ${activeTrace.endpoint}` : "本地输入/汇总"}</span>
              {activeTrace.startedAt && <span>开始 {formatTraceTime(activeTrace.startedAt)}</span>}
              {activeTrace.finishedAt && <span>结束 {formatTraceTime(activeTrace.finishedAt)}</span>}
              {activeTrace.durationMs !== undefined && <span>耗时 {activeTrace.durationMs}ms</span>}
            </div>
            <div className="trace-io-grid">
              <TraceBlock title="请求数据（JSON）" value={activeTrace.input} />
              <TraceBlock title={activeTrace.error ? "错误信息" : "响应数据（JSON）"} value={activeTrace.error ? { message: activeTrace.error } : activeTrace.output} emptyText="等待该阶段返回输出" />
            </div>
          </div>
        </div>
      </section>

      <section className="panel trace-explanation-panel">
        <div className="section-heading">
          <h3>全流程输入输出释义</h3>
          <span>面向初学者</span>
        </div>
        <p className="principle-copy">本区域用正式业务口径解释透明调用台中的每一个阶段。它不是重复 JSON 字段，而是说明每个阶段接收什么、调用哪个接口、系统内部如何处理，以及结果会被下一步怎样使用。</p>
        <div className="trace-explanation-list">
          {traceExplanations.map((item, index) => (
            <article key={item.stepKey}>
              <span>{index + 1}</span>
              <div>
                <h4>{item.title}</h4>
                <p><strong>{TRACE_EXPLANATION_LABELS.inputMeaning}：</strong>{item.inputMeaning}</p>
                <p><strong>{TRACE_EXPLANATION_LABELS.callMeaning}：</strong>{item.callMeaning}</p>
                <p><strong>{TRACE_EXPLANATION_LABELS.operationMeaning}：</strong>{item.operationMeaning}</p>
                <p><strong>{TRACE_EXPLANATION_LABELS.outputMeaning}：</strong>{item.outputMeaning}</p>
                <em>{item.plainLanguageSummary}</em>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="detect-grid">
        <section className="panel">
          <div className="section-heading">
            <h3>输入记录</h3>
            <span>ProcessRecord</span>
          </div>
          <p className="principle-copy">工作原理：输入记录是数据库行在本体中的统一格式。RIP_ROP 表字段偏向铆接故障和曲线，main 主表字段偏向主过程记录和预测编码；系统会先整理成 ProcessRecord，后续流程只读取这个统一对象。</p>
          <dl className="detail-grid detect-input-grid">
            {inputSummary.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="panel detection-result-panel">
          <div className="section-heading">
            <h3>模型判断</h3>
            <span>{summary.modeLabel}</span>
          </div>
          <p className="principle-copy">工作原理：模型判断不会只返回一个分数，而是返回类别、置信度、严重程度和证据。证据会指向故障代码、曲线或模型字段，方便复核。</p>
          <div className={`decision-meter severity-${detection?.prediction.severity ?? "idle"}`}>
            <strong>{summary.confidenceLabel}</strong>
            <span>{summary.categoryLabel}</span>
          </div>
          <p className="decision-copy">{summary.decision}</p>
          <div className="evidence-stack">
            {(detection?.prediction.evidence ?? ["运行后这里会显示模型使用了哪些字段、曲线或故障线索。"]).map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h3>根因输出</h3>
            <span>{primaryRootCause ? `${Math.round(primaryRootCause.confidence * 100)}%` : "待生成"}</span>
          </div>
          <p className="principle-copy">工作原理：根因分析把异常模式映射到候选原因，并把每个候选原因绑定证据和建议动作。它不是直接给最终定责，而是给人工复核一个有依据的候选列表。</p>
          {primaryRootCause ? (
            <>
              <strong className="result-title">{primaryRootCause.rootCause}</strong>
              <p>{primaryRootCause.recommendation}</p>
              <div className="mapping-chips">{primaryRootCause.evidence.map((item) => <span key={item}>{item}</span>)}</div>
            </>
          ) : (
            <p className="muted">检测完成后，系统会把异常映射为候选根因和建议动作。</p>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <h3>预警报告</h3>
            <span>{report?.severity ?? "待生成"}</span>
          </div>
          <p className="principle-copy">工作原理：预警报告把检测和根因结果整理成质量人员能执行的任务，包括标题、摘要、触发规则和复核动作。</p>
          {report ? (
            <>
              <strong className="result-title">{report.title}</strong>
              <p>{report.summary}</p>
              <div className="relation-list compact">{report.actions.map((action) => <div key={action}>{action}</div>)}</div>
            </>
          ) : (
            <p className="muted">最后一步会生成可汇报的预警标题、摘要和复核动作。</p>
          )}
        </section>
      </div>

      <section className="panel semantic-path-panel">
        <div className="section-heading">
          <h3>本体路径</h3>
          <span>OWL2 Trace</span>
        </div>
        <p className="principle-copy">工作原理：本体路径说明一次判断穿过了哪些语义节点。它让人能从 SPR 检测流程一路追到检测结果、异常事件、缺陷模式、根因和报告。</p>
        <div className="semantic-timeline">
          {(report?.ontologyPath ?? detection?.ontologyPath ?? ["SPRProcessRecord", "SPRInspectionProcess", "DetectionModel", "ModelPredictionResult", "InspectionResult", "AnomalyEvent"]).map((item) => <span key={item}>{item}</span>)}
        </div>
      </section>
    </div>
  );
}

function TraceBlock({ title, value, emptyText = "暂无内容" }: { title: string; value: unknown; emptyText?: string }) {
  return (
    <div className="trace-block">
      <div>{title}</div>
      <pre>{formatTraceValue(value, emptyText)}</pre>
    </div>
  );
}

function formatTraceValue(value: unknown, emptyText: string): string {
  if (value === undefined || value === null) return emptyText;
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function formatTraceTime(value: string): string {
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false });
}

function RootCausePanel({ rootCause }: { rootCause: RootCauseAnalysis | null }) {
  if (!rootCause) return <section className="panel"><p className="muted">请先运行检测流程。</p></section>;
  return (
    <div className="semantic-panels">
      <section className="panel semantic-panel-wide">
        <div className="section-heading">
          <h3>根因分析工作原理</h3>
          <span>RootCause</span>
        </div>
        <p className="principle-copy">系统先读取检测阶段输出的异常模式，再查质量规则中配置的候选根因、证据字段和建议动作。根因输出是“候选解释”，用于帮助质量人员快速定位复核方向。</p>
      </section>
      {rootCause.candidates.map((candidate) => (
        <section key={candidate.rootCause} className="panel">
          <div className="section-heading">
            <h3>{candidate.rootCause}</h3>
            <span>{Math.round(candidate.confidence * 100)}%</span>
          </div>
          <p>{candidate.recommendation}</p>
          <div className="mapping-chips">{candidate.evidence.map((item) => <span key={item}>{item}</span>)}</div>
        </section>
      ))}
    </div>
  );
}

function ReportPanel({ report }: { report: WarningReport | null }) {
  if (!report) return <section className="panel"><p className="muted">请先运行检测流程。</p></section>;
  return (
    <div className="semantic-panels">
      <section className="panel semantic-panel-wide">
        <div className="section-heading">
          <h3>{report.title}</h3>
          <span>{report.severity}</span>
        </div>
        <p className="principle-copy">工作原理：预警报告把检测类别、根因候选和本体路径合并成一份可复核的质量任务。它保留触发规则和动作列表，便于后续闭环处理。</p>
        <p>{report.summary}</p>
        <div className="semantic-timeline">{report.ontologyPath.map((item) => <span key={item}>{item}</span>)}</div>
      </section>
      <section className="panel">
        <h3>复核动作</h3>
        <p className="principle-copy">工作原理：复核动作来自根因候选中的推荐措施，系统把它们整理成可执行清单。</p>
        <div className="relation-list compact">{report.actions.map((action) => <div key={action}>{action}</div>)}</div>
      </section>
    </div>
  );
}

function KnowledgeExtractionPanel({
  sourceDocument,
  text,
  extraction,
  isExtracting,
  error,
  reviewOverrides,
  reviewToken,
  candidateQueue,
  isPublishing,
  publishMessage,
  onSourceDocumentChange,
  onTextChange,
  onReviewTokenChange,
  onExtract,
  onReview,
  onPublishApproved
}: {
  sourceDocument: string;
  text: string;
  extraction: RuleExtractionResponse | null;
  isExtracting: boolean;
  error: string | null;
  reviewOverrides: Record<string, RuleReviewStatus>;
  reviewToken: string;
  candidateQueue: RuleExtractionResponse["candidates"];
  isPublishing: boolean;
  publishMessage: string | null;
  onSourceDocumentChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onReviewTokenChange: (value: string) => void;
  onExtract: () => void;
  onReview: (candidateId: string, status: RuleReviewStatus) => void;
  onPublishApproved: () => void;
}) {
  const candidates = getVisibleRuleCandidates(extraction, candidateQueue, reviewOverrides);
  const approvedCount = candidates.filter((candidate) => candidate.reviewStatus === "approved" && !candidate.publishedVersionId).length;
  return (
    <div className="semantic-panels">
      <section className="panel semantic-panel-wide knowledge-form">
        <div className="section-heading">
          <h3>专家文档规则抽取</h3>
          <span>{extraction ? labelReviewStatus(extraction.reviewStatus) : "未抽取"}</span>
        </div>
        <p className="principle-copy">工作原理：这里把专家经验文本送入规则抽取接口，系统会尝试识别触发条件、异常模式、证据字段、候选根因和建议动作。抽取结果不会直接进入规则库，必须先复核再发布到本体版本。</p>
        <label>
          来源文档
          <input value={sourceDocument} onChange={(event) => onSourceDocumentChange(event.target.value)} />
        </label>
        <label>
          文档片段
          <textarea value={text} rows={5} onChange={(event) => onTextChange(event.target.value)} />
        </label>
        <label>
          管理员令牌
          <input type="password" value={reviewToken} onChange={(event) => onReviewTokenChange(event.target.value)} />
        </label>
        <div className="action-row">
          <button type="button" className="primary-action" onClick={onExtract} disabled={isExtracting || text.trim().length === 0}>
            {isExtracting ? <Loader2 size={16} /> : <ClipboardCheck size={16} />}
            {isExtracting ? "抽取中" : "调用 /api/knowledge/extract-rules"}
          </button>
          <button type="button" className="primary-action" onClick={onPublishApproved} disabled={isPublishing || approvedCount === 0 || reviewToken.trim().length === 0}>
            {isPublishing ? <Loader2 size={16} /> : <FileCode2 size={16} />}
            {isPublishing ? "发布中" : `发布已通过规则 ${approvedCount}`}
          </button>
          {error && <span className="api-error">{error}</span>}
          {publishMessage && <span className="muted">{publishMessage}</span>}
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h3>复核队列</h3>
          <span>{candidates.length}</span>
        </div>
        <p className="principle-copy">工作原理：复核队列是规则进入本体前的人工确认关口。只有“已通过”的候选规则会被发布成新的本体规则节点。</p>
        <div className="review-list">
          {candidates.map((candidate) => {
            const status = reviewOverrides[candidate.candidateId] ?? candidate.reviewStatus;
            return (
              <div key={candidate.candidateId} className={`review-candidate status-${status}`}>
                <div>
                  <strong>{candidate.ruleName}</strong>
                  <span>{candidate.sourceExcerpt}</span>
                </div>
                <dl className="detail-grid">
                  <dt>异常模式</dt>
                  <dd>{candidate.defectPattern}</dd>
                  <dt>候选根因</dt>
                  <dd>{candidate.rootCauseCandidate}</dd>
                  <dt>证据字段</dt>
                  <dd>{candidate.evidenceFields.join(" / ")}</dd>
                  <dt>状态</dt>
                  <dd>{candidate.publishedVersionId ? `已发布 ${candidate.publishedVersionId}` : labelReviewStatus(status)}</dd>
                </dl>
                <div className="candidate-actions">
                  <button type="button" onClick={() => onReview(candidate.candidateId, "approved")} disabled={reviewToken.trim().length === 0 || Boolean(candidate.publishedVersionId)}>
                    <CheckCircle2 size={15} />
                    通过
                  </button>
                  <button type="button" onClick={() => onReview(candidate.candidateId, "rejected")} disabled={reviewToken.trim().length === 0 || Boolean(candidate.publishedVersionId)}>
                    <XCircle size={15} />
                    退回
                  </button>
                </div>
              </div>
            );
          })}
          {candidates.length === 0 && <p className="muted">抽取后显示待复核规则候选。</p>}
        </div>
      </section>
    </div>
  );
}

function getVisibleRuleCandidates(
  extraction: RuleExtractionResponse | null,
  candidateQueue: RuleCandidate[],
  reviewOverrides: Record<string, RuleReviewStatus>
): RuleCandidate[] {
  return mergeRuleCandidates(extraction?.candidates ?? [], candidateQueue)
    .map((candidate) => reviewOverrides[candidate.candidateId]
      ? { ...candidate, reviewStatus: reviewOverrides[candidate.candidateId] }
      : candidate);
}

function mergeRuleCandidates(...groups: RuleCandidate[][]): RuleCandidate[] {
  const merged = new Map<string, RuleCandidate>();
  for (const group of groups) {
    for (const candidate of group) {
      const previous = merged.get(candidate.candidateId);
      merged.set(candidate.candidateId, previous ? { ...previous, ...candidate } : candidate);
    }
  }
  return Array.from(merged.values());
}
