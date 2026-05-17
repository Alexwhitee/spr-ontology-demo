type SelectionClassPlanInput = {
  selectedId?: string;
  highlightedIds?: string[];
  highlightedEdgeIds?: string[];
  edgeConnections?: Record<string, readonly [string, string] | string[]>;
};

type SelectionClassPlan = {
  selectedIds: string[];
  highlightedIds: string[];
  dimmedIds: string[];
};

type GraphDisplayNode = {
  id: string;
  label: string;
  [key: string]: unknown;
};

type GraphDisplayEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  [key: string]: unknown;
};

export function buildSelectionClassPlan({
  selectedId,
  highlightedIds = [],
  highlightedEdgeIds = [],
  edgeConnections = {}
}: SelectionClassPlanInput): SelectionClassPlan {
  const highlighted = new Set<string>(highlightedIds);

  for (const edgeId of highlightedEdgeIds) {
    highlighted.add(edgeId);
    const connected = edgeConnections[edgeId];
    if (!connected) continue;
    for (const nodeId of connected) highlighted.add(nodeId);
  }

  return {
    selectedIds: selectedId ? [selectedId] : [],
    highlightedIds: Array.from(highlighted),
    dimmedIds: []
  };
}

export function buildGraphDisplayElements<TNode extends GraphDisplayNode, TEdge extends GraphDisplayEdge>(nodes: TNode[], edges: TEdge[]) {
  return {
    nodes: nodes.map((node) => ({ data: { ...node } })),
    edges: edges.map((edge) => ({ data: { ...edge, label: labelGraphRelation(edge.label) } }))
  };
}

function labelGraphRelation(value: string): string {
  const labels: Record<string, string> = {
    "subclass-of": "继承自",
    "candidate-extension": "候选扩展",
    "belongs-to": "归属于",
    产生异常事件: "产生异常事件",
    候选根因: "候选根因",
    生成预警报告: "生成预警报告",
    识别缺陷模式: "识别缺陷模式",
    调用检测模型: "调用检测模型",
    适用于: "适用于",
    支持检测结果: "支持检测结果",
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
    runsProgram: "运行程序"
  };

  return labels[value] ?? value;
}
