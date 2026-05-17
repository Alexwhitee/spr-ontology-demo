import type { ProcessRecord } from "../types/demo";

export type DatabaseImportMode = "row" | "table";

export type DatabaseSourceOption = {
  value: ProcessRecord["source"];
  label: string;
  shortLabel: string;
  description: string;
  expectedContent: string;
};

export type ImportGuidance = {
  databaseMeaning: string;
  tableMeaning: string;
  payloadMeaning: string;
  automationMeaning: string;
};

export const databaseSourceOptions: DatabaseSourceOption[] = [
  {
    value: "rip_rop",
    label: "RIP_ROP 表（铆接过程明细）",
    shortLabel: "RIP_ROP 表",
    description: "用于导入 SPR 铆接过程明细，字段通常包含故障代码、铆接曲线、包络线、铆钉计数器、车身标识和设备名。",
    expectedContent: "适合导入带故障代码或曲线数据的铆接过程记录。系统会优先用故障代码、曲线摘要和包络线摘要触发检测。"
  },
  {
    value: "main",
    label: "main 主表（主过程记录）",
    shortLabel: "main 主表",
    description: "用于导入主过程记录，字段通常包含 id、prog_no、rivet_id、line_name、device_name、original_data、calculate_data、error_rate 和 pre。",
    expectedContent: "适合导入已有主表记录。pre 会作为模型预测编码保守进入本体，业务含义未确认前不会被强行解释成合格或不合格。"
  }
];

export function getDatabaseSourceOption(source: ProcessRecord["source"]): DatabaseSourceOption {
  return databaseSourceOptions.find((option) => option.value === source) ?? databaseSourceOptions[0];
}

export function buildImportGuidance(mode: DatabaseImportMode, sourceTable: ProcessRecord["source"]): ImportGuidance {
  const source = getDatabaseSourceOption(sourceTable);
  return {
    databaseMeaning: "当前演示系统使用同一个业务数据库视图进行本体化处理，其中 main 主表和 RIP_ROP 表是两类来源表，并不是两个互不相干的系统。导入时先选择目标表，系统再按该表的字段口径完成标准化。",
    tableMeaning: `本次导入的目标表是${source.label}。因为 main 与 RIP_ROP 的字段含义不同，新增数据库行时必须选择目标表；如果导入的是整张表，也要先说明这张表属于哪一种来源结构。`,
    payloadMeaning: mode === "row"
      ? "当前模式用于新增单条数据库行，JSON 内容应为一个 JSON 对象。页面提交前会自动包装成一行数组，再触发字段识别、本体刷新、图谱重建和检测输入更新。"
      : "当前模式用于导入一批记录或一张新增表，JSON 内容必须是 JSON 数组，数组中的每个对象代表数据库表中的一行。",
    automationMeaning: "导入后系统会把原始字段转换为 ProcessRecord，自动补齐新增字段映射，更新记录统计和 SPR 过程记录实例数，重建图谱，并把第一条新增记录设为检测流程的当前输入。"
  };
}

export function normalizeImportPayload(value: string, mode: DatabaseImportMode): Array<Record<string, unknown>> {
  const parsed = JSON.parse(value) as unknown;
  if (mode === "row") {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("新增单行模式需要输入一个 JSON 对象，表示一条数据库行。");
    }
    return [parsed as Record<string, unknown>];
  }
  if (!Array.isArray(parsed) || parsed.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error("导入整张表模式需要输入 JSON 数组，数组中的每一项是一条数据库行对象。");
  }
  return parsed as Array<Record<string, unknown>>;
}

export function defaultImportPayload(mode: DatabaseImportMode, sourceTable: ProcessRecord["source"]): string {
  const rows = sourceTable === "rip_rop" ? ripRopExampleRows : mainExampleRows;
  return JSON.stringify(mode === "row" ? rows[0] : rows, null, 2);
}

const ripRopExampleRows = [
  {
    "实物编号": "new-001",
    Devicename: "RIVETER-01",
    "车身标识": "BODY-001",
    "日期/时间": "2026/5/17 12:00:00",
    "程序": "NietProg.New",
    "铆钉计数器": "9001",
    "故障代码": "DDC: 铆接曲线高于包络线",
    "铆接曲线": "1,2,6,9,12",
    "包络线": "1,2,3,4,5"
  },
  {
    "实物编号": "new-002",
    Devicename: "RIVETER-02",
    "车身标识": "BODY-002",
    "日期/时间": "2026/5/17 12:05:00",
    "程序": "NietProg.New",
    "铆钉计数器": "9002",
    "故障代码": "DDC: 测得得冲压行程过大",
    "铆接曲线": "1,3,5,7,9",
    "包络线": "1,2,4,6,8"
  }
];

const mainExampleRows = [
  {
    id: "new-main-001",
    prog_no: "P-01",
    rivet_id: "R-1001",
    carbody_id: "BODY-001",
    line_name: "RC",
    device_name: "RC050R02",
    original_data: "13,18,21,30,42",
    calculate_data: "13,18,22,31,43",
    error_rate: "0.012",
    pre: "1.000",
    origin_time: "2026-05-17 12:00:00"
  },
  {
    id: "new-main-002",
    prog_no: "P-02",
    rivet_id: "R-1002",
    carbody_id: "BODY-002",
    line_name: "RC",
    device_name: "RC050R03",
    original_data: "11,16,24,35,50",
    calculate_data: "11,15,20,30,45",
    error_rate: "0.084",
    pre: "3.000",
    origin_time: "2026-05-17 12:05:00"
  }
];
