import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATASET_PATH = path.join(ROOT, "data", "processed", "demo-dataset.json");
const SKILL_DIR = "C:\\Users\\xi\\.codex\\plugins\\cache\\openai-primary-runtime\\presentations\\26.515.10909\\skills\\presentations";
const NODE = "C:\\Users\\xi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe";
const PYTHON = "C:\\Users\\xi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
const WORKSPACE = path.join(ROOT, "outputs", "manual-sunday-report", "presentations", "spr-report");
const SLIDES_DIR = path.join(WORKSPACE, "slides");
const PREVIEW_DIR = path.join(WORKSPACE, "preview");
const LAYOUT_DIR = path.join(WORKSPACE, "layout");
const OUTPUT_DIR = path.join(ROOT, "docs");
const FINAL_PPTX = path.join(OUTPUT_DIR, "SPR工艺本体周日汇报_最终版.pptx");

const dataset = JSON.parse(await fs.readFile(DATASET_PATH, "utf8"));
const metrics = dataset.summary.metrics;
const fieldStatus = countBy(dataset.fieldMappings, (item) => item.status);

await fs.mkdir(SLIDES_DIR, { recursive: true });
await fs.mkdir(PREVIEW_DIR, { recursive: true });
await fs.mkdir(LAYOUT_DIR, { recursive: true });
await fs.mkdir(OUTPUT_DIR, { recursive: true });

const shared = `
const STYLE = {
  bg: "#F5EFE2",
  ink: "#17211A",
  muted: "#6E746B",
  soft: "#8D6E52",
  line: "#D8CBB8",
  accent: "#B13D2E",
  accent2: "#236D6B",
  accent3: "#D5A24C",
  dark: "#18231D",
  pale: "#FFF9ED",
  serif: "Georgia",
  sans: "Aptos"
};

function text(slide, ctx, value, x, y, w, h, opts = {}) {
  return ctx.addText(slide, {
    text: String(value ?? ""),
    left: x,
    top: y,
    width: w,
    height: h,
    fontSize: opts.size ?? 18,
    color: opts.color ?? STYLE.ink,
    bold: Boolean(opts.bold),
    typeface: opts.face ?? (opts.serif ? STYLE.serif : STYLE.sans),
    align: opts.align ?? "left",
    valign: opts.valign ?? "top",
    fill: opts.fill ?? "#00000000",
    line: opts.line ?? ctx.line(),
    insets: opts.insets ?? { left: 0, right: 0, top: 0, bottom: 0 },
    name: opts.name
  });
}

function rect(slide, ctx, x, y, w, h, fill, opts = {}) {
  return ctx.addShape(slide, {
    left: x,
    top: y,
    width: w,
    height: h,
    geometry: opts.geometry ?? "rect",
    fill,
    line: opts.line ?? ctx.line(),
    name: opts.name
  });
}

function rule(slide, ctx, x, y, w, color = STYLE.line, weight = 1) {
  rect(slide, ctx, x, y, w, weight, color);
}

function bg(slide, ctx) {
  rect(slide, ctx, 0, 0, 1280, 720, STYLE.bg);
  rect(slide, ctx, 1010, 0, 270, 720, "#EFE2CF");
  rect(slide, ctx, 0, 620, 1280, 100, "#F9F4EA");
}

function kicker(slide, ctx, label) {
  rect(slide, ctx, 58, 50, 10, 10, STYLE.accent);
  text(slide, ctx, label.toUpperCase().split("").join(" "), 82, 43, 420, 22, { size: 9, color: STYLE.soft, bold: true, name: "kicker-label" });
}

function title(slide, ctx, value, y = 82, w = 880, size = 38) {
  text(slide, ctx, value, 58, y, w, 100, { size, serif: true, bold: true, color: STYLE.ink });
}

function footer(slide, ctx, page) {
  rule(slide, ctx, 58, 674, 1164, STYLE.line, 1);
  text(slide, ctx, "SPR 工艺本体 Demo | 周日汇报", 58, 688, 520, 18, { size: 8, color: STYLE.muted });
  text(slide, ctx, String(page).padStart(2, "0"), 1180, 684, 44, 22, { size: 12, serif: true, bold: true, color: STYLE.soft, align: "right" });
}

function metric(slide, ctx, x, y, value, label, note, color = STYLE.accent) {
  rule(slide, ctx, x, y - 12, 74, color, 3);
  text(slide, ctx, value, x, y, 160, 46, { size: 34, serif: true, bold: true, color: STYLE.ink });
  text(slide, ctx, label, x, y + 48, 210, 22, { size: 11, bold: true, color: STYLE.ink });
  text(slide, ctx, note, x, y + 72, 220, 34, { size: 9, color: STYLE.muted });
}

function pill(slide, ctx, x, y, w, value, color = STYLE.accent2) {
  rect(slide, ctx, x, y, w, 30, "#FFF9ED", { line: ctx.line(color, 1) });
  text(slide, ctx, value, x + 14, y + 7, w - 28, 16, { size: 9, color, bold: true, align: "center" });
}
`;

