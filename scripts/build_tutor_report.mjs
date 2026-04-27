import fs from "node:fs/promises";
import path from "node:path";
import {
  Presentation,
  PresentationFile,
  column,
  row,
  grid,
  layers,
  text,
  shape,
  rule,
  fill,
  hug,
  fixed,
  wrap,
  fr,
} from "@oai/artifact-tool";

const ROOT = process.cwd();
const FINAL_DIR = path.join(ROOT, "final");
const SCRATCH_DIR = path.join(ROOT, "scratch", "tutor-report-preview");
const PPTX_PATH = path.join(FINAL_DIR, "SPR本体更新导师汇报.pptx");
const MD_PATH = path.join(FINAL_DIR, "1.md");

await fs.mkdir(SCRATCH_DIR, { recursive: true });

const source = await fs.readFile(MD_PATH, "utf8");

const C = {
  canvas: "#FFFFFF",
  blue: "#02409A",
  blue2: "#4874CB",
  orange: "#EE822F",
  yellow: "#F2BA02",
  green: "#75BD42",
  teal: "#30C0B4",
  red: "#E54C5E",
  ink: "#1F2933",
  muted: "#5F6B7A",
  paleBlue: "#EAF1FF",
  paleOrange: "#FFF2E5",
  paleGreen: "#EEF8E9",
  line: "#D9DEE8",
  soft: "#F6F8FC",
};

const font = "PingFang SC";

function tx(value, opts = {}) {
  return text(value, {
    name: opts.name,
    width: opts.width ?? fill,
    height: opts.height ?? hug,
    style: {
      fontFamily: font,
      fontSize: opts.size ?? 24,
      bold: opts.bold ?? false,
      color: opts.color ?? C.ink,
      ...opts.style,
    },
  });
}

function chip(label, color = C.blue, width = 210) {
  return layers({ name: `chip-${label}`, width: fixed(width), height: fixed(46) }, [
    shape({ width: fixed(width), height: fixed(46), fill: color, borderRadius: "rounded-full" }),
    tx(label, {
      width: fixed(width),
      height: fixed(46),
      size: 18,
      bold: true,
      color: "#FFFFFF",
      style: { textAlign: "center" },
    }),
  ]);
}

function footer(page, title = "SPR 本体更新导师汇报") {
  return row(
    { name: "footer", width: fill, height: fixed(32), alignItems: "center" },
    [
      tx(title, { width: fill, size: 14, color: "#8B95A1" }),
      tx(String(page).padStart(2, "0"), {
        width: fixed(70),
        size: 15,
        bold: true,
        color: C.blue,
        style: { textAlign: "right" },
      }),
    ],
  );
}

function header(title, section = "") {
  return layers({ name: "header", width: fill, height: fixed(98) }, [
    shape({ name: "header-blue", width: fill, height: fixed(76), fill: C.blue }),
    shape({ name: "header-accent", width: fixed(148), height: fixed(8), fill: C.orange }),
    row(
      {
        name: "header-copy",
        width: fill,
        height: fixed(76),
        padding: { x: 34, y: 14 },
        alignItems: "center",
        gap: 20,
      },
      [
        tx(title, { width: fill, size: 35, bold: true, color: "#FFFFFF" }),
        section ? tx(section, {
          width: fixed(260),
          size: 17,
          color: "#DCE8FF",
          style: { textAlign: "right" },
        }) : null,
      ].filter(Boolean),
    ),
  ]);
}

function addSlide(p, page, title, content, opts = {}) {
  const slide = p.slides.add();
  slide.compose(
    column(
      {
        name: "slide-root",
        width: fill,
        height: fill,
        padding: { x: 40, y: 26 },
        gap: 20,
      },
      [
        header(title, opts.section),
        column(
          {
            name: "body",
            width: fill,
            height: fill,
            gap: opts.gap ?? 22,
          },
          content,
        ),
        footer(page),
      ],
    ),
    { frame: { left: 0, top: 0, width: 1920, height: 1080 }, baseUnit: 8 },
  );
  return slide;
}

