type TopStatus = "stable" | "candidate";
type ReviewStatus = "pending" | "approved" | "rejected";
type MappingRelation = "subclass-of" | "belongs-to" | "candidate-extension";
type EdgeType = "inherits" | "objectProperty" | "dataProperty" | "mapsTo" | "derivedFrom" | "subclass-of";
type SourceEndpointLabel = "Source" | "Target" | "Label" | "Type";

type SprLayer = "all" | "spr-core" | "spr-extension" | "spr-data" | "spr-rule";

const topStatusLabels: Record<TopStatus, string> = {
  stable: "稳定类",
  candidate: "候选补充"
};

const reviewStatusLabels: Record<ReviewStatus, string> = {
  pending: "待复核",
  approved: "已通过",
  rejected: "已退回"
};

const mappingRelationLabels: Record<MappingRelation, string> = {
  "subclass-of": "继承自",
  "belongs-to": "归属于",
  "candidate-extension": "候选扩展"
};

const edgeTypeLabels: Record<EdgeType, string> = {
  inherits: "继承关系",
  objectProperty: "对象属性",
  dataProperty: "数据属性",
  mapsTo: "映射到",
  derivedFrom: "派生自",
  "subclass-of": "子类继承"
};

const sourceEndpointLabels: Record<SourceEndpointLabel, string> = {
  Source: "起点节点",
  Target: "终点节点",
  Label: "关系名称",
  Type: "关系类型"
};

const sprLayerLabels: Record<SprLayer, string> = {
  all: "全部",
  "spr-core": "核心类",
  "spr-extension": "扩展类",
  "spr-data": "数据类",
  "spr-rule": "规则类"
};

const relationLabelMap: Record<string, string> = {
  ...mappingRelationLabels,
  evaluatedByEnvelope: "由包络线判定",
  hasCalculatedCurve: "包含计算后曲线",
  hasCurveData: "包含曲线数据",
  hasDefect: "关联缺陷",
  hasEnvelopeCurve: "包含包络线",
  hasEquipment: "关联设备",
  hasJoint: "关联连接点",
  hasOnlineParameter: "包含在线参数",
  hasOriginalCurve: "包含原始曲线",
  hasPECV2State: "包含 PECV2 状态",
  hasParameter: "包含参数",
  hasPredictionResult: "包含预测结果",
  hasQualityResult: "包含质量结果",
  hasRRCParameter: "包含 RRC 参数",
  hasRivetingCurve: "包含铆接曲线",
  hasRootCause: "关联根因",
  hasStation: "关联工位",
  hasToleranceLimit: "包含公差阈值",
  infers: "推断出",
  recordedAtLine: "记录于产线",
  recordedByDevice: "由设备记录",
  recordedWithProgram: "使用程序记录",
  recordsJoint: "记录连接点",
  runsProgram: "运行程序",
  hasRelation: "关联关系"
};

const apiErrorLabels: Record<string, string> = {
  "method not allowed": "请求方法不被允许，请刷新页面后重试。",
  unauthorized: "认证失败，请检查管理员令牌。",
  "ADMIN_TOKEN is not configured": "管理员令牌尚未配置，请先在 Worker 中设置 ADMIN_TOKEN。",
  "ontology D1 binding is not configured": "云端本体存储尚未配置，请先完成 Worker 绑定配置。",
  "record not found": "没有找到对应的过程记录。",
  "curves not found": "没有找到对应的曲线数据。",
  "hierarchy path not found": "没有找到对应的层级追溯路径。",
  "ontology validation failed": "本体文档校验失败，请检查上传的 JSON。",
  "operations must be an array": "本体操作格式不正确，请刷新后重试。",
  "ontology version not found": "没有找到要恢复的本体版本。",
  "recordId is required": "请先选择一条过程记录。",
  "reviewStatus must be pending, approved, or rejected": "复核状态只能是待复核、已通过或已退回。",
  "rule candidate not found": "没有找到对应的规则候选。",
  "candidateIds must be a non-empty array": "请至少选择一条已通过的规则候选。",
  "one or more rule candidates were not found": "部分规则候选不存在，请刷新复核队列。"
};

export function labelTopStatus(value: string | undefined): string {
  return value && value in topStatusLabels ? topStatusLabels[value as TopStatus] : value ?? "未标记";
}

export function labelReviewStatus(value: string | undefined): string {
  return value && value in reviewStatusLabels ? reviewStatusLabels[value as ReviewStatus] : value ?? "未知状态";
}

export function labelMappingRelation(value: string | undefined): string {
  return value && value in mappingRelationLabels ? mappingRelationLabels[value as MappingRelation] : value ?? "未选择映射";
}

export function labelEdgeType(value: string | undefined): string {
  return value && value in edgeTypeLabels ? edgeTypeLabels[value as EdgeType] : value ?? "未选择类型";
}

export function labelSprLayer(value: string | undefined): string {
  return value && value in sprLayerLabels ? sprLayerLabels[value as SprLayer] : value ?? "未标记层级";
}

export function labelRelation(value: string | undefined): string {
  return value && value in relationLabelMap ? relationLabelMap[value] : value ?? "未命名关系";
}

export function labelSourceEndpoint(value: string): string {
  return value in sourceEndpointLabels ? sourceEndpointLabels[value as SourceEndpointLabel] : value;
}

export function labelApiError(error: string | undefined, status?: number): string {
  if (error && error in apiErrorLabels) return apiErrorLabels[error];
  if (error?.startsWith("rule candidate is not approved:")) {
    return `规则候选尚未通过复核：${error.replace("rule candidate is not approved:", "").trim()}`;
  }
  if (error?.startsWith("dataset fetch failed:")) {
    return `数据集加载失败：${error.replace("dataset fetch failed:", "").trim()}`;
  }
  if (error?.startsWith("stored ontology is invalid:")) {
    return `云端保存的本体文档无效：${error.replace("stored ontology is invalid:", "").trim()}`;
  }
  if (error?.startsWith("published ontology is invalid:")) {
    return `发布后的本体文档无效：${error.replace("published ontology is invalid:", "").trim()}`;
  }
  if (error && /[\u4e00-\u9fa5]/.test(error)) return error;
  return `Worker API 请求失败：${status ?? "未知状态"}`;
}
