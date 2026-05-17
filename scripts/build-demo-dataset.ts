import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { parseCurve, summarizeCurve } from "./shared/reasoning";
import type {
  DemoDataset,
  FieldMapping,
  GraphEdge,
  GraphNode,
  HierarchyPath,
  ProcessRecord,
  SprOntologyNode,
  SprOntologyRelation,
  TopOntologyNode,
  TopSprMapping
} from "./shared/types";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROCESSED_DIR = path.join(ROOT, "data", "processed");
const PUBLIC_DATA_DIR = path.join(ROOT, "frontend", "public", "data");
const CURVES_DIR = path.join(PUBLIC_DATA_DIR, "curves");

await fs.mkdir(PROCESSED_DIR, { recursive: true });
await fs.mkdir(CURVES_DIR, { recursive: true });

const mainRows = readSheet(path.join(ROOT, "pmc_body_shop_prod-d7lcbg96ulq0qrl37o2g.xlsx"));
const ripRows = readSheet(path.join(ROOT, "spr data2(1).xlsx"));

const mainRecords = mainRows.map((row, index) => normalizeMain(row, index));
const ripRecords = ripRows.map((row, index) => normalizeRipRop(row, index));
const records = [...mainRecords, ...ripRecords];
const curvesById: Record<string, Pick<ProcessRecord, "curves" | "curveSummary">> = {};

for (const record of records) {
  if (record.curves && Object.keys(record.curves).length > 0) {
    curvesById[record.id] = {
      curves: record.curves,
      curveSummary: record.curveSummary
    };
    await writeJson(path.join(CURVES_DIR, `${record.id}.json`), {
      id: record.id,
      curves: record.curves,
      curveSummary: record.curveSummary
    });
    delete record.curves;
  }
}

const topOntology = buildTopOntology();
const fieldMappings = buildFieldMappings();
const sprOntology = buildSprOntology(records, fieldMappings);
const topSprMappings = buildTopSprMappings();
const hierarchyPaths = buildHierarchyPaths(topOntology.nodes, sprOntology.nodes, topSprMappings);

const dataset: DemoDataset = {
  generatedAt: new Date().toISOString(),
  summary: buildSummary(mainRecords, ripRecords),
  top_ontology: topOntology,
  spr_ontology: sprOntology,
  top_spr_mappings: topSprMappings,
  hierarchy_paths: hierarchyPaths,
  ontology: buildOntology(topOntology.nodes, sprOntology.nodes, sprOntology.relations, topSprMappings),
  fieldMappings,
  records,
  demoScripts: buildDemoScripts()
};

await writeJson(path.join(PROCESSED_DIR, "demo-dataset.json"), dataset);
await writeJson(path.join(PUBLIC_DATA_DIR, "demo-dataset.json"), dataset);
await writeJson(path.join(PROCESSED_DIR, "summary.json"), dataset.summary);
await writeJson(path.join(PROCESSED_DIR, "ontology.graph.json"), dataset.ontology);
await writeJson(path.join(PROCESSED_DIR, "top-ontology.json"), dataset.top_ontology);
await writeJson(path.join(PROCESSED_DIR, "spr-ontology.json"), dataset.spr_ontology);
await writeJson(path.join(PROCESSED_DIR, "top-spr-mappings.json"), dataset.top_spr_mappings);
await writeJson(path.join(PROCESSED_DIR, "hierarchy-paths.json"), dataset.hierarchy_paths);
await writeJson(path.join(PROCESSED_DIR, "field-mapping.json"), dataset.fieldMappings);
await writeJson(path.join(PROCESSED_DIR, "instances.main.json"), mainRecords);
await writeJson(path.join(PROCESSED_DIR, "instances.riprop.json"), ripRecords);
await writeJson(path.join(PROCESSED_DIR, "curves.all.json"), curvesById);

console.log(`Generated ${records.length} process records and ${dataset.fieldMappings.length} field mappings.`);

function readSheet(filePath: string): Record<string, unknown>[] {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
}

function normalizeMain(row: Record<string, unknown>, index: number): ProcessRecord {
  const original = parseCurve(row.original_data);
  const calculated = parseCurve(row.calculate_data);
  const id = stringValue(row.id) || `main-${index + 1}`;
  return {
    id: `main-${id}`,
    source: "main",
    lineName: stringValue(row.line_name),
    deviceName: stringValue(row.device_name),
    program: stringValue(row.prog_no),
    rivetId: stringValue(row.rivet_id),
    carBodyId: stringValue(row.carbody_id),
    timestamp: stringValue(row.origin_time) || stringValue(row.consumer_time),
    predictionCategory: stringValue(row.pre),
    errorRate: numberOrString(row.error_rate),
    raw: sanitizeRow(row),
    curveSummary: {
      original: summarizeCurve(original),
      calculated: summarizeCurve(calculated)
    },
    curves: {
      original,
      calculated
    }
  };
}