function bullets(items, opts = {}) {
  return column(
    { name: opts.name ?? "bullets", width: fill, height: hug, gap: opts.gap ?? 16 },
    items.map((item, idx) =>
      row(
        {
          name: `bullet-${idx}`,
          width: fill,
          height: fixed(opts.rowHeight ?? (item.length > 45 ? 70 : 46)),
          gap: 14,
          alignItems: "start",
        },
        [
          shape({
            width: fixed(10),
            height: fixed(10),
            fill: opts.color ?? C.orange,
            borderRadius: "rounded-full",
          }),
          tx(item, {
            width: wrap(opts.wrap ?? 1620),
            height: fixed(opts.rowHeight ?? (item.length > 45 ? 70 : 46)),
            size: opts.size ?? 26,
            color: opts.textColor ?? C.ink,
          }),
        ],
      ),
    ),
  );
}

function metric(value, label, color = C.blue, width = 300) {
  return column({ name: `metric-${label}`, width: fixed(width), height: hug, gap: 4 }, [
    tx(value, { size: 62, bold: true, color, width: fixed(width) }),
    tx(label, { size: 20, color: C.muted, width: fixed(width) }),
  ]);
}

function table(headers, rows, widths, opts = {}) {
  const cols = widths.map((w) => fixed(w));
  return column({ name: opts.name ?? "table", width: fill, height: hug, gap: 0 }, [
    grid(
      { name: "table-header", width: fill, height: fixed(54), columns: cols, columnGap: 18, padding: { x: 12, y: 10 } },
      headers.map((h) => tx(h, { size: opts.headerSize ?? 20, bold: true, color: "#FFFFFF" })),
    ),
    shape({ width: fill, height: fixed(4), fill: C.orange }),
    ...rows.flatMap((r, idx) => [
      grid(
        {
          name: `row-${idx}`,
          width: fill,
          height: fixed(opts.rowHeight ?? 62),
          columns: cols,
          columnGap: 18,
          padding: { x: 12, y: 11 },
        },
        r.map((cell, cidx) =>
          tx(cell, {
            size: opts.size ?? 19,
            bold: cidx === 0 && opts.boldFirst !== false,
            color: cidx === 0 ? C.ink : C.muted,
            width: fill,
            height: fixed(opts.rowHeight ? opts.rowHeight - 18 : 46),
          }),
        ),
      ),
      rule({ width: fill, stroke: C.line, weight: 1 }),
    ]),
  ]);
}

function blueTable(headers, rows, widths, opts = {}) {
  return layers({ name: opts.name ?? "blue-table-shell", width: fill, height: hug }, [
    shape({ width: fill, height: fixed(54), fill: C.blue }),
    table(headers, rows, widths, opts),
  ]);
}

function chain(items, colors = [C.blue, C.blue2, C.orange, C.green], compact = false) {
  const children = [];
  const nodeW = compact ? 86 : items.length >= 7 ? 150 : items.length >= 6 ? 178 : 210;
  const arrowW = compact ? 12 : items.length >= 7 ? 24 : 36;
  const circle = compact ? 42 : items.length >= 7 ? 58 : 74;
  items.forEach((item, idx) => {
    children.push(
      column({ name: `chain-node-${idx}`, width: fixed(nodeW), height: hug, gap: 10, alignItems: "center" }, [
        layers({ width: fixed(circle), height: fixed(circle) }, [
          shape({ width: fixed(circle), height: fixed(circle), fill: colors[idx % colors.length], borderRadius: "rounded-full" }),
          tx(String(idx + 1), {
            width: fixed(circle),
            height: fixed(circle),
            size: compact ? 16 : items.length >= 7 ? 22 : 26,
            bold: true,
            color: "#FFFFFF",
            style: { textAlign: "center" },
          }),
        ]),
        tx(item, {
          width: fixed(nodeW),
          size: compact ? 12 : items.length >= 7 ? 17 : 20,
          bold: true,
          color: C.ink,
          style: { textAlign: "center" },
        }),
      ]),
    );
    if (idx < items.length - 1) {
      children.push(tx("→", { width: fixed(arrowW), size: compact ? 18 : items.length >= 7 ? 26 : 34, bold: true, color: "#A9B4C5", style: { textAlign: "center" } }));
    }
  });
  return row({ name: "chain", width: fill, height: hug, gap: 4, alignItems: "center", justifyContent: "center" }, children);
}

