import { useEffect, useMemo, useState } from "react";
import { Boxes, Database, GitBranch, Network, PanelLeftClose, PanelLeftOpen, PencilLine, Route } from "lucide-react";
import { Chart } from "../components/Chart";
import { HierarchyLinkageView } from "../features/hierarchy-linkage/HierarchyLinkageView";
import { OntologyEditorView } from "../features/ontology-editor/OntologyEditorView";
import { SprOntologyView } from "../features/spr-ontology/SprOntologyView";
import { TopOntologyView } from "../features/top-ontology/TopOntologyView";
import { buildAppShellClassName } from "./appLayoutState";
import { loadDataset } from "../lib/data";
import type { DemoDataset } from "../types/demo";

type ViewKey = "top" | "spr" | "linkage" | "editor";

const navItems: Array<{ key: ViewKey; label: string; icon: typeof Network }> = [
  { key: "top", label: "顶层工艺本体", icon: Network },
  { key: "spr", label: "SPR本体", icon: GitBranch },
  { key: "linkage", label: "层级联动", icon: Route },
  { key: "editor", label: "在线编辑", icon: PencilLine }
];

export default function App() {
  const [dataset, setDataset] = useState<DemoDataset | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("linkage");
  const [error, setError] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    loadDataset()
      .then(setDataset)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) return <div className="fatal">数据加载失败：{error}</div>;
  if (!dataset) return <div className="loading">SPR Demo 数据加载中</div>;

  return (
    <div className={buildAppShellClassName(isSidebarCollapsed)}>
      <aside className="sidebar">
        <div className="sidebar-topline">
          <div className="brand" title="SPR 本体 Demo">
            <Boxes size={30} />
            <div>
              <strong>SPR 本体 Demo</strong>
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
        {activeView === "top" && <TopOntologyView dataset={dataset} />}
        {activeView === "spr" && <SprOntologyView dataset={dataset} />}
        {activeView === "linkage" && <HierarchyLinkageView dataset={dataset} />}
        {activeView === "editor" && <OntologyEditorView dataset={dataset} />}
      </main>
    </div>
  );
}

function TopBar({ dataset }: { dataset: DemoDataset }) {
  return (
    <header className="topbar">
      <div>
        <span className="eyebrow">SPR Ontology Demo</span>
        <h1>顶层工艺本体如何承载 SPR 在线过程数据</h1>
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
        <strong>{activeView === "linkage" ? "当前重点：双向映射与路径追踪" : activeView === "top" ? "当前重点：顶层抽象分类体系" : "当前重点：SPR 细粒度类与字段承载"}</strong>
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