function normalizeRipRop(row: Record<string, unknown>, index: number): ProcessRecord {
  const riveting = parseCurve(row["铆接曲线"]);
  const envelope = parseCurve(row["包络线"]);
  const id = stringValue(row["实物编号"]) || `riprop-${index + 1}`;
  return {
    id: `riprop-${id}`,
    source: "rip_rop",
    lineName: "RIP_ROP",
    deviceName: stringValue(row.Devicename),
    program: stringValue(row["程序"]),
    rivetId: stringValue(row["铆钉计数器"]),
    carBodyId: stringValue(row["车身标识"]),
    timestamp: stringValue(row["日期/时间"]),
    faultCode: stringValue(row["故障代码"]),
    raw: sanitizeRow(row),
    curveSummary: {
      riveting: summarizeCurve(riveting),
      envelope: summarizeCurve(envelope)
    },
    curves: {
      riveting,
      envelope
    }
  };
}

function buildSummary(main: ProcessRecord[], rip: ProcessRecord[]): DemoDataset["summary"] {
  return {
    metrics: {
      mainRecords: main.length,
      ripRopRecords: rip.length,
      mainFields: 16,
      ripRopFields: 42,
      extensionClasses: 12,
      addedRelations: 15
    },
    distributions: {
      line: topCounts(main.map((record) => record.lineName)),
      device: topCounts(main.map((record) => record.deviceName), 8),
      prediction: topCounts(main.map((record) => record.predictionCategory)),
      errorRate: topCounts(main.map((record) => String(record.errorRate ?? ""))),
      fault: topCounts(rip.map((record) => normalizeFault(record.faultCode))),
      source: [
        { name: "主数据库", value: main.length },
        { name: "RIP_ROP", value: rip.length }
      ]
    },
    conclusions: [
      "原 SPR 主链路保持稳定，新增在线过程记录层承接真实数据库。",
      "主数据库 16 字段与 RIP_ROP 42 字段均进入字段映射视图。",
      "曲线、包络线、公差、预测结果和控制诊断对象化，支撑质量追溯与规则解释。"
    ]
  };
}

function buildTopOntology(): DemoDataset["top_ontology"] {
  const sourceTop = "顶层工艺本体建设方案_v0.2.md";
  const sourceSuggestion = "顶层工艺本体补充建议.md";
  const rows: Array<Omit<TopOntologyNode, "children">> = [
    top("domain-foundation", "基础元层", "基础元层", null, "承载实体、事件、可追溯对象等跨工艺稳定抽象。", sourceTop),
    top("traceable-object", "可追溯对象类", "基础元层", "domain-foundation", "可被记录、追踪和关联到工艺过程的对象。", sourceTop),
    top("online-process-record", "在线过程记录类", "基础元层", "traceable-object", "从真实在线数据库抽象出的过程记录承载类，用于连接对象、参数、曲线和质量结果。", sourceSuggestion, "candidate"),
    top("process-data", "过程数据类", "基础元层", "traceable-object", "过程执行中产生的数据对象父类。", sourceSuggestion, "candidate"),
    top("curve-data-top", "曲线数据类", "基础元层", "process-data", "将长序列曲线作为可引用、可解释的数据对象。", sourceSuggestion, "candidate"),

    top("domain-organization", "组织与职责域", "组织与职责域", null, "表达工厂、产线、工位、职责边界等组织化对象。", sourceTop),
    top("line-top", "产线类", "组织与职责域", "domain-organization", "工艺对象发生的产线或生产区域。", sourceTop),
    top("station-top", "工位类", "组织与职责域", "domain-organization", "产线内执行具体工艺任务的工位。", sourceTop),

    top("domain-product", "产品与结构域", "产品与结构域", null, "表达产品、零件、结构特征和连接特征。", sourceTop),
    top("part-top", "零件类", "产品与结构域", "domain-product", "参与工艺过程的产品零部件。", sourceTop),
    top("connection-feature", "连接特征类", "产品与结构域", "domain-product", "结构连接位置、连接点或连接特征的上位概念。", sourceTop),

    top("domain-material", "物料域", "物料域", null, "表达材料、基材、连接件等物料对象。", sourceTop),
    top("substrate-top", "基材类", "物料域", "domain-material", "被连接或被加工的材料对象。", sourceTop),
    top("connector-top", "连接件类", "物料域", "domain-material", "铆钉、螺栓等实现连接的对象。", sourceTop),

    top("domain-resource", "资源与设备域", "资源与设备域", null, "表达设备、工装夹具、资源能力和执行单元。", sourceTop),
    top("equipment-top", "设备类", "资源与设备域", "domain-resource", "执行工艺过程的设备对象。", sourceTop),
    top("tooling-top", "工装夹具类", "资源与设备域", "domain-resource", "支撑工艺执行的夹具、模具或工具对象。", sourceTop),

    top("domain-process", "工艺域", "工艺域", null, "表达程序、参数、工艺窗口和工艺过程结构。", sourceTop),
    top("program-top", "程序类", "工艺域", "domain-process", "设备执行的工艺程序或程序号。", sourceTop),
    top("parameter-set-top", "参数集类", "工艺域", "domain-process", "工艺参数集合，用于承载力、行程、阈值等参数。", sourceTop),
    top("process-window-top", "工艺窗口类", "工艺域", "domain-process", "过程约束、参考曲线、公差窗口等判定边界。", sourceTop),
    top("envelope-top", "包络线类", "工艺域", "process-window-top", "用于曲线越界判断的参考边界对象。", sourceSuggestion, "candidate"),

    top("domain-quality", "质量域", "质量域", null, "表达检测计划、检测结果、缺陷模式和质量判定。", sourceTop),
    top("inspection-plan-top", "检测计划类", "质量域", "domain-quality", "定义检测项目、检测方法和检测要求。", sourceTop),
    top("inspection-result-top", "检测结果类", "质量域", "domain-quality", "记录检测或质量判定输出。", sourceTop),
    top("defect-mode-top", "缺陷模式类", "质量域", "domain-quality", "表达可识别的缺陷类型。", sourceTop),
    top("root-cause-top", "根因类", "质量域", "domain-quality", "解释缺陷或异常的原因对象。", sourceTop),
    top("model-prediction-top", "模型预测结果类", "质量域", "inspection-result-top", "算法或模型输出的预测类别和辅助判断。", sourceSuggestion, "candidate"),

    top("domain-knowledge", "知识与规则域", "知识与规则域", null, "表达规则、知识项和可解释推理依据。", sourceTop),
    top("rule-top", "规则类", "知识与规则域", "domain-knowledge", "描述可触发的质量判定、诊断或控制规则。", sourceTop),

    top("domain-event", "事件与变更域", "事件与变更域", null, "表达工艺事件、数据事件和工艺变更。", sourceTop),
    top("process-change-top", "工艺变更类", "事件与变更域", "domain-event", "记录工艺方案、参数或对象关系的变更。", sourceTop),

    top("domain-action", "能力与Action域", "能力与 Action 域", null, "表达面向自动化或 Copilot 的可执行能力。", sourceTop),
    top("action-top", "Action类", "能力与 Action 域", "domain-action", "封装查询、诊断、更新、解释等可调用能力。", sourceTop)
  ];

  const nodes = Object.fromEntries(rows.map((item) => [item.id, { ...item, children: [] as string[] }]));
  for (const node of Object.values(nodes)) {
    if (node.parent_id) nodes[node.parent_id]?.children.push(node.id);
  }
  return {
    root_ids: Object.values(nodes).filter((node) => node.parent_id === null).map((node) => node.id),
    nodes
  };
}