const slides = [
  {
    name: "slide-01.mjs",
    body: `
export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  rect(slide, ctx, 58, 54, 5, 56, STYLE.accent);
  text(slide, ctx, "SPR ONTOLOGY DEMO", 78, 54, 360, 20, { size: 10, color: STYLE.soft, bold: true });
  text(slide, ctx, "周日汇报 | 数据组", 78, 82, 260, 18, { size: 10, color: STYLE.muted });
  text(slide, ctx, "SPR 工艺本体 Demo：\\n从数据接入到检测结果返回", 58, 182, 760, 140, { size: 46, serif: true, bold: true });
  text(slide, ctx, "这次不堆根因细节，重点证明一条链路：真实数据能进入本体语义结构，并通过检测 API 返回结构化结果。", 760, 196, 390, 96, { size: 20, serif: true, bold: true });
  metric(slide, ctx, 58, 520, "${metrics.mainRecords + metrics.ripRopRecords}", "统一过程记录", "两个 Excel 数据源清洗后合并", STYLE.accent);
  metric(slide, ctx, 318, 520, "${dataset.fieldMappings.length}", "字段映射", "主数据库 16 字段 + RIP_ROP 42 字段", STYLE.accent2);
  metric(slide, ctx, 578, 520, "${dataset.ontology.nodes.length}", "图谱节点", "顶层本体与 SPR 本体联合展示", STYLE.accent3);
  footer(slide, ctx, 1);
  return slide;
}`
  },
  {
    name: "slide-02.mjs",
    body: `
export async function slide02(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  kicker(slide, ctx, "System Flow");
  title(slide, ctx, "完整流程已经跑通：输入、语义映射、检测、报告形成闭环。", 82, 960, 34);
  const steps = [
    ["Excel 数据", "两个表格数据源"],
    ["ProcessRecord", "统一过程记录"],
    ["本体映射", "类、属性、实例关系"],
    ["/api/detect/run", "检测结果返回"],
    ["预警报告", "根因候选与动作建议"]
  ];
  steps.forEach((step, idx) => {
    const x = 72 + idx * 225;
    rect(slide, ctx, x, 318, 176, 92, idx % 2 ? "#E8F0E8" : "#FFF9ED", { line: ctx.line(idx % 2 ? STYLE.accent2 : STYLE.accent, 1.2) });
    text(slide, ctx, step[0], x + 18, 336, 140, 24, { size: 16, bold: true });
    text(slide, ctx, step[1], x + 18, 368, 136, 30, { size: 10, color: STYLE.muted });
    if (idx < steps.length - 1) {
      rule(slide, ctx, x + 184, 362, 36, STYLE.accent3, 2);
      rect(slide, ctx, x + 217, 357, 10, 10, STYLE.accent3, { geometry: "triangle" });
    }
  });
  text(slide, ctx, "汇报重点：老师需要看到流程清楚、输入输出清楚、边界清楚，而不是听每条规则怎么推出来。", 84, 492, 760, 54, { size: 19, serif: true, bold: true, color: STYLE.ink });
  footer(slide, ctx, 2);
  return slide;
}`
  },
  {
    name: "slide-03.mjs",
    body: `
export async function slide03(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  kicker(slide, ctx, "Current Build");
  title(slide, ctx, "当前成果已经从概念图进入工程化数据层。", 82, 920, 36);
  const cards = [
    ["${metrics.mainRecords}", "主数据库记录", "main 表导出"],
    ["${metrics.ripRopRecords}", "RIP_ROP 记录", "曲线与故障线索"],
    ["${metrics.mainFields}", "主表字段", "全部映射到本体属性"],
    ["${metrics.ripRopFields}", "RIP_ROP 字段", "补充曲线、包络线与公差"],
    ["${Object.keys(dataset.top_ontology.nodes).length}", "顶层本体节点", "跨工艺抽象层"],
    ["${Object.keys(dataset.spr_ontology.nodes).length}", "SPR 本体节点", "业务承载层"]
  ];
  cards.forEach((card, idx) => {
    const x = 70 + (idx % 3) * 315;
    const y = 250 + Math.floor(idx / 3) * 150;
    rect(slide, ctx, x, y, 250, 104, "#FFF9ED", { line: ctx.line(STYLE.line, 1) });
    text(slide, ctx, card[0], x + 22, y + 18, 82, 38, { size: 31, serif: true, bold: true, color: idx % 2 ? STYLE.accent2 : STYLE.accent });
    text(slide, ctx, card[1], x + 118, y + 22, 116, 22, { size: 14, bold: true });
    text(slide, ctx, card[2], x + 118, y + 50, 110, 34, { size: 9.5, color: STYLE.muted });
  });
  footer(slide, ctx, 3);
  return slide;
}`
  },
  {
    name: "slide-04.mjs",
    body: `
export async function slide04(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  kicker(slide, ctx, "Ontology Target");
  title(slide, ctx, "本体最终不是一张静态图，而是工艺语义中枢。", 82, 930, 36);
  const layers = [
    ["数据语义层", "解释不同表、字段、数据源含义"],
    ["工艺对象层", "产线、设备、程序、连接点、参数、曲线"],
    ["过程实例层", "每条记录追溯到设备、程序、曲线和质量结果"],
    ["规则知识层", "规则抽取、复核、发布和版本管理"],
    ["模型服务层", "检测、根因候选和报告用本体路径解释"]
  ];
  layers.forEach((layer, idx) => {
    const y = 218 + idx * 70;
    rect(slide, ctx, 106 + idx * 28, y, 700 - idx * 30, 46, idx % 2 ? "#E9F0E9" : "#FFF9ED", { line: ctx.line(idx % 2 ? STYLE.accent2 : STYLE.accent, 1) });
    text(slide, ctx, layer[0], 128 + idx * 28, y + 12, 150, 20, { size: 14, bold: true });
    text(slide, ctx, layer[1], 304 + idx * 28, y + 13, 430, 18, { size: 11, color: STYLE.muted });
  });
  text(slide, ctx, "一句话：本体负责解释事实之间的关系，数据库仍然负责保存事实本身。", 830, 306, 300, 92, { size: 22, serif: true, bold: true, color: STYLE.accent });
  footer(slide, ctx, 4);
  return slide;
}`
  },
  {
    name: "slide-05.mjs",
    body: `
export async function slide05(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  kicker(slide, ctx, "Field Mapping");
  title(slide, ctx, "输入结构按本体设计，数据库字段作为适配来源。", 82, 930, 35);
  const rows = [
    ["line_name / device_name", "产线类 / 设备类", "已有类承载"],
    ["prog_no / 程序", "程序类.programNumber", "补属性"],
    ["rivet_id / 铆钉计数器", "SPR连接点类.rivetPointId", "连接点线索"],
    ["original_data / calculate_data", "原始曲线类 / 计算后曲线类", "长曲线拆分"],
    ["故障代码", "质量结果类.faultCode", "检测线索"],
    ["pre / error_rate", "模型预测结果类", "待业务确认"]
  ];
  const x = 78;
  const y = 224;
  ["数据字段", "本体位置", "当前处理"].forEach((h, idx) => text(slide, ctx, h, x + idx * 300, y, 230, 18, { size: 11, bold: true, color: STYLE.soft }));
  rule(slide, ctx, x, y + 30, 900, STYLE.accent, 2);
  rows.forEach((row, ridx) => {
    const yy = y + 54 + ridx * 52;
    row.forEach((cell, cidx) => text(slide, ctx, cell, x + cidx * 300, yy, 255, 24, { size: cidx === 2 ? 11 : 12, bold: cidx === 0, color: cidx === 2 ? STYLE.accent2 : STYLE.ink }));
    rule(slide, ctx, x, yy + 34, 900, STYLE.line, 1);
  });
  text(slide, ctx, "已补强：类属性现在使用英文属性名，例如 recordId、businessId、deviceName；展示层再做中文解释。", 78, 590, 830, 36, { size: 16, serif: true, bold: true });
  footer(slide, ctx, 5);
  return slide;
}`
  },
  {
    name: "slide-06.mjs",
    body: `
export async function slide06(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  kicker(slide, ctx, "Demo Path");
  title(slide, ctx, "演示时跑一条异常记录，展示完整返回链路。", 82, 930, 36);
  text(slide, ctx, "推荐记录：riprop-2", 78, 216, 300, 34, { size: 24, serif: true, bold: true, color: STYLE.accent });
  const actions = [
    ["1", "打开首页", "确认记录数和字段覆盖"],
    ["2", "进入实例/检测页", "选择 riprop-2"],
    ["3", "点击检测", "触发 /api/detect/run"],
    ["4", "查看返回", "类别、置信度、严重程度、证据"],
    ["5", "生成报告", "根因候选和预警动作"]
  ];
  actions.forEach((item, idx) => {
    const y = 294 + idx * 58;
    rect(slide, ctx, 86, y, 34, 34, idx % 2 ? STYLE.accent2 : STYLE.accent);
    text(slide, ctx, item[0], 96, y + 7, 14, 14, { size: 12, bold: true, color: "#FFFFFF", align: "center" });
    text(slide, ctx, item[1], 144, y + 3, 190, 24, { size: 16, bold: true });
    text(slide, ctx, item[2], 360, y + 5, 420, 22, { size: 12, color: STYLE.muted });
  });
  rect(slide, ctx, 838, 262, 260, 180, STYLE.dark);
  text(slide, ctx, "讲法", 864, 290, 80, 20, { size: 13, bold: true, color: STYLE.accent3 });
  text(slide, ctx, "这页重点不是解释每条根因为何触发，而是证明从真实记录到检测结果和报告的链路可演示。", 864, 328, 200, 82, { size: 16, serif: true, bold: true, color: "#FFF9ED" });
  footer(slide, ctx, 6);
  return slide;
}`
  },
  {
    name: "slide-07.mjs",
    body: `
export async function slide07(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  kicker(slide, ctx, "Boundary");
  title(slide, ctx, "当前能力边界：先跑通流程，再补数据和模型验证。", 82, 930, 36);
  text(slide, ctx, "已能实现", 94, 218, 220, 26, { size: 19, serif: true, bold: true, color: STYLE.accent2 });
  text(slide, ctx, "暂不宣称", 650, 218, 220, 26, { size: 19, serif: true, bold: true, color: STYLE.accent });
  const left = ["真实表格数据接入", "字段到本体映射", "过程记录实例展示", "检测 API 调用", "根因候选和报告生成", "OWL 导出和校验"];
  const right = ["实时数据库自动同步", "所有字段语义完全确认", "完整 RDF 三元组仓库", "工业级模型准确率", "已验证复杂根因推理", "完整 OWL reasoner 闭环"];
  left.forEach((item, idx) => {
    const y = 280 + idx * 42;
    pill(slide, ctx, 94, y, 360, item, STYLE.accent2);
    pill(slide, ctx, 650, y, 380, right[idx], STYLE.accent);
  });
  text(slide, ctx, "这不是保守，是可信：数据和业务解释不足时，不把 Demo 说成最终系统。", 120, 580, 850, 42, { size: 19, serif: true, bold: true });
  footer(slide, ctx, 7);
  return slide;
}`
  },
  {
    name: "slide-08.mjs",
    body: `
export async function slide08(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  kicker(slide, ctx, "Next");
  title(slide, ctx, "下一步从 Demo 走向可用系统：确认、闭环、验证。", 82, 930, 36);
  const next = [
    ["01", "补字段解释", "确认 pre、error_rate、RRC、PECV2 和质量特性字段含义"],
    ["02", "补实例闭环", "把更多实例关系写成可查询图结构或 RDF 结构"],
    ["03", "补自动同步", "新增数据库记录自动触发实例化与本体数据更新"],
    ["04", "补模型验证", "建设标注样本，评估检测和根因分析效果"]
  ];
  next.forEach((item, idx) => {
    const x = 92 + idx * 270;
    rect(slide, ctx, x, 246, 208, 250, idx % 2 ? "#E8F0E8" : "#FFF9ED", { line: ctx.line(idx % 2 ? STYLE.accent2 : STYLE.accent, 1) });
    text(slide, ctx, item[0], x + 20, 270, 60, 42, { size: 34, serif: true, bold: true, color: idx % 2 ? STYLE.accent2 : STYLE.accent });
    text(slide, ctx, item[1], x + 20, 332, 160, 28, { size: 18, bold: true });
    text(slide, ctx, item[2], x + 20, 384, 156, 70, { size: 11, color: STYLE.muted });
  });
  text(slide, ctx, "收束句：当前已经完成工程链路和本体承载方式，后续重点是补业务确认、实例闭环和模型效果验证。", 92, 574, 880, 42, { size: 18, serif: true, bold: true, color: STYLE.ink });
  footer(slide, ctx, 8);
  return slide;
}`
  }
];