function miniPanel(title, body, color = C.paleBlue, accent = C.blue, width = 400, height = 150) {
  return layers({ name: `panel-${title}`, width: fixed(width), height: fixed(height) }, [
    shape({ width: fixed(width), height: fixed(height), fill: color }),
    shape({ width: fixed(8), height: fixed(height), fill: accent }),
    column({ width: fixed(width), height: fixed(height), padding: { x: 20, y: 16 }, gap: 8 }, [
      tx(title, { width: fill, size: 23, bold: true, color: accent }),
      tx(body, { width: fill, size: 18, color: C.ink, height: fixed(height - 64) }),
    ]),
  ]);
}

const p = Presentation.create({ slideSize: { width: 1920, height: 1080 } });
const slides = [];
let page = 1;

// The reference deck uses a simple academic-report style: white canvas, strong blue title areas,
// readable body copy, and occasional screenshots/diagrams. This rebuild keeps that posture while
// spreading dense source content across more slides.

{
  const slide = p.slides.add();
  slides.push(slide);
  slide.compose(
    layers({ name: "cover", width: fill, height: fill }, [
      shape({ width: fill, height: fill, fill: C.canvas }),
      shape({ width: fill, height: fixed(390), fill: C.blue }),
      shape({ width: fixed(280), height: fixed(12), fill: C.orange }),
      column({ width: fill, height: fill, padding: { x: 0, y: 0 }, gap: 0 }, [
        column({ width: fill, height: fixed(390), padding: { x: 96, y: 82 }, gap: 28 }, [
          tx("SPR 本体更新", { width: fill, size: 72, bold: true, color: "#FFFFFF" }),
          tx("最终交付与导师汇报", { width: fill, size: 54, bold: true, color: "#FFFFFF" }),
          tx("基于数据库字段映射的 v0.3 更新建议", { width: fill, size: 30, color: "#DCE8FF" }),
        ]),
        row({ width: fill, height: fill, padding: { x: 96, y: 72 }, gap: 66 }, [
          column({ width: fill, height: hug, gap: 22 }, [
            tx("汇报重点", { size: 34, bold: true, color: C.blue }),
            bullets([
              "保持原 SPR 主链路稳定，不重构既有核心实体与关系。",
              "补齐在线过程记录、曲线数据、包络线、公差阈值、预测判定与系统时间。",
              "把主数据库与 RIP_ROP 明细表字段逐项落到本体类、属性和关系中。",
            ], { size: 25, wrap: 980, rowHeight: 66 }),
          ]),
          column({ width: fixed(420), height: hug, gap: 22 }, [
            metric("16", "主数据库字段", C.blue, 360),
            metric("42", "RIP_ROP 字段", C.orange, 360),
            metric("12", "新增/扩展类", C.green, 360),
          ]),
        ]),
      ]),
    ]),
    { frame: { left: 0, top: 0, width: 1920, height: 1080 }, baseUnit: 8 },
  );
}

function push(slide) {
  slides.push(slide);
}

page += 1; push(addSlide(p, page, "一、项目进展概览", [
  row({ width: fill, height: hug, gap: 54 }, [
    metric("已完成", "SPR 本体 v0.3 更新建议", C.blue, 390),
    metric("已完成", "字段级映射表", C.orange, 360),
    metric("已整理", "变更记录与待确认清单", C.green, 390),
  ]),
  blueTable(
    ["工作项", "完成内容", "当前状态"],
    [
      ["需求与边界", "确认本次不是推翻原 SPR 本体，而是在主链路稳定前提下补充数据库真实字段", "完成"],
      ["字段映射", "主数据库 16 字段、RIP_ROP 42 字段均已归类到现有类、补属性、扩展类或待确认项", "完成"],
      ["本体更新", "形成新增类、属性、关系、约束、规则与实例化路径", "完成"],
      ["后续沟通", "整理 pre、error_rate、车身对象、RRC/PECV2、曲线缩放关系等待确认问题", "待导师/业务确认"],
    ],
    [240, 1030, 280],
    { size: 20, rowHeight: 72 },
  ),
], { section: "进展" }));