function buildSprOntology(records: ProcessRecord[], fieldMappings: FieldMapping[]): DemoDataset["spr_ontology"] {
  const countByClass = {
    "SPR过程记录类": records.length,
    "设备类": unique(records.map((record) => record.deviceName)).length,
    "程序类": unique(records.map((record) => record.program)).length,
    "SPR连接点类": unique(records.map((record) => record.rivetId)).length,
    "产线类": unique(records.map((record) => record.lineName)).length
  };

  const nodes = Object.fromEntries(
    [
      spr("line", "产线类", "spr-core", "line-top", "SPR 主链路核心类，承载 line_name。", ["line_name"], countByClass["产线类"]),
      spr("station", "工位类", "spr-core", "station-top", "保持原定义，后续可由设备编码拆分实例。"),
      spr("device", "设备类", "spr-core", "equipment-top", "承载 device_name / Devicename。", ["device_name", "Devicename"], countByClass["设备类"]),
      spr("program", "程序类", "spr-core", "program-top", "承载 prog_no / 程序。", ["prog_no", "程序"], countByClass["程序类"]),
      spr("part", "零件类", "spr-core", "part-top", "SPR 工艺涉及的被连接零件对象。"),
      spr("material", "材料类", "spr-core", "substrate-top", "承载钢板厚度等材料属性。", ["钢板厚度"]),
      spr("joint", "SPR连接点类", "spr-core", "connection-feature", "承载 rivet_id 与铆钉计数器，是 SPR 连接特征实例化类。", ["rivet_id", "铆钉计数器"], countByClass["SPR连接点类"]),
      spr("rivet", "SPR铆钉类", "spr-core", "connector-top", "SPR 专用连接件，承载铆钉长度等属性。", ["铆钉长度"]),
      spr("die", "铆模类", "spr-core", "tooling-top", "SPR 工装夹具类对象。"),
      spr("parameter", "工艺参数类", "spr-core", "parameter-set-top", "承载最大力、冲压行程、末端力等实测参数。", ["铆接线最大力", "铆接线冲压行程", "Actual end force"]),
      spr("inspection-plan", "检测计划类", "spr-core", "inspection-plan-top", "保持原 SPR 检测计划类，用于描述检测要求。"),
      spr("quality", "质量结果类", "spr-core", "inspection-result-top", "承载 error_rate、pre、故障代码与输出编码。", ["error_rate", "pre", "故障代码", "输出"]),
      spr("defect", "缺陷类", "spr-core", "defect-mode-top", "承载冲压行程过大、曲线高于/低于包络线等缺陷模式。", ["故障代码"]),
      spr("root-cause", "根因类", "spr-core", "root-cause-top", "关联缺陷解释和异常诊断的根因对象。"),
      spr("process-change", "工艺变更类", "spr-core", "process-change-top", "保持原 SPR 工艺变更表达。"),
      spr("record", "SPR过程记录类", "spr-extension", "online-process-record", "每条数据库记录的统一承载入口。", ["id", "biz_id", "origin_time", "consumer_time"], countByClass["SPR过程记录类"], "candidate-subclass-of"),
      spr("curve-data", "SPR曲线数据类", "spr-extension", "curve-data-top", "过程记录关联的曲线数据集合。", ["original_data", "calculate_data", "铆接曲线", "包络线"], undefined, "candidate-subclass-of"),
      spr("original-curve", "原始曲线类", "spr-data", "curve-data-top", "未经处理或缩放前曲线。", ["original_data", "最大力铆接曲线（原始数据）"], undefined, "candidate-subclass-of"),
      spr("calculated-curve", "计算后曲线类", "spr-data", "curve-data-top", "处理后或保留精度后的曲线。", ["calculate_data"], undefined, "candidate-subclass-of"),
      spr("riveting-curve", "铆接曲线类", "spr-data", "curve-data-top", "设备导出的实际铆接曲线。", ["铆接曲线"], undefined, "candidate-subclass-of"),
      spr("envelope", "包络线类", "spr-extension", "envelope-top", "用于判断铆接曲线是否越界的参考曲线。", ["包络线", "包络线最大力"], undefined, "candidate-subclass-of"),
      spr("curve-feature", "曲线特征类", "spr-data", "process-data", "曲线最大力、刻度、峰值等摘要特征。", ["铆接曲线最大力", "最大力刻度铆接曲线"], undefined, "candidate-subclass-of"),
      spr("envelope-tolerance", "包络线公差类", "spr-extension", "process-window-top", "包络线警告与故障阈值。", ["包络线公差警告", "包络线公差故障"], undefined, "candidate-subclass-of"),
      spr("rrc", "RRC参数类", "spr-extension", "parameter-set-top", "RRC 启用状态与偏差指标，含义保守展示。", ["RRC启用", "RRC 铆接曲线偏差"], undefined, "candidate-subclass-of"),
      spr("pecv2", "PECV2状态类", "spr-extension", "process-data", "PECV2 激活状态，含义保守展示。", ["PECV2 activated"], undefined, "candidate-subclass-of"),
      spr("end-force", "末端力公差类", "spr-extension", "process-window-top", "末端力上下限与实际末端力。", ["End force tolerance min.", "End force tolerance max.", "Actual end force"], undefined, "candidate-subclass-of"),
      spr("prediction", "模型预测结果类", "spr-extension", "model-prediction-top", "模型或算法输出的预测类别、误差率。", ["pre", "error_rate"], undefined, "candidate-subclass-of"),
      spr("rule-high", "Rule-Curve-High", "spr-rule", "rule-top", "铆接曲线高于包络线时触发缺陷解释。"),
      spr("rule-low", "Rule-Curve-Low", "spr-rule", "rule-top", "铆接曲线低于包络线时触发缺陷解释。"),
      spr("rule-stroke", "Rule-Press-Stroke-High", "spr-rule", "rule-top", "冲压行程过大时触发缺陷解释。")
    ].map((item) => [item.id, item])
  );

  const relations: SprOntologyRelation[] = [
    relation("line-station", "line", "station", "hasStation", "objectProperty"),
    relation("station-device", "station", "device", "hasEquipment", "objectProperty"),
    relation("device-program", "device", "program", "runsProgram", "objectProperty"),
    relation("program-joint", "program", "joint", "hasJoint", "objectProperty"),
    relation("joint-parameter", "joint", "parameter", "hasParameter", "objectProperty"),
    relation("parameter-quality", "parameter", "quality", "hasQualityResult", "objectProperty"),
    relation("quality-defect", "quality", "defect", "hasDefect", "objectProperty"),
    relation("defect-root-cause", "defect", "root-cause", "hasRootCause", "objectProperty"),
    relation("record-line", "record", "line", "recordedAtLine", "objectProperty"),
    relation("record-device", "record", "device", "recordedByDevice", "objectProperty"),
    relation("record-program", "record", "program", "recordedWithProgram", "objectProperty"),
    relation("record-joint", "record", "joint", "recordsJoint", "objectProperty"),
    relation("record-parameter", "record", "parameter", "hasOnlineParameter", "objectProperty"),
    relation("record-curve", "record", "curve-data", "hasCurveData", "objectProperty"),
    relation("record-prediction", "record", "prediction", "hasPredictionResult", "objectProperty"),
    relation("record-rrc", "record", "rrc", "hasRRCParameter", "objectProperty"),
    relation("record-pecv2", "record", "pecv2", "hasPECV2State", "objectProperty"),
    relation("curve-original", "curve-data", "original-curve", "hasOriginalCurve", "objectProperty"),
    relation("curve-calculated", "curve-data", "calculated-curve", "hasCalculatedCurve", "objectProperty"),
    relation("curve-riveting", "curve-data", "riveting-curve", "hasRivetingCurve", "objectProperty"),
    relation("curve-envelope", "curve-data", "envelope", "hasEnvelopeCurve", "objectProperty"),
    relation("envelope-tolerance-edge", "envelope", "envelope-tolerance", "hasToleranceLimit", "objectProperty"),
    relation("quality-envelope", "quality", "envelope", "evaluatedByEnvelope", "objectProperty"),
    relation("rule-high-edge", "rule-high", "defect", "infers", "derivedFrom"),
    relation("rule-low-edge", "rule-low", "defect", "infers", "derivedFrom"),
    relation("rule-stroke-edge", "rule-stroke", "defect", "infers", "derivedFrom")
  ];

  for (const node of Object.values(nodes)) {
    node.relations = relations.filter((item) => item.source === node.id || item.target === node.id).map((item) => item.id);
  }

  applyMappedProperties(nodes, fieldMappings);

  return { nodes, relations };
}

