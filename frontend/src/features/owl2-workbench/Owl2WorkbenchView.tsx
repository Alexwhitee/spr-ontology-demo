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
import type { DemoDataset, GraphNode } from "../../types/demo";
import {
  buildOntologyWorkbenchGraph,
  exportOwlXml,
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

export type WorkbenchMode = "structure" | "rules" | "detect" | "root" | "report" | "knowledge";

const modeItems: Array<{ key: WorkbenchMode; label: string; icon: typeof FileCode2 }> = [
  { key: "structure", label: "OWL2结构", icon: FileCode2 },
  { key: "rules", label: "质量规则", icon: ShieldCheck },
  { key: "detect", label: "检测流程", icon: Activity },
  { key: "root", label: "根因分析", icon: Radar },
  { key: "report", label: "预警报告", icon: Siren },
  { key: "knowledge", label: "规则抽取复核", icon: ClipboardCheck }
];

export function Owl2WorkbenchView({ dataset, initialMode = "structure" }: { dataset: DemoDataset; initialMode?: WorkbenchMode }) {
  const [mode, setMode] = useState<WorkbenchMode>(initialMode);
  const [selectedId, setSelectedId] = useState("SPRInspectionProcess");
  const defaultRecordId = useMemo(() => (
    dataset.records.find((record) => record.faultCode?.includes("高于包络线"))?.id ?? dataset.records[0]?.id ?? ""
  ), [dataset.records]);
  const [recordId, setRecordId] = useState(defaultRecordId);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [rootCause, setRootCause] = useState<RootCauseAnalysis | null>(null);
  const [report, setReport] = useState<WarningReport | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
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
  const recordOptions = useMemo(() => {
    const firstRecords = dataset.records.slice(0, 120);
    const selectedRecord = dataset.records.find((record) => record.id === recordId);
    return selectedRecord && !firstRecords.some((record) => record.id === selectedRecord.id)
      ? [selectedRecord, ...firstRecords]
      : firstRecords;
  }, [dataset.records, recordId]);
  const selected = graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes[0];
  const selectedClass = classes.find((item) => item.id === selected?.id);
  const selectedRule = rules.find((item) => item.id === selected?.id);
  const owlUrl = useMemo(() => URL.createObjectURL(new Blob([exportOwlXml(dataset)], { type: "application/rdf+xml" })), [dataset]);

  useEffect(() => {
    if (!recordId && defaultRecordId) setRecordId(defaultRecordId);
  }, [defaultRecordId, recordId]);

  useEffect(() => {
    setDetection(null);
    setRootCause(null);
    setReport(null);
    setDetectError(null);
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
    setDetectError(null);
    try {
      const nextDetection = await runRemoteDetection({ recordId, includeCurveSummary: true });
      const nextRootCause = await analyzeRemoteRootCause({ detection: nextDetection });
      const nextReport = await createRemoteWarningReport({ detection: nextDetection, rootCause: nextRootCause });
      setDetection(nextDetection);
      setRootCause(nextRootCause);
      setReport(nextReport);
      setMode("detect");
    } catch (error) {
      setDetectError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDetecting(false);
    }
  }

  async function handleExtractRules() {
    setIsExtracting(true);
    setExtractError(null);
    try {
      const result = await extractKnowledgeRules({ sourceDocument, text: knowledgeText });
      setExtraction(result);
      setCandidateQueue(result.candidates);
      setReviewOverrides({});
      setMode("knowledge");
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleReviewCandidate(candidateId: string, reviewStatus: RuleReviewStatus) {
    setReviewOverrides((current) => ({ ...current, [candidateId]: reviewStatus }));
    try {
      const reviewed = await reviewKnowledgeRuleCandidate(candidateId, reviewStatus, reviewToken);
      setCandidateQueue((current) => current.map((candidate) => candidate.candidateId === candidateId ? { ...candidate, ...reviewed } : candidate));
      setExtraction((current) => current ? {
        ...current,
        candidates: current.candidates.map((candidate) => candidate.candidateId === candidateId ? { ...candidate, ...reviewed } : candidate)
      } : current);
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handlePublishApproved() {
    const approvedIds = candidateQueue
      .filter((candidate) => (reviewOverrides[candidate.candidateId] ?? candidate.reviewStatus) === "approved" && !candidate.publishedVersionId)
      .map((candidate) => candidate.candidateId);
    if (approvedIds.length === 0) return;
    setIsPublishing(true);
    setPublishMessage(null);
    try {
      const result = await publishKnowledgeRules(approvedIds, reviewToken);
      setPublishMessage(`Published ${result.publishedRules.length} rule(s) to ontology version ${result.versionId}`);
      const latest = await loadKnowledgeRuleCandidates();
      setCandidateQueue(latest);
      setExtraction((current) => current ? { ...current, candidates: latest } : current);
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
          <span className="eyebrow">OWL2 Semantic Workbench</span>
          <h2>本体驱动检测、根因与预警闭环</h2>
        </div>
        <div className="page-actions">
          <p>图谱化展示 OWL2 类、属性、质量规则和检测流程，过程数据只作为检测编排输入。</p>
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
        <label className="record-picker">
          <GitBranch size={16} />
          <select value={recordId} onChange={(event) => setRecordId(event.target.value)}>
            {recordOptions.map((record) => (
              <option key={record.id} value={record.id}>{record.id} / {record.faultCode?.replace(/^DDC:\s*/, "") || record.predictionCategory || "未触发明确故障"}</option>
            ))}
          </select>
        </label>
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
            <dl className="detail-grid">
              <dt>模块</dt>
              <dd>{selectedClass.module}</dd>
              <dt>父类</dt>
              <dd>{selectedClass.parent ?? "顶层类"}</dd>
              <dt>IRI</dt>
              <dd>#{selectedClass.id}</dd>
              <dt>属性数</dt>
              <dd>{properties.filter((property) => property.domain === selectedClass.id || property.range === selectedClass.id).length}</dd>
            </dl>
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
      {mode === "detect" && <DetectionPanel recordId={recordId} detection={detection} isRunning={isDetecting} error={detectError} onRun={handleRunDetection} />}
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
        <div className="module-grid">
          {(["core.owl", "process.owl", "resource.owl", "quality.owl", "model.owl", "spr.owl"] as const).map((module) => (
            <div key={module}>
              <strong>{module}</strong>
              <span>{classes.filter((item) => item.module === module).length} classes</span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h3>关键属性</h3>
          <span>{properties.length}</span>
        </div>
        <div className="relation-list compact">
          {properties.slice(0, 12).map((property) => (
            <div key={property.id}>{property.domain}{" -> "}<strong>{property.label}</strong>{" -> "}{property.range}</div>
          ))}
        </div>
      </section>
    </div>
  );
}

function RulesPanel({ rules, onSelect }: { rules: ReturnType<typeof listQualityRules>; onSelect: (id: string) => void }) {
  return (
    <div className="semantic-panels">
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
  recordId,
  detection,
  isRunning,
  error,
  onRun
}: {
  recordId: string;
  detection: DetectionResult | null;
  isRunning: boolean;
  error: string | null;
  onRun: () => void;
}) {
  return (
    <div className="semantic-panels">
      <section className="panel semantic-panel-wide">
        <div className="section-heading">
          <h3>检测流程</h3>
          <span>{detection?.prediction.severity ?? "待运行"}</span>
        </div>
        <div className="action-row">
          <button type="button" className="primary-action" onClick={onRun} disabled={isRunning || !recordId}>
            {isRunning ? <Loader2 size={16} /> : <Activity size={16} />}
            {isRunning ? "调用中" : "运行 /api/detect/run"}
          </button>
          <span className="muted">当前记录：{recordId || "未选择"}</span>
        </div>
        {error && <p className="api-error">{error}</p>}
        {detection ? (
          <div className="semantic-timeline">
            {["SPRProcessRecord", detection.inspectionProcessId, detection.modelInvocationId, detection.prediction.category, detection.anomalyEvent?.id ?? "no-anomaly"].map((item) => <span key={item}>{item}</span>)}
          </div>
        ) : (
          <p className="muted">检测任务尚未运行。</p>
        )}
      </section>
      <section className="panel">
        <h3>模型输出</h3>
        {detection ? (
          <>
            <p className="large-number">{Math.round(detection.prediction.confidence * 100)}%</p>
            <p>{detection.prediction.evidence.join("；")}</p>
          </>
        ) : (
          <p className="muted">运行后显示模型预测、置信度和证据。</p>
        )}
      </section>
    </div>
  );
}

function RootCausePanel({ rootCause }: { rootCause: RootCauseAnalysis | null }) {
  if (!rootCause) return <section className="panel"><p className="muted">请先运行检测流程。</p></section>;
  return (
    <div className="semantic-panels">
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
        <p>{report.summary}</p>
        <div className="semantic-timeline">{report.ontologyPath.map((item) => <span key={item}>{item}</span>)}</div>
      </section>
      <section className="panel">
        <h3>复核动作</h3>
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
  const candidates = extraction?.candidates.length ? extraction.candidates : candidateQueue;
  const approvedCount = candidates.filter((candidate) => (reviewOverrides[candidate.candidateId] ?? candidate.reviewStatus) === "approved" && !candidate.publishedVersionId).length;
  return (
    <div className="semantic-panels">
      <section className="panel semantic-panel-wide knowledge-form">
        <div className="section-heading">
          <h3>专家文档规则抽取</h3>
          <span>{extraction?.reviewStatus ?? "未抽取"}</span>
        </div>
        <label>
          来源文档
          <input value={sourceDocument} onChange={(event) => onSourceDocumentChange(event.target.value)} />
        </label>
        <label>
          文档片段
          <textarea value={text} rows={5} onChange={(event) => onTextChange(event.target.value)} />
        </label>
        <label>
          Admin token
          <input type="password" value={reviewToken} onChange={(event) => onReviewTokenChange(event.target.value)} />
        </label>
        <div className="action-row">
          <button type="button" className="primary-action" onClick={onExtract} disabled={isExtracting || text.trim().length === 0}>
            {isExtracting ? <Loader2 size={16} /> : <ClipboardCheck size={16} />}
            {isExtracting ? "抽取中" : "调用 /api/knowledge/extract-rules"}
          </button>
          <button type="button" className="primary-action" onClick={onPublishApproved} disabled={isPublishing || approvedCount === 0 || reviewToken.trim().length === 0}>
            {isPublishing ? <Loader2 size={16} /> : <FileCode2 size={16} />}
            {isPublishing ? "Publishing" : `Publish ${approvedCount}`}
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
                  <dd>{candidate.publishedVersionId ? `published ${candidate.publishedVersionId}` : status}</dd>
                </dl>
                <div className="candidate-actions">
                  <button type="button" onClick={() => onReview(candidate.candidateId, "approved")} disabled={reviewToken.trim().length === 0}>
                    <CheckCircle2 size={15} />
                    通过
                  </button>
                  <button type="button" onClick={() => onReview(candidate.candidateId, "rejected")} disabled={reviewToken.trim().length === 0}>
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
