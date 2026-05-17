import type { ProcessRecord } from "../types/demo";
import * as XLSX from "xlsx";

export type DatabaseImportMode = "row" | "table";
export type ImportPayloadFormat = "json" | "csv" | "sql" | "excel";

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

export type SourceTableDetection = {
  sourceTable: ProcessRecord["source"] | null;
  sourceTableName?: string;
  reason: string;
};

export type ParsedImportTable = {
  rows: Array<Record<string, unknown>>;
  detectedSourceTable: ProcessRecord["source"] | null;
  detectedSourceTableName?: string;
  detectionReason: string;
  tableName?: string;
  format: ImportPayloadFormat;
  columns: string[];
};

export type ImportRequestDraftInput = {
  mode: DatabaseImportMode;
  fallbackSourceTable: ProcessRecord["source"];
  textPayload: string;
  textFormat?: Exclude<ImportPayloadFormat, "excel">;
  parsedTable?: ParsedImportTable | null;
};

export type ImportRequestDraft = {
  sourceTable: ProcessRecord["source"];
  sourceTableName?: string;
  rows: Array<Record<string, unknown>>;
  detectedSourceTable: ProcessRecord["source"] | null;
  detectedSourceTableName?: string;
  detectionReason: string;
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
    databaseMeaning: "当前演示系统使用同一个业务数据库视图进行本体化处理，其中 main 主表和 RIP_ROP 表是两类来源表，并不是两个互不相干的系统。",
    tableMeaning: mode === "row"
      ? `新增单行必须选择目标表，本次目标表是${source.label}。因为单行数据没有完整表结构上下文，系统需要按所选表的字段口径完成标准化。`
      : "导入整张表时不需要先选择目标来源表。系统会根据文件名、Excel 工作表名、SQL 表名和字段名自动识别 main 主表、RIP_ROP 表或新增来源表；只有粘贴 JSON 数组且没有表名上下文时，才使用页面上的备用归类。",
    payloadMeaning: mode === "row"
      ? "当前模式用于新增单条数据库行，JSON 内容应为一个 JSON 对象。页面提交前会自动包装成一行数组，再触发字段识别、本体刷新、图谱重建和检测输入更新。"
      : "当前模式用于导入一批记录或一张新增表。推荐直接上传 Excel、CSV 或 SQL 文件；JSON 数组仍然保留为高级调试入口，数组中的每个对象代表数据库表中的一行。",
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

export function inferSourceTableFromRows(rows: Array<Record<string, unknown>>, tableName = ""): SourceTableDetection {
  const fields = new Set(rows.flatMap((row) => Object.keys(row).map(normalizeFieldName)));
  const normalizedTableName = tableName.toLowerCase();
  let ripRopScore = normalizedTableName.includes("rip") || normalizedTableName.includes("rop") ? 3 : 0;
  let mainScore = normalizedTableName === "main" || normalizedTableName.includes("main") ? 3 : 0;

  for (const field of fields) {
    if (["实物编号", "devicename", "日期/时间", "故障代码", "铆接曲线", "包络线", "铆钉计数器", "流程类型"].includes(field)) ripRopScore += 2;
    if (["id", "biz_id", "prog_no", "rivet_id", "line_name", "device_name", "original_data", "calculate_data", "error_rate", "pre", "origin_time"].includes(field)) mainScore += 2;
  }

  if (ripRopScore > mainScore && ripRopScore >= 2) {
    return { sourceTable: "rip_rop", reason: `根据字段或表名识别为 RIP_ROP 表，命中 ${ripRopScore} 个特征，典型字段包括故障代码、铆接曲线、包络线。` };
  }
  if (mainScore > ripRopScore && mainScore >= 2) {
    return { sourceTable: "main", reason: `根据字段或表名识别为 main 主表，命中 ${mainScore} 个特征，典型字段包括 pre、error_rate、original_data、calculate_data。` };
  }
  if (tableName.trim()) {
    return { sourceTable: "new_table", sourceTableName: tableName.trim(), reason: `未命中 main 或 RIP_ROP 的既有字段特征，系统将按“${tableName.trim()}”作为新增来源表导入，并保留原始字段等待业务确认。` };
  }
  return { sourceTable: null, reason: "未能自动识别来源表，且当前内容没有表名上下文；系统会使用备用归类作为导入兜底。若这是新增表，建议上传 Excel、CSV 或 SQL 文件，或使用带表名的 SQL INSERT。" };
}

export function parseImportText(value: string, format: Exclude<ImportPayloadFormat, "excel">, mode: DatabaseImportMode): ParsedImportTable {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("没有读取到可导入的表内容。请上传 Excel、CSV、SQL 文件，或粘贴整表文本。");
  let rows: Array<Record<string, unknown>>;
  let tableName = "";
  if (format === "json") {
    rows = normalizeImportPayload(trimmed, mode);
  } else if (format === "csv") {
    rows = parseCsvRows(trimmed);
  } else {
    const parsedSql = parseSqlInsertRows(trimmed);
    rows = parsedSql.rows;
    tableName = parsedSql.tableName;
  }
  ensureImportRows(rows);
  const detection = inferSourceTableFromRows(rows, tableName);
  return {
    rows,
    detectedSourceTable: detection.sourceTable,
    detectedSourceTableName: detection.sourceTableName,
    detectionReason: detection.reason,
    tableName,
    format,
    columns: collectColumns(rows)
  };
}

export function parseExcelWorkbook(data: ArrayBuffer | Uint8Array): ParsedImportTable {
  const workbook = XLSX.read(data, { type: "array" });
  const candidates = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
    const detection = rows.length > 0 ? inferSourceTableFromRows(rows, sheetName) : { sourceTable: null, reason: "工作表没有可导入的数据行。" };
    return { sheetName, rows, detection };
  }).filter((candidate) => candidate.rows.length > 0);
  if (candidates.length === 0) throw new Error("Excel 文件中没有可导入的数据行。");

  const selected = candidates.find((candidate) => candidate.detection.sourceTable && candidate.detection.sourceTable !== "new_table")
    ?? candidates.find((candidate) => candidate.detection.sourceTable === "new_table")
    ?? candidates[0];
  return {
    rows: selected.rows,
    detectedSourceTable: selected.detection.sourceTable,
    detectedSourceTableName: selected.detection.sourceTableName,
    detectionReason: selected.detection.reason,
    tableName: selected.sheetName,
    format: "excel",
    columns: collectColumns(selected.rows)
  };
}