function buildTopSprMappings(): TopSprMapping[] {
  const section = "SPR本体更新最终交付文档.md / 顶层继承关系与数据库字段映射";
  return [
    mapping("line-top", "line", "subclass-of", "产线类 → 产线类", section),
    mapping("station-top", "station", "subclass-of", "工位类 → 工位类", section),
    mapping("equipment-top", "device", "subclass-of", "设备类 → 设备类", section),
    mapping("program-top", "program", "subclass-of", "程序类 → 程序类", section),
    mapping("part-top", "part", "subclass-of", "零件类 → 零件类", section),
    mapping("substrate-top", "material", "subclass-of", "材料类 → 基材类", section),
    mapping("connection-feature", "joint", "subclass-of", "SPR连接点类 → 连接特征类", section),
    mapping("connector-top", "rivet", "subclass-of", "SPR铆钉类 → 连接件类", section),
    mapping("tooling-top", "die", "subclass-of", "铆模类 → 工装夹具类", section),
    mapping("parameter-set-top", "parameter", "subclass-of", "工艺参数类 → 参数集类", section),
    mapping("inspection-plan-top", "inspection-plan", "subclass-of", "检测计划类 → 检测计划类", section),
    mapping("inspection-result-top", "quality", "subclass-of", "质量结果类 → 检测结果类", section),
    mapping("defect-mode-top", "defect", "subclass-of", "缺陷类 → 缺陷模式类", section),
    mapping("root-cause-top", "root-cause", "subclass-of", "根因类 → 根因类", section),
    mapping("process-change-top", "process-change", "subclass-of", "工艺变更类 → 工艺变更类", section),
    mapping("online-process-record", "record", "candidate-extension", "SPR过程记录类用于承接每条数据库在线过程记录；补充建议将其抽象为顶层候选类。", "顶层工艺本体补充建议.md / SPR 数据库新增承载层"),
    mapping("traceable-object", "record", "belongs-to", "保守建模时，SPR过程记录类仍可作为可追溯对象类下的具体承载对象。", "SPR本体更新最终交付文档.md / 保守建模策略"),
    mapping("curve-data-top", "curve-data", "candidate-extension", "SPR曲线数据类承载 original_data、calculate_data、铆接曲线、包络线。", "顶层工艺本体补充建议.md / 过程数据类与曲线数据类"),
    mapping("curve-data-top", "original-curve", "candidate-extension", "原始曲线类是曲线数据类下位对象。", "顶层工艺本体补充建议.md / 曲线数据对象化"),
    mapping("curve-data-top", "calculated-curve", "candidate-extension", "计算后曲线类是曲线数据类下位对象。", "顶层工艺本体补充建议.md / 曲线数据对象化"),
    mapping("curve-data-top", "riveting-curve", "candidate-extension", "铆接曲线类是曲线数据类下位对象。", "顶层工艺本体补充建议.md / 曲线数据对象化"),
    mapping("envelope-top", "envelope", "candidate-extension", "包络线类作为工艺窗口/参考曲线候选扩展，用于曲线越界判定。", "顶层工艺本体补充建议.md / 工艺窗口与包络线"),
    mapping("process-window-top", "envelope-tolerance", "candidate-extension", "包络线公差类表达警告阈值与故障阈值。", "顶层工艺本体补充建议.md / 公差表达扩展"),
    mapping("parameter-set-top", "rrc", "candidate-extension", "RRC 参数保守归入参数集类。", "SPR本体更新最终交付文档.md / 待确认字段保守建模"),
    mapping("process-data", "pecv2", "candidate-extension", "PECV2 状态作为过程数据保守展示。", "SPR本体更新最终交付文档.md / 待确认字段保守建模"),
    mapping("process-window-top", "end-force", "candidate-extension", "末端力上下限归入工艺窗口/公差表达。", "SPR本体更新最终交付文档.md / RIP_ROP 字段映射"),
    mapping("model-prediction-top", "prediction", "candidate-extension", "pre 与 error_rate 作为模型预测结果保守展示。", "顶层工艺本体补充建议.md / 模型预测结果类"),
    mapping("rule-top", "rule-high", "belongs-to", "曲线高于包络线规则用于缺陷解释。", "SPR本体更新最终交付文档.md / 规则解释"),
    mapping("rule-top", "rule-low", "belongs-to", "曲线低于包络线规则用于缺陷解释。", "SPR本体更新最终交付文档.md / 规则解释"),
    mapping("rule-top", "rule-stroke", "belongs-to", "冲压行程过大规则用于缺陷解释。", "SPR本体更新最终交付文档.md / 规则解释")
  ];
}

