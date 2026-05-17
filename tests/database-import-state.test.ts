import { describe, expect, it } from "vitest";
import {
  buildImportGuidance,
  databaseSourceOptions,
  defaultImportPayload,
  normalizeImportPayload
} from "../frontend/src/app/databaseImportState";

describe("database import presentation state", () => {
  it("explains that main and RIP_ROP are source tables in one business dataset", () => {
    expect(databaseSourceOptions.map((option) => option.value)).toEqual(["rip_rop", "main"]);
    expect(databaseSourceOptions[0].label).toContain("RIP_ROP 表");
    expect(databaseSourceOptions[0].description).toContain("铆接过程");
    expect(databaseSourceOptions[1].label).toContain("main 主表");
    expect(databaseSourceOptions[1].description).toContain("pre");

    const guidance = buildImportGuidance("row", "rip_rop");
    expect(guidance.databaseMeaning).toContain("同一个业务数据库");
    expect(guidance.tableMeaning).toContain("必须选择目标表");
    expect(guidance.payloadMeaning).toContain("JSON 对象");
  });

  it("normalizes a single-row JSON object and a full-table JSON array by import mode", () => {
    expect(normalizeImportPayload(defaultImportPayload("row", "rip_rop"), "row")).toHaveLength(1);
    expect(normalizeImportPayload(defaultImportPayload("table", "main"), "table")).toHaveLength(2);
    expect(() => normalizeImportPayload("{\"id\":\"one\"}", "table")).toThrow("JSON 数组");
    expect(() => normalizeImportPayload("[{\"id\":\"one\"},{\"id\":\"two\"}]", "row")).toThrow("一条数据库行");
  });
});