export function buildImportRequestDraft(input: ImportRequestDraftInput): ImportRequestDraft {
  if (input.mode === "row") {
    return {
      sourceTable: input.fallbackSourceTable,
      rows: normalizeImportPayload(input.textPayload, "row"),
      detectedSourceTable: input.fallbackSourceTable,
      detectedSourceTableName: undefined,
      detectionReason: "新增单行模式使用用户选择的目标表。"
    };
  }
  const parsed = input.parsedTable ?? parseImportText(input.textPayload, input.textFormat ?? "json", "table");
  return {
    sourceTable: parsed.detectedSourceTable ?? input.fallbackSourceTable,
    sourceTableName: parsed.detectedSourceTable === "new_table" ? parsed.detectedSourceTableName ?? parsed.tableName : undefined,
    rows: parsed.rows,
    detectedSourceTable: parsed.detectedSourceTable,
    detectedSourceTableName: parsed.detectedSourceTableName,
    detectionReason: parsed.detectionReason
  };
}

export function inferFormatFromFileName(fileName: string): ImportPayloadFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".sql")) return "sql";
  return "json";
}

function parseCsvRows(value: string): Array<Record<string, unknown>> {
  const table = parseDelimited(value);
  const [headers, ...records] = table;
  if (!headers?.length) throw new Error("CSV 文件缺少表头行。");
  const rows = records
    .filter((record) => record.some((cell) => cell.trim().length > 0))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header.trim(), record[index] ?? ""])));
  if (rows.length === 0) throw new Error("CSV 文件只有表头，没有可导入的数据行。");
  return rows;
}