function buildHierarchyPaths(topNodes: Record<string, TopOntologyNode>, sprNodes: Record<string, SprOntologyNode>, mappings: TopSprMapping[]): HierarchyPath[] {
  return mappings.map((item) => ({
    id: `path-${item.id}`,
    top_path: ancestorPath(item.top_id, topNodes),
    spr_path: sprNodes[item.spr_id]?.relations.length ? [item.spr_id, ...sprNodes[item.spr_id].relations.slice(0, 4)] : [item.spr_id],
    mapping_id: item.id
  }));
}

function buildOntology(topNodes: Record<string, TopOntologyNode>, sprNodes: Record<string, SprOntologyNode>, relations: SprOntologyRelation[], mappings: TopSprMapping[]): DemoDataset["ontology"] {
  const nodes: GraphNode[] = [
    ...Object.values(topNodes).map((item) => node(item.id, item.name, "class", "top", item.definition, undefined, countMappedSpr(item.id, mappings))),
    ...Object.values(sprNodes).map((item) => node(item.id, item.name, item.layer === "spr-rule" ? "rule" : "class", item.layer === "spr-core" ? "spr-core" : item.layer === "spr-rule" ? "reasoning" : "spr-extension", item.definition, item.source_fields, item.instanceCount))
  ];

  const topEdges = Object.values(topNodes)
    .filter((item) => item.parent_id)
    .map((item) => edge(`top-${item.parent_id}-${item.id}`, item.parent_id as string, item.id, "subclass-of", "inherits"));
  const sprEdges = relations.map((item) => edge(item.id, item.source, item.target, item.label, item.type === "subclass-of" ? "inherits" : item.type));
  const mappingEdges = mappings
    .filter((item) => !isRedundantDisplayMapping(item, topNodes, sprNodes))
    .map((item) => edge(`mapping-${item.id}`, item.top_id, item.spr_id, item.relation, "inherits"));

  return { nodes, edges: [...topEdges, ...sprEdges, ...mappingEdges] };
}