page += 1; push(addSlide(p, page, "二、更新定位", [
  tx("本版本的核心目标：让原有 SPR 本体能够承载真实数据库中已经出现的在线过程数据。", {
    size: 34,
    bold: true,
    color: C.ink,
    width: wrap(1540),
  }),
  row({ width: fill, height: hug, gap: 32 }, [
    miniPanel("不是重构", "不改变连接点、工位、设备、程序、参数、质量结果等原主链路。", C.paleBlue, C.blue, 490, 170),
    miniPanel("而是补齐", "新增过程记录、曲线/包络线、公差、预测判定和系统时间承载层。", C.paleOrange, C.orange, 490, 170),
    miniPanel("便于落地", "数据库每个字段都能找到稳定的类、属性、关系或待确认位置。", C.paleGreen, C.green, 490, 170),
  ]),
  bullets([
    "原本体已经覆盖产线、工位、设备、程序、零件、材料、SPR连接点、铆钉、铆模、参数、检测计划、质量结果、缺陷、根因和变更。",
    "数据库样例进一步暴露出在线过程记录、曲线序列、包络线、公差阈值、预测类别、误差率和时间戳等新增建模需求。",
  ], { size: 25, rowHeight: 70 }),
], { section: "定位" }));

page += 1; push(addSlide(p, page, "三、更新原则", [
  chain(["主链路不变", "实例记录单独建模", "实测与设计参数分开", "曲线对象化", "判定保守建模", "顶层稳定扩展补专用"]),
  blueTable(
    ["原则", "具体含义"],
    [
      ["主链路不变", "继续沿用“连接点-工位-设备-程序-零件-材料-铆钉-铆模-参数-质量结果-缺陷-根因-变更”的结构"],
      ["记录层独立", "id、biz_id、采集时间、消费时间、创建时间、更新时间和删除标记统一放入 SPR过程记录类"],
      ["在线数据分层", "设计参数与实际力、实际行程等在线实测参数分开表达，避免污染主数据"],
      ["未知编码保守", "pre、error_rate、RRC、PECV2 等暂保留编码和原值，等待业务含义确认后再强语义化"],
    ],
    [300, 1220],
    { size: 21, rowHeight: 70 },
  ),
], { section: "原则" }));

page += 1; push(addSlide(p, page, "四、核心主链路保持不变", [
  tx("原 SPR 本体中已经稳定的工艺链路继续保留，本次新增对象通过过程记录层接入，而不是替换既有结构。", {
    size: 30,
    bold: true,
    width: wrap(1580),
  }),
  chain(["产线", "工位", "设备", "程序", "SPR连接点", "工艺参数", "质量结果", "缺陷/根因"], [C.blue, C.blue2, C.teal, C.green, C.orange, C.yellow, C.red, C.blue]),
  row({ width: fill, height: hug, gap: 36 }, [
    miniPanel("保留", "产线、工位、设备、程序、零件、材料、连接点、铆钉、铆模。", C.paleBlue, C.blue, 460, 165),
    miniPanel("补属性", "程序号、设备名称、铆点编号、板厚、铆钉长度、实测力/行程。", C.paleOrange, C.orange, 520, 165),
    miniPanel("新增记录入口", "SPR过程记录类挂接设备、程序、产线、连接点和在线参数。", C.paleGreen, C.green, 520, 165),
  ]),
], { section: "结构" }));

