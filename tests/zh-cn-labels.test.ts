import { describe, expect, it } from "vitest";
import {
  labelApiError,
  labelEdgeType,
  labelMappingRelation,
  labelReviewStatus,
  labelSourceEndpoint,
  labelTopStatus
} from "../frontend/src/i18n/zhCN";

describe("Chinese UI labels", () => {
  it("renders ontology statuses and relations in Chinese", () => {
    expect(labelTopStatus("stable")).toBe("稳定类");
    expect(labelTopStatus("candidate")).toBe("候选补充");
    expect(labelReviewStatus("pending")).toBe("待复核");
    expect(labelReviewStatus("approved")).toBe("已通过");
    expect(labelReviewStatus("rejected")).toBe("已退回");
    expect(labelMappingRelation("subclass-of")).toBe("继承自");
    expect(labelMappingRelation("belongs-to")).toBe("归属于");
    expect(labelMappingRelation("candidate-extension")).toBe("候选扩展");
    expect(labelEdgeType("objectProperty")).toBe("对象属性");
    expect(labelEdgeType("dataProperty")).toBe("数据属性");
  });

  it("keeps technical IDs visible while adding Chinese context", () => {
    expect(labelSourceEndpoint("Source")).toBe("起点节点");
    expect(labelSourceEndpoint("Target")).toBe("终点节点");
    expect(labelSourceEndpoint("Label")).toBe("关系名称");
    expect(labelSourceEndpoint("Type")).toBe("关系类型");
  });

  it("normalizes API errors into readable Chinese messages", () => {
    expect(labelApiError("method not allowed", 405)).toBe("请求方法不被允许，请刷新页面后重试。");
    expect(labelApiError("unauthorized", 401)).toBe("认证失败，请检查管理员令牌。");
    expect(labelApiError("ontology D1 binding is not configured", 503)).toBe("云端本体存储尚未配置，请先完成 Worker 绑定配置。");
    expect(labelApiError(undefined, 500)).toBe("Worker API 请求失败：500");
  });
});
