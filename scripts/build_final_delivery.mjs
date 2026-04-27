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
  auto,
} from "@oai/artifact-tool";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "output");
const SCRATCH_DIR = path.join(ROOT, "scratch", "ppt-preview");

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.mkdir(SCRATCH_DIR, { recursive: true });

const finalDocPath = path.join(ROOT, "SPR本体更新最终交付文档.md");
const pptxPath = path.join(ROOT, "SPR本体更新工作汇报.pptx");

const sourceDocs = [
  ["任务说明", "SPR本体更新任务说明.md"],
  ["更新版 SPR 本体方案", "SPR本体更新版_v0.3.md"],
  ["数据库字段到本体映射表", "SPR数据库字段到本体映射表.md"],
  ["本体变更记录", "SPR本体变更记录.md"],
  ["顶层工艺本体补充建议", "顶层工艺本体补充建议.md"],
  ["待确认问题清单", "SPR本体待确认问题清单.md"],
  ["汇报 PPT 提纲", "SPR本体更新汇报PPT提纲.md"],
  ["交付物索引", "SPR本体更新交付物索引.md"],
];

function stripFrontmatter(markdown) {
  return markdown.replace(/^---\n[\s\S]*?\n---\n+/, "").trim();
}

async function buildFinalMarkdown() {
  const sections = [];
  for (const [label, filename] of sourceDocs) {
    const content = stripFrontmatter(await fs.readFile(path.join(ROOT, filename), "utf8"));
    sections.push(`---\n\n# ${label}\n\n> 来源文件：\`${filename}\`\n\n${content}`);
  }

  const body = `---\ntitle: SPR 本体更新最终交付文档\ndate: 2026-04-24\nsummary: 汇总 SPR 本体更新任务说明、更新版本体方案、字段映射表、变更记录、顶层补充建议、待确认问题和汇报提纲。\nsource_files:\n${sourceDocs.map(([, file]) => `  - ${file}`).join("\n")}\n---\n\n# SPR 本体更新最终交付文档\n\n## 文档说明\n\n本文档是本次 SPR 本体更新工作的最终汇总版，完整收录前面生成的任务说明、更新版本体方案、字段映射表、变更记录、顶层补充建议、待确认问题清单、汇报 PPT 提纲和交付物索引。\n\n## 最终交付文件\n\n| 文件 | 用途 |\n| --- | --- |\n| \`SPR本体更新最终交付文档.md\` | 包含所有完整内容的最终交付文档 |\n| \`SPR本体更新工作汇报.pptx\` | 汇报本次做了哪些工作的 PowerPoint 文件 |\n\n## 核心结论\n\n本次更新在保持 \`工艺本体v2.md\` 既有 SPR 核心实体、关系、规则和 Action 主链路不变的前提下，依据数据库字段补充了在线过程记录、曲线/包络线、预测判定、系统时间、RRC/PECV2 和公差阈值等数据映射能力。主数据库 16 个字段与 RIP_ROP 42 个字段均已纳入映射。\n\n${sections.join("\n\n")}\n`;

  await fs.writeFile(finalDocPath, body, "utf8");
}

const C = {
  bg: "#F7F5EF",
  ink: "#17212B",
  muted: "#64717D",
  teal: "#0E7C7B",
  tealDark: "#075E5D",
  blue: "#2B5C9E",
  amber: "#D9942D",
  red: "#B9504B",
  line: "#D9D2C3",
  white: "#FFFFFF",
  paleTeal: "#DCEDEA",
  paleAmber: "#F1DEC0",
};

const font = "PingFang SC";

function tx(value, opts = {}) {
  return text(value, {
    width: opts.width ?? fill,
    height: opts.height ?? hug,
    name: opts.name,
    style: {
      fontFamily: font,
      fontSize: opts.size ?? 30,
      bold: opts.bold ?? false,
      color: opts.color ?? C.ink,
      italic: opts.italic ?? false,
      ...opts.style,
    },
  });
}

function bg() {
  return shape({ name: "background", width: fill, height: fill, fill: C.bg });
}

function footer(label = "SPR 本体更新工作汇报 · 2026-04-24") {
  return text(label, {
    name: "footer",
    width: fixed(1760),
    height: hug,
    style: { fontFamily: font, fontSize: 16, color: "#8B8275" },
  });
}