for (const slide of slides) {
  await fs.writeFile(path.join(SLIDES_DIR, slide.name), `${shared}\n${slide.body}\n`, "utf8");
}

const build = spawnSync(
  NODE,
  [
    path.join(SKILL_DIR, "scripts", "build_artifact_deck.mjs"),
    "--workspace", WORKSPACE,
    "--slides-dir", SLIDES_DIR,
    "--out", FINAL_PPTX,
    "--preview-dir", PREVIEW_DIR,
    "--layout-dir", LAYOUT_DIR,
    "--contact-sheet", path.join(PREVIEW_DIR, "contact-sheet.png"),
    "--slide-count", "8",
    "--scale", "0.55"
  ],
  {
    encoding: "utf8",
    env: { ...process.env, HOME: "C:\\Users\\xi", USERPROFILE: "C:\\Users\\xi", PYTHON }
  }
);

if (build.status !== 0) {
  console.error(build.stdout);
  console.error(build.stderr);
  process.exit(build.status ?? 1);
}

const stat = await fs.stat(FINAL_PPTX);
console.log(JSON.stringify({ output: FINAL_PPTX, bytes: stat.size }, null, 2));

function countBy(items, getKey) {
  return Object.fromEntries(
    items.reduce((acc, item) => {
      const key = getKey(item);
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map())
  );
}