page += 1; push(addSlide(p, page, "五、新增类总体清单", [
  blueTable(
    ["类别", "新增类", "新增原因"],
    [
      ["记录承载", "SPR过程记录类", "数据库每一行是一次在线采集或铆接过程记录，需要统一承载元数据和过程上下文"],
      ["曲线承载", "SPR曲线数据类、原始曲线类、计算后曲线类、铆接曲线类", "original_data、calculate_data、铆接曲线等长序列需要对象化，支持追溯与模型调用"],
      ["判定窗口", "包络线类、曲线特征类、包络线公差类、末端力公差类", "包络线、最大力、分辨率、公差阈值是质量判定的重要依据"],
      ["控制诊断", "RRC参数类、PECV2状态类", "样例中存在控制/诊断状态字段，暂作为 SPR 专属扩展"],
      ["算法输出", "模型预测结果类", "pre、error_rate 需要保留为模型或算法输出，不直接等同合格/不合格"],
    ],
    [220, 520, 760],
    { size: 20, rowHeight: 78 },
  ),
], { section: "新增类" }));

page += 1; push(addSlide(p, page, "六、更新后的概念结构", [
  row({ width: fill, height: hug, gap: 26 }, [
    column({ width: fixed(520), height: hug, gap: 18 }, [
      miniPanel("主链路", "产线、工位、设备、程序、SPR连接点、参数、质量结果继续作为骨架。", C.paleBlue, C.blue, 520, 150),
      miniPanel("过程记录层", "每条数据库记录成为一个过程对象，并关联设备、程序、产线、连接点和在线参数。", C.paleOrange, C.orange, 520, 170),
      miniPanel("数据/判定层", "曲线、包络线、公差、RRC/PECV2、预测结果围绕过程记录展开。", C.paleGreen, C.green, 520, 170),
    ]),
    layers({ width: fixed(980), height: fixed(560) }, [
      shape({ width: fixed(980), height: fixed(560), fill: C.soft }),
      column({ width: fixed(980), height: fixed(560), padding: { x: 36, y: 34 }, gap: 20 }, [
        row({ width: fill, height: hug, gap: 14, justifyContent: "center" }, [
          chip("产线", C.blue, 120),
          chip("工位", C.blue2, 120),
          chip("设备", C.teal, 120),
          chip("程序", C.green, 120),
          chip("连接点", C.orange, 140),
        ]),
        tx("↓ records / recordedBy / recordedWith / recordsJoint", {
          size: 24,
          color: C.muted,
          width: fill,
          style: { textAlign: "center" },
        }),
        row({ width: fill, height: hug, justifyContent: "center" }, [
          chip("SPR过程记录类", C.blue, 330),
        ]),
        tx("↓ hasOnlineParameter / hasCurveData / hasPredictionResult", {
          size: 24,
          color: C.muted,
          width: fill,
          style: { textAlign: "center" },
        }),
        grid({ width: fill, height: hug, columns: [fr(1), fr(1), fr(1)], columnGap: 18, rowGap: 16 }, [
          chip("工艺参数", C.green, 210),
          chip("曲线数据", C.teal, 210),
          chip("质量结果", C.orange, 210),
          chip("包络线/公差", C.red, 230),
          chip("RRC/PECV2", C.blue2, 230),
          chip("预测结果", C.yellow, 210),
        ]),
      ]),
    ]),
  ]),
], { section: "概念层" }));

page += 1; push(addSlide(p, page, "七、属性层补充重点", [
  blueTable(
    ["本体类", "新增/补充属性", "对应来源字段"],
    [
      ["产线类 / 设备类 / 程序类", "lineName、deviceName、programNumber、programName", "line_name、device_name、Devicename、prog_no、程序"],
      ["SPR连接点类 / 材料类 / SPR铆钉类", "rivetPointId、sheetThickness、rivetLength", "rivet_id、钢板厚度、铆钉长度"],
      ["工艺参数类", "maxRivetingForce、pressStroke、actualEndForce、jicDVal", "铆接线最大力、铆接线冲压行程、Actual end force、JIC dVal"],
      ["SPR过程记录类", "recordId、businessId、carBodyId、originTime、consumerTime、createTime、updateTime、isDeleted", "id、biz_id、carbody_id、origin_time、consumer_time、create_time、update_time、is_deleted"],
      ["质量结果 / 模型预测结果", "errorRate、predictionCategory、faultCode、qualityState", "error_rate、pre、故障代码、规则推断状态"],
    ],
    [330, 650, 540],
    { size: 18, rowHeight: 76 },
  ),
], { section: "属性层" }));