function isRedundantDisplayMapping(item: TopSprMapping, topNodes: Record<string, TopOntologyNode>, sprNodes: Record<string, SprOntologyNode>): boolean {
  const topNode = topNodes[item.top_id];
  const sprNode = sprNodes[item.spr_id];
  return Boolean(topNode && sprNode && topNode.name === sprNode.name && item.relation === "subclass-of");
}

function buildFieldMappings(): FieldMapping[] {
  const main: FieldMapping[] = [
    map("main", "id", "SPR过程记录类", "recordId", "需新增扩展类", "数据库行唯一记录 ID。"),
    map("main", "biz_id", "SPR过程记录类", "businessId", "需新增扩展类", "业务记录 ID。"),
    map("main", "prog_no", "程序类", "programNumber", "需补属性", "程序编号。"),
    map("main", "rivet_id", "SPR连接点类", "rivetPointId", "需补属性", "铆点或连接点编号。"),
    map("main", "carbody_id", "SPR过程记录类", "carBodyId", "需确认", "暂作为过程属性，待确认是否新增车身对象。"),
    map("main", "line_name", "产线类", "lineName", "已有类可承载", "产线或区域名称。"),
    map("main", "device_name", "设备类", "deviceName", "已有类可承载", "设备名称。"),
    map("main", "original_data", "原始曲线类", "originalCurveData", "需新增扩展类", "原始曲线序列。"),
    map("main", "calculate_data", "计算后曲线类", "calculatedCurveData", "需新增扩展类", "计算后曲线序列。"),
    map("main", "error_rate", "模型预测结果类", "errorRate", "需确认", "保留原值，不直接强语义化。"),
    map("main", "pre", "模型预测结果类", "predictionCategory", "需确认", "预测类别编码，含义待确认。"),
    map("main", "consumer_time", "SPR过程记录类", "consumerTime", "需新增扩展类", "消费或处理时间。"),
    map("main", "origin_time", "SPR过程记录类", "originTime", "需新增扩展类", "原始采集时间。"),
    map("main", "is_deleted", "SPR过程记录类", "isDeleted", "需新增扩展类", "逻辑删除标记。"),
    map("main", "create_time", "SPR过程记录类", "createTime", "需新增扩展类", "系统创建时间。"),
    map("main", "update_time", "SPR过程记录类", "updateTime", "需新增扩展类", "系统更新时间。")
  ];

  const ripFields = [
    ["实物编号", "SPR过程记录类", "recordId", "需新增扩展类", "RIP_ROP 记录编号。"],
    ["Devicename", "设备类", "deviceName", "已有类可承载", "设备字段，目前样例为脱敏占位。"],
    ["车身标识", "SPR过程记录类", "carBodyId", "需确认", "暂作为过程属性。"],
    ["日期/时间", "SPR过程记录类", "originTime", "需新增扩展类", "过程采集时间。"],
    ["输出", "质量结果类", "outputCode", "需确认", "输出编码含义待确认。"],
    ["程序", "程序类", "programName", "已有类可承载", "程序名称。"],
    ["流程类型", "SPR过程记录类", "processType", "需新增扩展类", "冲铆等流程类型。"],
    ["铆钉计数器", "SPR连接点类", "rivetCounter", "需确认", "不直接等同 rivet_id。"],
    ["铆接线最大力", "工艺参数类", "maxRivetingForce", "需补属性", "在线实测最大力。"],
    ["包络线最大力", "包络线类", "maxEnvelopeForce", "需新增扩展类", "包络线最大力。"],
    ["铆接线冲压行程", "工艺参数类", "pressStroke", "需补属性", "在线冲压行程。"],
    ["包络线冲压行程", "包络线类", "envelopePressStroke", "需新增扩展类", "包络线行程参考。"],
    ["钢板厚度", "材料类", "sheetThickness", "需补属性", "材料厚度。"],
    ["铆钉长度", "SPR铆钉类", "rivetLength", "需补属性", "铆钉长度。"],
    ["JIC dVal", "工艺参数类", "jicDVal", "需确认", "业务含义待确认。"],
    ["故障代码", "质量结果类", "faultCode", "需补属性", "原始故障文案。"],
    ["铆接曲线存在", "SPR曲线数据类", "hasRivetingCurveFlag", "需新增扩展类", "曲线存在标记。"],
    ["铆接曲线", "铆接曲线类", "rivetingCurveData", "需新增扩展类", "实际铆接曲线。"],
    ["铆接曲线最大力", "曲线特征类", "maxRivetingCurveForce", "需新增扩展类", "曲线最大力特征。"],
    ["最大力铆接曲线（原始数据）", "原始曲线类", "rawMaxForceCurve", "需新增扩展类", "原始最大力曲线。"],
    ["最大力刻度铆接曲线", "曲线特征类", "rivetingForceScale", "需新增扩展类", "力刻度。"],
    ["铆接曲线Y刻度", "曲线特征类", "rivetingYAxisScale", "需新增扩展类", "Y 轴刻度。"],
    ["包络线存在", "包络线类", "hasEnvelopeFlag", "需新增扩展类", "包络线存在标记。"],
    ["包络线", "包络线类", "envelopeCurveData", "需新增扩展类", "判定参考曲线。"],
    ["包络线分辨率", "包络线类", "envelopeResolution", "需新增扩展类", "包络线分辨率。"],
    ["最大力包络线（原始数据）", "包络线类", "rawMaxEnvelopeForce", "需新增扩展类", "原始包络线最大力。"],
    ["包络线Y刻度", "曲线特征类", "envelopeYAxisScale", "需新增扩展类", "包络线 Y 刻度。"],
    ["冲压行程包络线", "包络线类", "envelopePressStrokeCurve", "需新增扩展类", "冲压行程参考曲线。"],
    ["最小冲压行程公差包络线", "包络线公差类", "minPressStrokeTolerance", "需新增扩展类", "行程最小公差。"],
    ["最大冲压行程公差包络线", "包络线公差类", "maxPressStrokeTolerance", "需新增扩展类", "行程最大公差。"],
    ["包络线公差警告", "包络线公差类", "envelopeToleranceWarning", "需新增扩展类", "预警阈值。"],
    ["包络线公差故障", "包络线公差类", "envelopeToleranceFault", "需新增扩展类", "故障阈值。"],
    ["最大力刻度包络线", "曲线特征类", "envelopeForceScale", "需新增扩展类", "包络线力刻度。"],
    ["RRC启用", "RRC参数类", "rrcEnabled", "需确认", "RRC 业务含义待确认。"],
    ["RRC 铆接曲线偏差", "RRC参数类", "rrcRivetingCurveDeviation", "需确认", "RRC 偏差指标。"],
    ["RRC基准曲线偏差", "RRC参数类", "rrcReferenceCurveDeviation", "需确认", "RRC 基准偏差。"],
    ["PECV2 activated", "PECV2状态类", "pecv2Activated", "需确认", "PECV2 功能含义待确认。"],
    ["Rivet head height positive limit", "质量特性类", "rivetHeadHeightPositiveLimit", "需确认", "当前样例多为 0。"],
    ["Rivet head height negative limit", "质量特性类", "rivetHeadHeightNegativeLimit", "需确认", "当前样例多为 0。"],
    ["End force tolerance min.", "末端力公差类", "endForceToleranceMin", "需新增扩展类", "末端力下限。"],
    ["End force tolerance max.", "末端力公差类", "endForceToleranceMax", "需新增扩展类", "末端力上限。"],
    ["Actual end force", "工艺参数类", "actualEndForce", "需确认", "当前样例多为 0。"]
  ] as const;

  return [...main, ...ripFields.map((item) => map("rip_rop", item[0], item[1], item[2], item[3], item[4]))];
}

