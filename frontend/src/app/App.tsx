import { useEffect, useMemo, useState } from "react";
import { Activity, Boxes, CheckCircle2, ClipboardCheck, Database, FileCode2, GitBranch, Loader2, Network, PanelLeftClose, PanelLeftOpen, PencilLine, Radar, Route, ShieldCheck, Siren } from "lucide-react";
import { Chart } from "../components/Chart";
import { HierarchyLinkageView } from "../features/hierarchy-linkage/HierarchyLinkageView";
import { Owl2WorkbenchView } from "../features/owl2-workbench/Owl2WorkbenchView";
import { OntologyEditorView } from "../features/ontology-editor/OntologyEditorView";
import { SprOntologyView } from "../features/spr-ontology/SprOntologyView";
import { TopOntologyView } from "../features/top-ontology/TopOntologyView";
import { buildAppShellClassName, resolveOwl2ModeForView, type Owl2BusinessView } from "./appLayoutState";
import {
  buildImportGuidance,
  databaseSourceOptions,
  defaultImportPayload,
  getDatabaseSourceOption,
  normalizeImportPayload,
  type DatabaseImportMode
} from "./databaseImportState";
import { importDatabaseRowsRemote, loadDataset } from "../lib/data";
import type { DatabaseImportResult, DemoDataset, ProcessRecord } from "../types/demo";
import { importDatabaseRows } from "../../../shared/ontology";

type ViewKey = "top" | "spr" | "linkage" | Owl2BusinessView | "editor";

const navItems: Array<{ key: ViewKey; label: string; icon: typeof Network }> = [
  { key: "top", label: "顶层工艺本体", icon: Network },
  { key: "spr", label: "SPR本体", icon: GitBranch },
  { key: "linkage", label: "层级联动", icon: Route },
  { key: "owl2", label: "OWL2工作台", icon: FileCode2 },
  { key: "owl2-rules", label: "规则库", icon: ShieldCheck },
  { key: "owl2-detect", label: "检测模型", icon: Activity },
  { key: "owl2-root", label: "根因分析", icon: Radar },
  { key: "owl2-report", label: "预警报告", icon: Siren },
  { key: "owl2-knowledge", label: "规则复核", icon: ClipboardCheck },
  { key: "editor", label: "在线编辑", icon: PencilLine }
];