function slideFrame(slide, content, opts = {}) {
  slide.compose(
    layers({ name: "slide-layers", width: fill, height: fill }, [
      bg(),
      ...(opts.extraBg ?? []),
      column(
        {
          name: "content-root",
          width: fill,
          height: fill,
          padding: { x: 96, y: 70 },
          gap: opts.gap ?? 28,
        },
        [
          column(
            {
              name: "content-body",
              width: fill,
              height: fill,
              gap: opts.gap ?? 28,
            },
            content,
          ),
          footer(opts.footer),
        ],
      ),
    ]),
    { frame: { left: 0, top: 0, width: 1920, height: 1080 }, baseUnit: 8 },
  );
}

function titleBlock(title, subtitle, kicker = "工作汇报") {
  return column({ name: "title-block", width: fill, height: hug, gap: 14 }, [
    tx(kicker, { size: 20, bold: true, color: C.teal, style: { letterSpacing: 1.5 } }),
    tx(title, { size: 58, bold: true, color: C.ink, width: wrap(1500) }),
    subtitle ? tx(subtitle, { size: 25, color: C.muted, width: wrap(1320) }) : null,
    rule({ name: "title-rule", width: fixed(180), stroke: C.teal, weight: 5 }),
  ].filter(Boolean));
}

function bullets(items, opts = {}) {
  return column(
    { name: opts.name ?? "bullets", width: fill, height: hug, gap: opts.gap ?? 18 },
    items.map((item, idx) => {
      const rowHeight = opts.rowHeight ?? (item.length > 34 ? 72 : 44);
      return row({ name: `bullet-${idx}`, width: fill, height: fixed(rowHeight), gap: 14, alignItems: "start" }, [
        shape({ width: fixed(10), height: fixed(10), fill: opts.color ?? C.teal, borderRadius: "rounded-full" }),
        tx(item, {
          size: opts.size ?? 25,
          color: opts.textColor ?? C.ink,
          width: wrap(opts.wrap ?? 1260),
          height: fixed(rowHeight),
        }),
      ]);
    }),
  );
}

function metric(value, label, color = C.teal) {
  return column({ name: `metric-${label}`, width: fill, height: hug, gap: 4 }, [
    tx(value, { size: 74, bold: true, color }),
    tx(label, { size: 22, color: C.muted }),
  ]);
}

function tableBlock(headers, rows, widths, opts = {}) {
  const columns = widths.map((w) => fixed(w));
  const header = grid(
    { name: "table-header", width: fill, height: hug, columns, columnGap: 18, padding: { y: 10 } },
    headers.map((h) => tx(h, { size: opts.headerSize ?? 20, bold: true, color: C.tealDark, width: fill })),
  );
  const body = rows.flatMap((r, idx) => [
    grid(
      { name: `table-row-${idx}`, width: fill, height: hug, columns, columnGap: 18, padding: { y: 9 } },
      r.map((cell, cidx) =>
        tx(cell, {
          size: opts.size ?? 18,
          color: cidx === 0 ? C.ink : C.muted,
          bold: cidx === 0 && opts.boldFirst !== false,
          width: fill,
        }),
      ),
    ),
    rule({ name: `table-rule-${idx}`, width: fill, stroke: C.line, weight: 1 }),
  ]);
  return column({ name: opts.name ?? "table", width: fill, height: hug, gap: 0 }, [
    header,
    rule({ name: "table-top-rule", width: fill, stroke: C.teal, weight: 3 }),
    ...body,
  ]);
}

function pill(textValue, color = C.teal, width = 280) {
  return row(
    { name: `pill-${textValue}`, width: fixed(width), height: fixed(48), alignItems: "center", justifyContent: "center" },
    [
      shape({ width: fixed(width), height: fixed(48), fill: color, borderRadius: "rounded-full" }),
      tx(textValue, { size: 20, bold: true, color: C.white, width: fixed(width - 24), style: { textAlign: "center" } }),
    ],
  );
}

function chain(items, colors = [C.teal, C.blue, C.amber]) {
  const children = [];
  items.forEach((item, idx) => {
    children.push(
      column({ width: fixed(178), height: hug, gap: 10, alignItems: "center" }, [
        shape({ width: fixed(64), height: fixed(64), fill: colors[idx % colors.length], borderRadius: "rounded-full" }),
        tx(item, { size: 18, bold: true, color: C.ink, width: fixed(178), style: { textAlign: "center" } }),
      ]),
    );
    if (idx < items.length - 1) {
      children.push(tx("→", { size: 34, bold: true, color: C.line, width: fixed(34), style: { textAlign: "center" } }));
    }
  });
  return row({ name: "chain", width: fill, height: hug, gap: 4, alignItems: "center", justifyContent: "center" }, children);
}