function parseDelimited(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      cell += "\"";
      index += 1;
      continue;
    }
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function parseSqlInsertRows(value: string): { tableName: string; rows: Array<Record<string, unknown>> } {
  const statements = splitSqlStatements(value).filter((statement) => /insert\s+into/i.test(statement));
  if (statements.length === 0) throw new Error("SQL 文件中没有找到 INSERT INTO 语句。");
  let tableName = "";
  const rows: Array<Record<string, unknown>> = [];
  for (const statement of statements) {
    const parsed = parseSingleSqlInsert(statement);
    if (tableName && parsed.tableName !== tableName) throw new Error("SQL 文件中包含多个不同表名；整张表导入一次只能导入一张来源表。");
    tableName = parsed.tableName;
    rows.push(...parsed.rows);
  }
  if (rows.length === 0) throw new Error("SQL 文件中没有解析到 VALUES 数据。");
  return { tableName, rows };
}

function parseSingleSqlInsert(value: string): { tableName: string; rows: Array<Record<string, unknown>> } {
  const match = value.match(/insert\s+into\s+((?:[`"']?[\w\u4e00-\u9fa5]+[`"']?\.)?[`"']?[\w\u4e00-\u9fa5]+[`"']?)\s*\(([^)]+)\)\s*values\s*([\s\S]+)$/i);
  if (!match) throw new Error("暂只支持常见 INSERT INTO table (field...) VALUES (...) 格式的 SQL 文件。");
  const [, tableName, fieldsText, valuesText] = match;
  const fields = splitSqlList(fieldsText).map((field) => stripSqlToken(field));
  const tupleTexts = extractSqlTuples(valuesText);
  const rows = tupleTexts.map((tupleText) => {
    const values = splitSqlList(tupleText).map(parseSqlValue);
    return Object.fromEntries(fields.map((field, index) => [field, values[index] ?? ""]));
  });
  if (rows.length === 0) throw new Error("SQL 文件中没有解析到 VALUES 数据。");
  return { tableName: normalizeSqlTableName(tableName), rows };
}

function splitSqlStatements(value: string): string[] {
  const statements: string[] = [];
  let quoted: "'" | "\"" | "`" | null = null;
  let current = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (!quoted && char === "-" && next === "-") {
      while (index < value.length && value[index] !== "\n") index += 1;
      continue;
    }
    if (quoted) {
      current += char;
      if (char === quoted && value[index - 1] !== "\\") quoted = null;
      continue;
    }
    if (char === "'" || char === "\"" || char === "`") {
      quoted = char;
      current += char;
      continue;
    }
    if (char === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function extractSqlTuples(value: string): string[] {
  const tuples: string[] = [];
  let quoted: "'" | "\"" | null = null;
  let depth = 0;
  let start = -1;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quoted) {
      if (char === quoted && value[index - 1] !== "\\") quoted = null;
      continue;
    }
    if (char === "'" || char === "\"") {
      quoted = char;
      continue;
    }
    if (char === "(") {
      if (depth === 0) start = index + 1;
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0 && start >= 0) tuples.push(value.slice(start, index));
    }
  }
  return tuples;
}

function splitSqlList(value: string): string[] {
  const items: string[] = [];
  let quoted: "'" | "\"" | null = null;
  let current = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quoted) {
      current += char;
      if (char === quoted && value[index - 1] !== "\\") quoted = null;
      continue;
    }
    if (char === "'" || char === "\"") {
      quoted = char;
      current += char;
      continue;
    }
    if (char === ",") {
      items.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  items.push(current.trim());
  return items;
}

function parseSqlValue(value: string): unknown {
  const trimmed = value.trim();
  if (/^null$/i.test(trimmed)) return null;
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith("\"") && trimmed.endsWith("\""))) {
    return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, "\"").replace(/''/g, "'").replace(/""/g, "\"");
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : stripSqlToken(trimmed);
}

function stripSqlToken(value: string): string {
  return value.trim().replace(/^[`"']|[`"']$/g, "");
}

function normalizeSqlTableName(value: string): string {
  const parts = value.split(".");
  return stripSqlToken(parts[parts.length - 1]);
}

function collectColumns(rows: Array<Record<string, unknown>>): string[] {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

function ensureImportRows(rows: Array<Record<string, unknown>>): void {
  if (rows.length === 0) throw new Error("没有解析到可导入的数据行。");
}

function normalizeFieldName(value: string): string {
  return value.trim().toLowerCase();
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