export default function App() {
  const [dataset, setDataset] = useState<DemoDataset | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("linkage");
  const [error, setError] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [preferredRecordId, setPreferredRecordId] = useState<string | undefined>();

  useEffect(() => {
    loadDataset()
      .then(setDataset)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) return <div className="fatal">数据加载失败：{error}</div>;
  if (!dataset) return <div className="loading">SPR 演示数据加载中</div>;

  return (
    <div className={buildAppShellClassName(isSidebarCollapsed)}>
      <aside className="sidebar">
        <div className="sidebar-topline">
          <div className="brand" title="SPR 本体演示系统">
            <Boxes size={30} />
            <div>
              <strong>SPR 本体演示系统</strong>
              <span>顶层工艺本体 × SPR 细粒度工艺</span>
            </div>
          </div>
          <button
            className="sidebar-toggle"
            type="button"
            title={isSidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
            aria-label={isSidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
            onClick={() => setIsSidebarCollapsed((value) => !value)}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={activeView === item.key ? "active" : ""} title={item.label} onClick={() => setActiveView(item.key)}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <Database size={18} />
          <span>
            {Object.keys(dataset.top_ontology.nodes).length} 顶层类 · {Object.keys(dataset.spr_ontology.nodes).length} SPR 类 · {dataset.top_spr_mappings.length} 映射
          </span>
        </div>
      </aside>

      <main className="workspace">
        <TopBar dataset={dataset} />
        <OverviewStrip dataset={dataset} activeView={activeView} onNavigate={setActiveView} />
        <DatabaseImportPanel
          dataset={dataset}
          onImported={(result) => {
            setDataset(result.dataset);
            setPreferredRecordId(result.importedRecordIds[0]);
            setActiveView("owl2-detect");
          }}
        />
        {activeView === "top" && <TopOntologyView dataset={dataset} />}
        {activeView === "spr" && <SprOntologyView dataset={dataset} />}
        {activeView === "linkage" && <HierarchyLinkageView dataset={dataset} />}
        {isOwl2BusinessView(activeView) && <Owl2WorkbenchView dataset={dataset} initialMode={resolveOwl2ModeForView(activeView)} initialRecordId={preferredRecordId} />}
        {activeView === "editor" && <OntologyEditorView dataset={dataset} />}
      </main>
    </div>
  );
}

function DatabaseImportPanel({ dataset, onImported }: { dataset: DemoDataset; onImported: (result: DatabaseImportResult) => void }) {
  const [importMode, setImportMode] = useState<DatabaseImportMode>("row");
  const [sourceTable, setSourceTable] = useState<ProcessRecord["source"]>("rip_rop");
  const [jsonRows, setJsonRows] = useState(() => defaultImportPayload("row", "rip_rop"));
  const [token, setToken] = useState(() => localStorage.getItem("spr-ontology-admin-token") ?? "");
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<DatabaseImportResult | null>(null);
  const selectedSource = getDatabaseSourceOption(sourceTable);
  const guidance = buildImportGuidance(importMode, sourceTable);

  useEffect(() => {
    localStorage.setItem("spr-ontology-admin-token", token);
  }, [token]);

  function handleModeChange(nextMode: DatabaseImportMode) {
    setImportMode(nextMode);
    setJsonRows(defaultImportPayload(nextMode, sourceTable));
    setMessage(null);
  }

  function handleSourceChange(nextSource: ProcessRecord["source"]) {
    setSourceTable(nextSource);
    setJsonRows(defaultImportPayload(importMode, nextSource));
    setMessage(null);
  }

  async function handleImport() {
    setIsImporting(true);
    setMessage(null);
    try {
      const rows = normalizeImportPayload(jsonRows, importMode);
      const request = { sourceTable, rows };
      let result: DatabaseImportResult;
      let usedLocalFallback = false;
      if (token.trim().length > 0) {
        try {
          result = await importDatabaseRowsRemote(request, token);
        } catch {
          result = importDatabaseRows(dataset, request);
          usedLocalFallback = true;
        }
      } else {
        result = importDatabaseRows(dataset, request);
        usedLocalFallback = true;
      }
      setLastResult(result);
      onImported(result);
      setMessage(`已导入 ${result.importedRecordIds.length} 条记录到${selectedSource.shortLabel}，并自动刷新本体、图谱和检测输入。${usedLocalFallback ? "当前为页面内本地刷新；填写管理员令牌并连接 Worker 后可写入云端。" : "已写入 Worker 并返回刷新数据集。"}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="data-import-panel">
      <div>
        <div className="section-heading">
          <h3>数据库导入自动刷新</h3>
          <span>{dataset.records.length.toLocaleString("zh-CN")} 条当前记录</span>
        </div>
        <p className="principle-copy">工作原理：系统当前面对的是同一个业务数据集，里面包含 main 主表和 RIP_ROP 表两类来源表。导入时先选择“导入单行”或“导入整张表”，再选择目标来源表；系统会按目标表字段口径把原始数据标准化为 ProcessRecord，自动刷新本体、图谱、字段映射和检测输入。</p>
        <div className="import-mode-switch" role="tablist" aria-label="选择导入方式">
          <button type="button" className={importMode === "row" ? "active" : ""} onClick={() => handleModeChange("row")}>
            新增单条数据库行
          </button>
          <button type="button" className={importMode === "table" ? "active" : ""} onClick={() => handleModeChange("table")}>
            导入整张数据库表
          </button>
        </div>
        <div className="import-controls">
          <label>
            目标来源表
            <select value={sourceTable} onChange={(event) => handleSourceChange(event.target.value as ProcessRecord["source"])}>
              {databaseSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <span>{selectedSource.description}</span>
          </label>
          <label>
            管理员令牌
            <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Worker 导入需要管理员令牌" />
            <span>不填写时只进行页面内本地刷新；填写并连接 Worker 后可写入云端数据集。</span>
          </label>
        </div>
        <div className="import-guidance">
          <div>
            <strong>数据库关系</strong>
            <p>{guidance.databaseMeaning}</p>
          </div>
          <div>
            <strong>目标表选择</strong>
            <p>{guidance.tableMeaning}</p>
          </div>
          <div>
            <strong>JSON 内容要求</strong>
            <p>{guidance.payloadMeaning}</p>
          </div>
        </div>
        <label className="import-json">
          {importMode === "row" ? "单条数据库行 JSON 对象" : "整张表 JSON 数组"}
          <textarea value={jsonRows} rows={importMode === "row" ? 8 : 11} onChange={(event) => setJsonRows(event.target.value)} />
          <span>{selectedSource.expectedContent}</span>
        </label>
        <div className="action-row">
          <button type="button" className="primary-action" onClick={handleImport} disabled={isImporting}>
            {isImporting ? <Loader2 size={16} /> : <Database size={16} />}
            {isImporting ? "正在导入并刷新" : importMode === "row" ? "导入单行并自动刷新全流程" : "导入整表并自动刷新全流程"}
          </button>
          {message && <span className={message.startsWith("已导入") ? "import-ok" : "api-error"}>{message}</span>}
        </div>
      </div>
      <div className="import-steps">
        <div className="import-steps-intro">
          <strong>导入后系统自动执行</strong>
          <em>{guidance.automationMeaning}</em>
        </div>
        {(lastResult?.automationSteps ?? [
          { key: "records", title: "1. 写入记录层", detail: "等待导入新行或整张表；系统会把目标来源表中的每一行转换为统一记录。", status: "done" },
          { key: "fields", title: "2. 识别字段层", detail: "系统会识别新增字段；已知字段直接映射，未知字段先标记为“需确认”。", status: "done" },
          { key: "ontology", title: "3. 刷新本体层", detail: "SPR 过程记录实例数、字段映射和语义结构会同步更新。", status: "done" },
          { key: "graph", title: "4. 重建图谱层", detail: "图节点、关系边和层级路径会使用刷新后的本体数据重新生成。", status: "done" },
          { key: "flow", title: "5. 接入检测层", detail: "第一条新增记录会自动进入 OWL2 检测流程，便于继续运行根因与预警。", status: "done" }
        ]).map((step) => (
          <div key={step.key}>
            <CheckCircle2 size={16} />
            <span>
              <strong>{step.title}</strong>
              <em>{step.detail}</em>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function isOwl2BusinessView(view: ViewKey): view is Owl2BusinessView {
  return view === "owl2" || view === "owl2-rules" || view === "owl2-detect" || view === "owl2-root" || view === "owl2-report" || view === "owl2-knowledge";
}

function TopBar({ dataset }: { dataset: DemoDataset }) {
  return (
    <header className="topbar">
      <div>
        <span className="eyebrow">SPR 本体演示系统</span>
        <h1>本体</h1>
      </div>
      <div className="topbar-meta">
        <span>生成时间 {new Date(dataset.generatedAt).toLocaleString("zh-CN")}</span>
      </div>
    </header>
  );
}

function OverviewStrip({ dataset, activeView, onNavigate }: { dataset: DemoDataset; activeView: ViewKey; onNavigate: (view: ViewKey) => void }) {
  const faultOption = useMemo(() => ({
    tooltip: { trigger: "item" as const },
    color: ["#2447a8", "#f28c28", "#d84c5f", "#159a75"],
    series: [{ type: "pie" as const, radius: ["48%", "72%"], center: ["50%", "52%"], data: dataset.summary.distributions.fault, label: { show: false } }]
  }), [dataset]);
  const metrics = dataset.summary.metrics;
  return (
    <section className="overview-strip">
      <div className="overview-copy">
        <strong>{activeView === "linkage" ? "当前重点：双向映射与路径追踪" : activeView === "top" ? "当前重点：顶层抽象分类体系" : activeView === "owl2" ? "当前重点：OWL2 本体驱动闭环" : "当前重点：SPR 细粒度类与字段承载"}</strong>
        <span>主表 {metrics.mainRecords} 条，RIP_ROP {metrics.ripRopRecords} 条，58 个字段映射均进入显式本体结构。</span>
      </div>
      <div className="overview-metrics">
        <Metric label="顶层类" value={Object.keys(dataset.top_ontology.nodes).length} />
        <Metric label="SPR类" value={Object.keys(dataset.spr_ontology.nodes).length} />
        <Metric label="映射关系" value={dataset.top_spr_mappings.length} />
      </div>
      <div className="overview-chart">
        <Chart option={faultOption} />
      </div>
      <div className="overview-actions">
        {navItems.map((item) => (
          <button key={item.key} className={activeView === item.key ? "active" : ""} onClick={() => onNavigate(item.key)}>
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value.toLocaleString("zh-CN")}</strong>
      <span>{label}</span>
    </div>
  );
}