async function buildDeck() {
  const p = Presentation.create({ slideSize: { width: 1920, height: 1080 } });
  const slides = [];
  const addSlide = () => {
    const slide = p.slides.add();
    slides.push(slide);
    return slide;
  };

  // Orientation/design notes for this work deck:
  // requestClass=full deck; topic=SPR ontology update work report; audience=coworkers/operators;
  // tone=trustworthy/technical; mode=work/structured; slide count=14; density=medium;
  // visual system=open typography, restrained tables, native diagrams; avoid generic card grids.

  let s = addSlide();
  s.compose(
    row({ name: "cover-root", width: fill, height: fill }, [
      layers({ name: "cover-side", width: fixed(560), height: fill }, [
        shape({ name: "cover-band", width: fill, height: fill, fill: C.teal }),
        shape({ name: "cover-accent", width: fixed(20), height: fill, fill: C.amber }),
        column({ name: "cover-side-copy", width: fill, height: fill, padding: { x: 58, y: 84 }, gap: 22 }, [
          tx("最终输出", { size: 28, bold: true, color: C.white, width: wrap(360) }),
          tx("完整交付文档 + 工作汇报 PPT", { size: 42, bold: true, color: C.white, width: wrap(390) }),
          rule({ width: fixed(180), stroke: C.white, weight: 4 }),
          tx("2026-04-24", { size: 24, color: "#D5EFEC" }),
        ]),
      ]),
      column({ name: "cover-main", width: fill, height: fill, padding: { x: 96, y: 92 }, gap: 34 }, [
        tx("SPR 本体更新", { size: 96, bold: true, color: C.ink, width: wrap(1120) }),
        tx("工作汇报", { size: 96, bold: true, color: C.ink, width: wrap(1120) }),
        rule({ width: fixed(260), stroke: C.teal, weight: 6 }),
        tx("从数据库字段到可落地本体扩展", { size: 34, color: C.muted, width: wrap(900) }),
        row({ width: fill, height: hug, gap: 54 }, [
          metric("16", "主数据库字段", C.teal),
          metric("42", "RIP_ROP 字段", C.blue),
          metric("v0.3", "更新版本体方案", C.amber),
        ]),
      ]),
    ]),
    { frame: { left: 0, top: 0, width: 1920, height: 1080 }, baseUnit: 8 },
  );

  s = addSlide();
  slideFrame(s, [
    titleBlock("这次完成了什么", "把分散的任务说明、数据字段和本体方案收束成可交付的设计包。"),
    row({ width: fill, height: hug, gap: 70 }, [
      metric("1", "最终完整交付文档", C.teal),
      metric("1", "汇报 PPTX", C.blue),
      metric("7", "中间交付物被整合", C.amber),
    ]),
    bullets([
      "完成主数据库 16 字段和 RIP_ROP 42 字段的字段级本体映射。",
      "形成 SPR 本体更新版 v0.3，明确新增类、属性、关系、规则和实例化路径。",
      "整理变更记录、顶层补充建议和待确认问题，方便后续沟通与落地。",
    ], { size: 27, wrap: 1420 }),
  ]);

  s = addSlide();
  slideFrame(s, [
    titleBlock("输入材料被分成三类", "先确认现有本体，再读取数据库字段，最后按顶层继承约束收口。"),
    tableBlock(
      ["材料类型", "具体文件", "作用"],
      [
        ["任务与背景", "1.txt、SPR本体更新任务说明.md", "明确师兄要求、交付目标和边界"],
        ["本体依据", "工艺本体v2.md、顶层工艺本体建设方案_v0.2.md", "确认保留主链路与顶层继承原则"],
        ["数据依据", "pmc_body_shop_prod…xlsx、spr data2(1).xlsx", "抽取字段、取值特征和本体映射来源"],
      ],
      [300, 650, 620],
      { size: 22, headerSize: 23 },
    ),
  ]);

  s = addSlide();
  slideFrame(s, [
    titleBlock("执行路径", "工作不是只汇总文字，而是从字段统计一路落到本体结构。"),
    chain(["读取任务", "复核本体", "统计字段", "建立映射", "更新本体", "形成交付"], [C.teal, C.blue, C.amber]),
    bullets([
      "先确认原 SPR 本体已有的“连接点-工位-设备-程序-参数-质量”主链路。",
      "再判断数据库字段是由现有类承载、补属性、建扩展类，还是暂需确认。",
      "最后把结果固化为最终文档和汇报 PPT。",
    ], { size: 25, wrap: 1380 }),
  ]);

  s = addSlide();
  slideFrame(s, [
    titleBlock("关键原则：主链路不重构", "顶层方案明确要求保持现有 SPR 本体内部定义不变，本次只补数据接入能力。"),
    chain(["SPR连接点", "工位", "设备", "程序", "参数", "质量结果", "缺陷/根因"], [C.teal, C.tealDark, C.blue]),
    tableBlock(
      ["保留内容", "本次补充"],
      [
        ["产线、工位、设备、程序等核心实体", "在线过程记录类"],
        ["SPR连接点、铆钉、铆模、材料等主数据", "曲线、计算后曲线、包络线"],
        ["工艺参数、质量结果、缺陷、根因链路", "预测结果、误差率、RRC/PECV2、公差阈值"],
      ],
      [680, 820],
      { size: 22, headerSize: 24 },
    ),
  ]);

  s = addSlide();
  slideFrame(s, [
    titleBlock("字段映射完成情况", "两个 Excel 的字段都已逐项覆盖，没有遗漏。"),
    row({ width: fill, height: hug, gap: 80 }, [
      metric("16/16", "主数据库字段已映射", C.teal),
      metric("42/42", "RIP_ROP 字段已映射", C.blue),
      metric("4 类", "处理状态", C.amber),
    ]),
    tableBlock(
      ["处理状态", "代表字段", "处理方式"],
      [
        ["已有类可承载", "line_name、device_name、prog_no、rivet_id", "映射到产线、设备、程序、SPR连接点"],
        ["需补属性", "钢板厚度、铆钉长度、铆接线最大力", "补到材料、铆钉、工艺参数类"],
        ["需新增扩展类", "id、biz_id、original_data、calculate_data、包络线", "新增过程记录、曲线、包络线类"],
        ["需确认", "pre、JIC dVal、RRC、PECV2", "保守建模并进入待确认清单"],
      ],
      [260, 570, 620],
      { size: 20, headerSize: 22 },
    ),
  ]);

  s = addSlide();
  slideFrame(s, [
    titleBlock("新增 SPR过程记录类", "用一个记录层承载数据库每一行，避免污染主数据类。"),
    row({ width: fill, height: hug, gap: 80, alignItems: "center" }, [
      column({ width: fixed(620), height: hug, gap: 18 }, [
        tx("SPR过程记录类", { size: 50, bold: true, color: C.teal }),
        tx("承载 id、biz_id、采集时间、消费时间、创建/更新时间、删除标记、车身标识等在线记录元信息。", { size: 27, color: C.muted, width: wrap(590) }),
      ]),
      chain(["设备", "过程记录", "程序", "连接点"], [C.blue, C.teal, C.amber]),
    ]),
    bullets([
      "主数据库每条记录都可以生成一个 SPR过程记录实例。",
      "过程记录再关联设备、程序、产线和 SPR 连接点。",
    ], { size: 25, wrap: 1300 }),
  ]);

  s = addSlide();
  slideFrame(s, [
    titleBlock("新增曲线与包络线层", "把长序列字段对象化，为后续质量判定和模型输入留出结构。"),
    tableBlock(
      ["新增对象", "对应字段", "作用"],
      [
        ["原始曲线类", "original_data", "保留设备采集或原始浮点序列"],
        ["计算后曲线类", "calculate_data", "记录处理后、保留精度的曲线"],
        ["铆接曲线类", "铆接曲线", "承载 RIP_ROP 中的实际过程曲线"],
        ["包络线类", "包络线、包络线最大力、分辨率", "作为曲线越界判定参考"],
        ["包络线公差类", "公差警告、公差故障", "支持预警和故障阈值"],
      ],
      [320, 520, 650],
      { size: 20, headerSize: 22 },
    ),
  ]);

  s = addSlide();
  slideFrame(s, [
    titleBlock("质量与预测结果被纳入统一表达", "把 error_rate、pre 和故障代码放入质量结果/模型预测结果链路。"),
    row({ width: fill, height: hug, gap: 70 }, [
      column({ width: fixed(700), height: hug, gap: 20 }, [
        tx("三类新增表达", { size: 36, bold: true, color: C.ink }),
        bullets([
          "error_rate → 误差率 / 异常率。",
          "pre → 预测类别编码。",
          "故障代码 → 原始故障文案 + 缺陷模式候选。",
        ], { size: 24, wrap: 640 }),
      ]),
      tableBlock(
        ["故障候选", "来源"],
        [
          ["冲压行程过大", "DDC: 测得得冲压行程过大"],
          ["曲线高于包络线", "DDC: 铆接曲线高于包络线"],
          ["曲线低于包络线", "DDC: 铆接曲线低于包络线"],
        ],
        [320, 520],
        { size: 20, headerSize: 22 },
      ),
    ]),
  ]);

  s = addSlide();
  slideFrame(s, [
    titleBlock("顶层本体也得到候选补充", "只把跨工艺通用的新抽象上升为顶层建议，RRC/PECV2 暂留 SPR 专属。"),
    tableBlock(
      ["顶层候选概念", "为什么有复用价值"],
      [
        ["在线过程记录类", "点焊、涂胶、FDS 等也会产生设备采集记录"],
        ["过程数据 / 曲线数据类", "多工艺都有时序、压力、电流、流量或力位移曲线"],
        ["参考曲线 / 包络线类", "可作为工艺窗口的曲线化表达"],
        ["公差阈值类", "统一参数越界、质量预警和故障阈值"],
        ["模型预测结果类", "支撑后续模型服务和 Action 输出"],
        ["数据处理过程类", "追溯原始数据到计算后数据的处理方法"],
      ],
      [420, 950],
      { size: 21, headerSize: 23 },
    ),
  ]);

  s = addSlide();
  slideFrame(s, [
    titleBlock("最终生成了哪些文件", "中间文件被汇总，最终交付收束为一份完整文档和一份 PPT。"),
    tableBlock(
      ["文件", "用途"],
      [
        ["SPR本体更新最终交付文档.md", "包含全部完整内容的最终交付文档"],
        ["SPR本体更新工作汇报.pptx", "本次工作汇报用 PowerPoint"],
        ["SPR本体更新版_v0.3.md", "更新版本体方案"],
        ["SPR数据库字段到本体映射表.md", "字段到本体类/属性的详细映射"],
        ["SPR本体变更记录.md", "新增类、属性、关系和规则清单"],
        ["SPR本体待确认问题清单.md", "后续沟通问题"],
      ],
      [520, 850],
      { size: 20, headerSize: 22 },
    ),
  ]);

  s = addSlide();
  slideFrame(s, [
    titleBlock("待确认问题被分级整理", "不确定字段没有强行解释，而是作为后续沟通清单。"),
    tableBlock(
      ["优先级", "问题", "当前处理"],
      [
        ["高", "pre 的 0、1、3 含义", "暂作为预测类别编码"],
        ["高", "error_rate 大于 1 的值", "暂保留原值，标注异常大值"],
        ["高", "original_data 与 calculate_data 的处理关系", "暂建处理前后关系"],
        ["中", "carbody_id 是否需要车身类", "暂放过程记录属性"],
        ["中", "RRC/PECV2 的业务含义", "暂作为 SPR 专属扩展"],
      ],
      [180, 640, 520],
      { size: 20, headerSize: 22 },
    ),
  ]);

  s = addSlide();
  slideFrame(s, [
    titleBlock("下一步建议", "从文档方案走向可执行本体，需要先完成字段口径确认。"),
    chain(["确认编码", "修正映射", "转换 Schema", "实例化样例", "审查顶层补充"], [C.teal, C.blue, C.amber]),
    bullets([
      "优先确认 pre、error_rate、曲线处理方式、车身对象口径和 RRC/PECV2 含义。",
      "再将 v0.3 文档转为 OWL/RDF 或图数据库 Schema。",
      "用 5-10 条样例记录实例化验证链路，再决定哪些内容上升到顶层本体。",
    ], { size: 25, wrap: 1380 }),
  ]);

  s = addSlide();
  slideFrame(s, [
    titleBlock("一句话结论", "这次更新让 SPR 本体从静态工艺知识模型，扩展到能接入真实生产过程数据的语义模型。"),
    tx("保留主链路，补齐在线数据入口。", { size: 84, bold: true, color: C.teal, width: wrap(1300) }),
    tx("数据库字段、曲线/包络线、预测判定和系统时间现在都有明确的本体承载位置。", { size: 34, color: C.muted, width: wrap(1280) }),
  ]);

  const pptxBlob = await PresentationFile.exportPptx(p);
  await pptxBlob.save(pptxPath);

  const previewPaths = [];
  for (let i = 0; i < slides.length; i++) {
    const blob = await slides[i].export({ format: "png", scale: 1 });
    const buffer = Buffer.from(await blob.arrayBuffer());
    const out = path.join(SCRATCH_DIR, `slide-${String(i + 1).padStart(2, "0")}.png`);
    await fs.writeFile(out, buffer);
    previewPaths.push(out);
  }

  return previewPaths;
}

await buildFinalMarkdown();
const previewPaths = await buildDeck();

console.log(JSON.stringify({
  finalDocPath,
  pptxPath,
  previewDir: SCRATCH_DIR,
  previewCount: previewPaths.length,
}, null, 2));
