import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { parseCurve, summarizeCurve } from "./shared/reasoning";
import type { DemoDataset, FieldMapping, GraphEdge, GraphNode, ProcessRecord } from "./shared/types";

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

const dataset: DemoDataset = {
  generatedAt: new Date().toISOString(),
  summary: buildSummary(mainRecords, ripRecords),
  ontology: buildOntology(records),
  fieldMappings: buildFieldMappings(),
  records,
  demoScripts: buildDemoScripts()
};

await writeJson(path.join(PROCESSED_DIR, "demo-dataset.json"), dataset);
await writeJson(path.join(PUBLIC_DATA_DIR, "demo-dataset.json"), dataset);
await writeJson(path.join(PROCESSED_DIR, "summary.json"), dataset.summary);
await writeJson(path.join(PROCESSED_DIR, "ontology.graph.json"), dataset.ontology);
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

function buildOntology(records: ProcessRecord[]): DemoDataset["ontology"] {
  const countByClass = {
    "SPR过程记录类": records.length,
    "设备类": unique(records.map((record) => record.deviceName)).length,
    "程序类": unique(records.map((record) => record.program)).length,
    "SPR连接点类": unique(records.map((record) => record.rivetId)).length,
    "产线类": unique(records.map((record) => record.lineName)).length
  };

  const nodes: GraphNode[] = [
    node("top-traceable", "可追溯对象类", "class", "top", "顶层工艺本体中的可追溯对象父类。"),
    node("top-process", "工艺域", "class", "top", "顶层工艺对象与工艺活动集合。"),
    node("top-quality", "质量域", "class", "top", "质量结果、缺陷和规则归属域。"),
    node("line", "产线类", "class", "spr-core", "SPR 主链路核心类，承载 line_name。", ["line_name"], countByClass["产线类"]),
    node("station", "工位类", "class", "spr-core", "保持原定义，后续可由设备编码拆分实例。"),
    node("device", "设备类", "class", "spr-core", "承载 device_name / Devicename。", ["device_name", "Devicename"], countByClass["设备类"]),
    node("program", "程序类", "class", "spr-core", "承载 prog_no / 程序。", ["prog_no", "程序"], countByClass["程序类"]),
    node("joint", "SPR连接点类", "class", "spr-core", "承载 rivet_id 与铆钉计数器。", ["rivet_id", "铆钉计数器"], countByClass["SPR连接点类"]),
    node("parameter", "工艺参数类", "class", "spr-core", "承载最大力、冲压行程、末端力等实测参数。"),
    node("quality", "质量结果类", "class", "spr-core", "承载 error_rate、pre、故障代码。", ["error_rate", "pre", "故障代码"]),
    node("defect", "缺陷类", "class", "spr-core", "承载冲压行程过大、曲线高于/低于包络线等缺陷模式。"),
    node("record", "SPR过程记录类", "class", "spr-extension", "每条数据库记录的统一承载入口。", ["id", "biz_id", "origin_time", "consumer_time"], countByClass["SPR过程记录类"]),
    node("curve-data", "SPR曲线数据类", "class", "spr-extension", "过程记录关联的曲线数据集合。", ["original_data", "calculate_data", "铆接曲线", "包络线"]),
    node("original-curve", "原始曲线类", "class", "spr-extension", "未经处理或缩放前曲线。", ["original_data", "最大力铆接曲线（原始数据）"]),
    node("calculated-curve", "计算后曲线类", "class", "spr-extension", "处理后或保留精度后的曲线。", ["calculate_data"]),
    node("riveting-curve", "铆接曲线类", "class", "spr-extension", "设备导出的实际铆接曲线。", ["铆接曲线"]),
    node("envelope", "包络线类", "class", "spr-extension", "用于判断铆接曲线是否越界的参考曲线。", ["包络线", "包络线最大力"]),
    node("curve-feature", "曲线特征类", "class", "spr-extension", "曲线最大力、刻度、峰值等摘要特征。"),
    node("envelope-tolerance", "包络线公差类", "class", "spr-extension", "包络线警告与故障阈值。", ["包络线公差警告", "包络线公差故障"]),
    node("rrc", "RRC参数类", "class", "spr-extension", "RRC 启用状态与偏差指标。", ["RRC启用", "RRC 铆接曲线偏差"]),
    node("pecv2", "PECV2状态类", "class", "spr-extension", "PECV2 激活状态。", ["PECV2 activated"]),
    node("end-force", "末端力公差类", "class", "spr-extension", "末端力上下限与实际末端力。", ["End force tolerance min.", "Actual end force"]),
    node("prediction", "模型预测结果类", "class", "spr-extension", "模型或算法输出的预测类别、误差率。", ["pre", "error_rate"]),
    node("rule-high", "Rule-Curve-High", "rule", "reasoning", "铆接曲线高于包络线时触发缺陷解释。"),
    node("rule-low", "Rule-Curve-Low", "rule", "reasoning", "铆接曲线低于包络线时触发缺陷解释。"),
    node("rule-stroke", "Rule-Press-Stroke-High", "rule", "reasoning", "冲压行程过大时触发缺陷解释。")
  ];

  const edges: GraphEdge[] = [
    edge("line-station", "line", "station", "hasStation", "objectProperty"),
    edge("station-device", "station", "device", "hasEquipment", "objectProperty"),
    edge("device-program", "device", "program", "runsProgram", "objectProperty"),
    edge("program-joint", "program", "joint", "hasJoint", "objectProperty"),
    edge("joint-parameter", "joint", "parameter", "hasParameter", "objectProperty"),
    edge("parameter-quality", "parameter", "quality", "hasQualityResult", "objectProperty"),
    edge("quality-defect", "quality", "defect", "hasDefect", "objectProperty"),
    edge("record-top", "record", "top-traceable", "inherits", "inherits"),
    edge("record-line", "record", "line", "recordedAtLine", "objectProperty"),
    edge("record-device", "record", "device", "recordedByDevice", "objectProperty"),
    edge("record-program", "record", "program", "recordedWithProgram", "objectProperty"),
    edge("record-joint", "record", "joint", "recordsJoint", "objectProperty"),
    edge("record-parameter", "record", "parameter", "hasOnlineParameter", "objectProperty"),
    edge("record-curve", "record", "curve-data", "hasCurveData", "objectProperty"),
    edge("record-prediction", "record", "prediction", "hasPredictionResult", "objectProperty"),
    edge("record-rrc", "record", "rrc", "hasRRCParameter", "objectProperty"),
    edge("record-pecv2", "record", "pecv2", "hasPECV2State", "objectProperty"),
    edge("curve-original", "curve-data", "original-curve", "hasOriginalCurve", "objectProperty"),
    edge("curve-calculated", "curve-data", "calculated-curve", "hasCalculatedCurve", "objectProperty"),
    edge("curve-riveting", "curve-data", "riveting-curve", "hasRivetingCurve", "objectProperty"),
    edge("curve-envelope", "curve-data", "envelope", "hasEnvelopeCurve", "objectProperty"),
    edge("envelope-tolerance-edge", "envelope", "envelope-tolerance", "hasToleranceLimit", "objectProperty"),
    edge("quality-envelope", "quality", "envelope", "evaluatedByEnvelope", "objectProperty"),
    edge("rule-high-edge", "rule-high", "defect", "infers", "derivedFrom"),
    edge("rule-low-edge", "rule-low", "defect", "infers", "derivedFrom"),
    edge("rule-stroke-edge", "rule-stroke", "defect", "infers", "derivedFrom")
  ];

  return { nodes, edges };
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