page += 1; push(addSlide(p, page, "八、曲线与包络线建模", [
  row({ width: fill, height: hug, gap: 36 }, [
    column({ width: fixed(620), height: hug, gap: 18 }, [
      tx("为什么不只存字符串？", { size: 34, bold: true, color: C.blue }),
      bullets([
        "曲线对象需要可追溯、可统计、可判定、可作为模型输入。",
        "原始曲线、计算后曲线、铆接曲线、包络线含义不同，应分开表达。",
        "最大力、Y 轴刻度、点数、分辨率、公差阈值是曲线判定的关键特征。",
      ], { size: 24, wrap: 570, rowHeight: 70 }),
    ]),
    blueTable(
      ["对象", "承载字段"],
      [
        ["原始曲线类", "original_data、最大力铆接曲线（原始数据）"],
        ["计算后曲线类", "calculate_data"],
        ["铆接曲线类", "铆接曲线、铆接曲线存在、铆接曲线最大力"],
        ["包络线类", "包络线、包络线最大力、分辨率、Y刻度"],
        ["包络线公差类", "包络线公差警告、包络线公差故障、行程公差"],
      ],
      [260, 620],
      { size: 19, rowHeight: 66 },
    ),
  ]),
], { section: "曲线层" }));

page += 1; push(addSlide(p, page, "九、关系层新增", [
  blueTable(
    ["关系名称", "定义域 → 值域", "作用"],
    [
      ["recordsJoint", "SPR过程记录类 → SPR连接点类", "将在线记录关联到具体铆点或连接点"],
      ["recordedByDevice / recordedAtLine", "SPR过程记录类 → 设备类 / 产线类", "保留数据产生的设备与线体上下文"],
      ["recordedWithProgram", "SPR过程记录类 → 程序类", "将过程记录关联到程序号或程序名称"],
      ["hasOnlineParameter", "SPR过程记录类 → 工艺参数类", "表达在线实测最大力、冲压行程、末端力等参数"],
      ["hasCurveData", "SPR过程记录类 → SPR曲线数据类", "表达一次记录包含曲线数据集合"],
      ["hasEnvelopeCurve / hasToleranceLimit", "曲线/包络线 → 包络线/公差类", "支撑曲线越界判定和阈值解释"],
      ["hasPredictionResult / hasRRCParameter", "SPR过程记录类 → 模型预测结果类 / RRC参数类", "挂接模型输出与控制诊断状态"],
    ],
    [360, 520, 620],
    { size: 18, rowHeight: 66 },
  ),
], { section: "关系层" }));

page += 1; push(addSlide(p, page, "十、字段映射结果：主数据库", [
  row({ width: fill, height: hug, gap: 54 }, [
    metric("666", "样例记录数", C.blue, 280),
    metric("16", "字段数", C.orange, 260),
    metric("100%", "字段纳入映射", C.green, 320),
  ]),
  blueTable(
    ["字段类型", "代表字段", "映射处理"],
    [
      ["主链路字段", "line_name、device_name、prog_no、rivet_id", "映射到产线、设备、程序、SPR连接点，并由过程记录关联"],
      ["记录元数据", "id、biz_id、origin_time、consumer_time、create_time、update_time、is_deleted", "新增 SPR过程记录类统一承载"],
      ["曲线字段", "original_data、calculate_data", "新增 SPR曲线数据类、原始曲线类、计算后曲线类"],
      ["质量/预测字段", "error_rate、pre", "接入质量结果类/模型预测结果类，编码含义待确认"],
      ["车身字段", "carbody_id", "暂作为过程记录属性，后续确认是否新增车身对象"],
    ],
    [280, 560, 710],
    { size: 19, rowHeight: 68 },
  ),
], { section: "字段映射" }));