function buildDemoScripts(): DemoDataset["demoScripts"] {
  return {
    "3min": [
      { title: "打开总览", page: "首页总览", talkingPoint: "先用记录数、字段数和新增类关系说明项目已经从文档进入工程化数据层。" },
      { title: "展示主链路", page: "本体结构", talkingPoint: "强调原 SPR 主链路不重构，新增过程记录层负责接入真实数据库。" },
      { title: "看异常曲线", page: "曲线与包络线", talkingPoint: "用一条异常记录展示铆接曲线和包络线的关系。" },
      { title: "解释推理", page: "规则解释", talkingPoint: "展示系统如何给出故障规则、证据字段和本体追溯路径。" }
    ],
    "5min": [
      { title: "项目指标", page: "首页总览", talkingPoint: "主表 666 条、RIP_ROP 177 条、字段全部进入映射视图。" },
      { title: "三层本体", page: "本体结构", talkingPoint: "从顶层父类、SPR 主链路、新增扩展层三层解释设计。" },
      { title: "字段映射", page: "字段映射", talkingPoint: "说明每个字段归属到已有类、补属性、扩展类或待确认项。" },
      { title: "实例路径", page: "数据实例", talkingPoint: "选中一条记录，展示它如何实例化为过程记录并关联设备、程序、铆点。" },
      { title: "曲线判定", page: "曲线与包络线", talkingPoint: "把长序列字段对象化，支撑后续质量判定和模型输入。" },
      { title: "规则解释", page: "规则解释", talkingPoint: "用轻量规则模拟本体推理，输出证据和三元组。" }
    ],
    "10min": [
      { title: "背景痛点", page: "首页总览", talkingPoint: "原始字段分散，缺少统一工艺语义。" },
      { title: "原 SPR 骨架", page: "本体结构", talkingPoint: "连接点、工位、设备、程序、参数、质量结果等主链路保持稳定。" },
      { title: "顶层继承", page: "本体结构", talkingPoint: "SPR 是顶层工艺本体下的工艺扩展层。" },
      { title: "新增类", page: "本体结构", talkingPoint: "重点说明过程记录、曲线数据、包络线、公差、预测结果。" },
      { title: "字段覆盖", page: "字段映射", talkingPoint: "16 + 42 字段全部有工程映射位置。" },
      { title: "实例筛选", page: "数据实例", talkingPoint: "按产线、设备、程序、故障筛选真实记录。" },
      { title: "曲线对象化", page: "曲线与包络线", talkingPoint: "展示曲线峰值、点数、包络线和故障文案。" },
      { title: "异常推理", page: "规则解释", talkingPoint: "触发曲线高于/低于包络线或冲压行程过大规则。" },
      { title: "待确认项", page: "字段映射", talkingPoint: "pre、error_rate、RRC、PECV2 保守建模，体现科研严谨性。" },
      { title: "后续扩展", page: "演示脚本", talkingPoint: "后续可导出 RDF/OWL，接入图数据库或工艺 Copilot。" }
    ]
  };
}