page += 1; push(addSlide(p, page, "十一、字段映射结果：RIP_ROP 明细表", [
  row({ width: fill, height: hug, gap: 54 }, [
    metric("177", "样例记录数", C.blue, 280),
    metric("42", "字段数", C.orange, 260),
    metric("5 类", "主要字段分组", C.green, 300),
  ]),
  blueTable(
    ["字段分组", "代表字段", "本体承载"],
    [
      ["过程上下文", "实物编号、日期/时间、输出、程序、流程类型、铆钉计数器", "SPR过程记录类、程序类、工艺类"],
      ["过程参数与材料", "铆接线最大力、冲压行程、钢板厚度、铆钉长度、JIC dVal", "工艺参数类、材料类、SPR铆钉类"],
      ["曲线与包络线", "铆接曲线、包络线、最大力、分辨率、Y刻度", "铆接曲线类、包络线类、曲线特征类"],
      ["公差与故障", "故障代码、包络线公差警告/故障、末端力公差", "质量结果类、缺陷类、包络线公差类、末端力公差类"],
      ["控制诊断", "RRC启用、RRC偏差、PECV2 activated", "RRC参数类、PECV2状态类"],
    ],
    [280, 640, 630],
    { size: 18, rowHeight: 68 },
  ),
], { section: "字段映射" }));

page += 1; push(addSlide(p, page, "十二、规则层补充建议", [
  blueTable(
    ["规则", "触发依据", "当前状态"],
    [
      ["曲线高于包络线判定", "故障代码出现“铆接曲线高于包络线”，且记录具有曲线与包络线对象", "建议新增，具体算法待实现"],
      ["曲线低于包络线判定", "故障代码出现“铆接曲线低于包络线”，且记录具有曲线与包络线对象", "建议新增，具体算法待实现"],
      ["冲压行程过大判定", "故障代码中高频出现“测得得冲压行程过大”，并存在 pressStroke 字段", "建议新增，阈值待确认"],
      ["预测结果复核", "模型预测结果存在 errorRate，超过业务阈值时进入复核", "占位建议，阈值与 pre 编码待确认"],
      ["包络线公差预警", "存在包络线公差警告、故障阈值", "建议作为质量预警规则补充"],
    ],
    [340, 760, 420],
    { size: 19, rowHeight: 82 },
  ),
], { section: "规则层" }));

page += 1; push(addSlide(p, page, "十三、实例化路径", [
  row({ width: fill, height: hug, gap: 38 }, [
    column({ width: fixed(760), height: hug, gap: 18 }, [
      tx("主数据库一条记录", { size: 32, bold: true, color: C.blue }),
      chain(["过程记录", "设备", "程序", "产线", "连接点", "曲线", "预测结果"], [C.blue, C.teal, C.green, C.orange], true),
      bullets([
        "以 id/biz_id 建 SPR过程记录实例。",
        "复用或新建设备、程序、产线、SPR连接点实例。",
        "挂接原始曲线、计算后曲线、error_rate 与 pre。",
      ], { size: 22, wrap: 700, rowHeight: 56 }),
    ]),
    column({ width: fixed(760), height: hug, gap: 18 }, [
      tx("RIP_ROP 一条记录", { size: 32, bold: true, color: C.orange }),
      chain(["过程记录", "参数", "铆接曲线", "包络线", "公差", "质量结果", "RRC/PECV2"], [C.orange, C.green, C.teal, C.red], true),
      bullets([
        "记录实物编号、时间、输出、程序和流程类型。",
        "实例化实测力、行程、板厚、铆钉长度等参数。",
        "关联包络线、公差、故障代码和控制诊断状态。",
      ], { size: 22, wrap: 700, rowHeight: 56 }),
    ]),
  ]),
], { section: "实例层" }));

page += 1; push(addSlide(p, page, "十四、顶层本体补充建议", [
  tx("只有具备跨工艺复用价值的抽象建议上升到顶层；SPR 专属控制项留在 SPR 扩展层。", {
    size: 30,
    bold: true,
    width: wrap(1540),
  }),
  blueTable(
    ["建议上升顶层", "原因"],
    [
      ["在线过程记录类", "点焊、涂胶、FDS 等工艺也会产生设备采集记录"],
      ["过程数据 / 曲线数据类", "多工艺都有压力、电流、力位移、流量等时序或曲线数据"],
      ["参考曲线 / 包络线类", "可作为工艺窗口的曲线化表达"],
      ["公差阈值类", "统一参数越界、质量预警和故障阈值表达"],
      ["模型预测结果类", "支撑后续模型服务、质量预测和 Action 输出"],
      ["数据处理过程类", "追溯原始数据到计算后数据的处理方法"],
    ],
    [400, 1030],
    { size: 21, rowHeight: 68 },
  ),
], { section: "顶层建议" }));

page += 1; push(addSlide(p, page, "十五、待确认问题", [
  blueTable(
    ["优先级", "待确认问题", "当前建模处理"],
    [
      ["高", "pre 中 0、1、3 的业务含义，是否对应合格/异常/其他类别", "暂作为 predictionCategory 编码，不直接推断质量状态"],
      ["高", "error_rate 中 88.040、99.990、95.700 等异常大值的口径", "保留原值并标记为需确认，不做阈值规则"],
      ["高", "original_data 与 calculate_data 的计算方式、缩放关系和单位", "建立处理前后关系，计算方法待补充"],
      ["中", "carbody_id / 车身标识是否需要新增车身对象", "先作为过程记录属性保留"],
      ["中", "RRC、PECV2、JIC dVal 的真实业务含义", "暂建 SPR 专属参数/状态类，不上升顶层"],
    ],
    [170, 790, 560],
    { size: 19, rowHeight: 76 },
  ),
], { section: "待确认" }));

page += 1; push(addSlide(p, page, "十六、下一步计划", [
  chain(["业务口径确认", "修订 v0.3", "转 OWL/RDF 或图 Schema", "样例实例化", "本体组复审", "接入 Action/模型输出"]),
  blueTable(
    ["阶段", "具体工作"],
    [
      ["短期", "确认 pre、error_rate、曲线缩放、车身对象、RRC/PECV2 等关键口径"],
      ["中期", "把文档方案转成可执行本体文件或图数据库 Schema，并用 5-10 条样例记录验证实例化链路"],
      ["后续", "与本体组确认哪些概念上升顶层，哪些保持 SPR 专属扩展"],
      ["面向应用", "将质量判定、预测结果和待复核规则接入后续 Action 或模型服务输出"],
    ],
    [250, 1150],
    { size: 22, rowHeight: 74 },
  ),
], { section: "计划" }));

page += 1; push(addSlide(p, page, "汇报结论", [
  tx("本次更新的价值：", { size: 34, bold: true, color: C.blue }),
  tx("在不改变原 SPR 本体主骨架的前提下，补齐了真实生产过程数据接入所需的语义层。", {
    size: 52,
    bold: true,
    color: C.ink,
    width: wrap(1500),
  }),
  bullets([
    "数据库字段已经可以逐项映射到本体类、属性、关系或待确认项。",
    "曲线、包络线、公差和预测结果被对象化，为后续质量判定和模型调用提供结构基础。",
    "下一步重点是业务口径确认与样例实例化验证。",
  ], { size: 28, rowHeight: 68 }),
], { section: "结论" }));

const pptxBlob = await PresentationFile.exportPptx(p);
await pptxBlob.save(PPTX_PATH);

const previewPaths = [];
for (let i = 0; i < slides.length; i++) {
  const blob = await slides[i].export({ format: "png", scale: 1 });
  const buffer = Buffer.from(await blob.arrayBuffer());
  const out = path.join(SCRATCH_DIR, `slide-${String(i + 1).padStart(2, "0")}.png`);
  await fs.writeFile(out, buffer);
  previewPaths.push(out);
}

await fs.writeFile(
  path.join(SCRATCH_DIR, "build-report.json"),
  JSON.stringify({
    sourceLength: source.length,
    pptxPath: PPTX_PATH,
    previewDir: SCRATCH_DIR,
    slideCount: slides.length,
    previewPaths,
  }, null, 2),
  "utf8",
);

console.log(JSON.stringify({
  pptxPath: PPTX_PATH,
  previewDir: SCRATCH_DIR,
  slideCount: slides.length,
}, null, 2));