function top(
  id: string,
  name: string,
  domain: string,
  parent_id: string | null,
  definition: string,
  source_doc: TopOntologyNode["source_doc"],
  status: TopOntologyNode["status"] = "stable"
): Omit<TopOntologyNode, "children"> {
  return {
    id,
    name,
    domain,
    parent_id,
    definition,
    properties: [
      { name: "definition", description: definition },
      { name: "domain", description: domain }
    ],
    source_doc,
    status
  };
}

function spr(
  id: string,
  name: string,
  layer: SprOntologyNode["layer"],
  parent_top_id: string,
  definition: string,
  source_fields: string[] = [],
  instanceCount?: number,
  inheritance_relation: SprOntologyNode["inheritance_relation"] = "subclass-of"
): SprOntologyNode {
  return {
    id,
    name,
    layer,
    parent_top_id,
    inheritance_relation,
    definition,
    source_fields,
    properties: [],
    relations: [],
    source_doc: "SPR本体更新最终交付文档.md",
    instanceCount
  };
}

function applyMappedProperties(nodes: Record<string, SprOntologyNode>, fieldMappings: FieldMapping[]) {
  const nodeByName = new Map(Object.values(nodes).map((node) => [node.name, node]));

  for (const mapping of fieldMappings) {
    const node = nodeByName.get(mapping.ontologyClass);
    if (!node) continue;
    if (!node.source_fields.includes(mapping.sourceField)) node.source_fields.push(mapping.sourceField);
    if (node.properties.some((property) => property.name === mapping.ontologyProperty)) continue;
    node.properties.push({
      name: mapping.ontologyProperty,
      description: `来源字段：${mapping.sourceField}；${mapping.note}`
    });
  }
}

function relation(id: string, source: string, target: string, label: string, type: SprOntologyRelation["type"]): SprOntologyRelation {
  return { id, source, target, label, type };
}

function mapping(top_id: string, spr_id: string, relationType: TopSprMapping["relation"], evidence: string, source_section: string): TopSprMapping {
  return {
    id: `${top_id}-${spr_id}`,
    top_id,
    spr_id,
    relation: relationType,
    evidence,
    source_section
  };
}

function ancestorPath(id: string, nodes: Record<string, TopOntologyNode>): string[] {
  const path: string[] = [];
  let current: TopOntologyNode | undefined = nodes[id];
  while (current) {
    path.unshift(current.id);
    current = current.parent_id ? nodes[current.parent_id] : undefined;
  }
  return path;
}

function countMappedSpr(topId: string, mappings: TopSprMapping[]): number {
  return mappings.filter((item) => item.top_id === topId).length;
}

function node(id: string, label: string, type: GraphNode["type"], group: GraphNode["group"], description: string, sourceFields?: string[], instanceCount?: number): GraphNode {
  return { id, label, type, group, description, sourceFields, instanceCount };
}

function edge(id: string, source: string, target: string, label: string, type: GraphEdge["type"]): GraphEdge {
  return { id, source, target, label, type };
}

function map(sourceTable: FieldMapping["sourceTable"], sourceField: string, ontologyClass: string, ontologyProperty: string, status: FieldMapping["status"], note: string): FieldMapping {
  return { sourceTable, sourceField, ontologyClass, ontologyProperty, status, note };
}

function topCounts(values: Array<string | undefined>, limit = 10): Array<{ name: string; value: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value && value.trim() ? value : "未提供";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function normalizeFault(value: string | undefined): string {
  if (!value || value === "-") return "正常或未标记";
  return value.replace(/^DDC:\s*/, "");
}

function stringValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function numberOrString(value: unknown): number | string | undefined {
  if (value === null || value === undefined) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : String(value);
}

function sanitizeRow(row: Record<string, unknown>): ProcessRecord["raw"] {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (value instanceof Date) return [key, value.toISOString()];
      if (typeof value === "string" && value.length > 160) {
        const pointCount = value.split(",").filter((part) => part.trim()).length;
        return [key, `[长序列字段，${pointCount} 个点，详情按需加载]`];
      }
      if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return [key, value];
      }
      return [key, String(value)];
    })
  );
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}
