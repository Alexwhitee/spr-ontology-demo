import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from typing import List, Tuple, Optional
import os
import warnings
from tqdm import tqdm

from IPython.terminal.shortcuts.filters import is_windows_os

warnings.filterwarnings('ignore')
from matplotlib import rcParams

config = {
    "font.family": 'serif',
    "mathtext.fontset": 'stix',
    "font.serif": ['SimSun'],
    'axes.unicode_minus': False
}
rcParams.update(config)


# %%
# ================== 1. 数据解析与预处理 ==================
def parse_curve(s: str) -> List[float]:
    """将逗号分隔的字符串转换为浮点数列表"""
    if pd.isna(s):
        return []
    return [float(x) for x in str(s).strip().split(',')]


def pad_sequences(sequences: List[List[float]], target_len: int = None) -> List[List[float]]:
    """
    将所有序列填充到相同长度。
    填充值：如果序列长度≥3，使用最后3个值的平均值；否则使用最后一个值。
    """
    if not sequences:
        return []
    if target_len is None:
        target_len = max(len(seq) for seq in sequences)
    padded = []
    for seq in sequences:
        if len(seq) < target_len:
            # 计算填充值：使用最后3个值的平均值（避免平尾）
            if len(seq) >= 3:
                pad_val = np.mean(seq[-3:])
            else:
                pad_val = seq[-1] if seq else 0.0
            seq = seq + [pad_val] * (target_len - len(seq))
        padded.append(seq)
    return padded


def average_sequence(sequences: List[List[float]]) -> List[float]:
    """计算多个序列的逐点平均值，所有序列长度需相同"""
    if not sequences:
        return []
    n = len(sequences[0])
    arr = np.array(sequences)
    return arr.mean(axis=0).tolist()


# %%
# ================== 2. DTW相关函数 ==================
def dtw_path(x: List[float], y: List[float], mask: Optional[np.ndarray] = None) -> Tuple[float, List[Tuple[int, int]]]:
    """计算DTW距离并返回最优路径（0-based索引）"""
    m, n = len(x), len(y)
    dist = np.zeros((m + 1, n + 1))
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            dist[i, j] = abs(x[i - 1] - y[j - 1])

    D = np.full((m + 1, n + 1), np.inf)
    D[0, 0] = 0
    direction = np.zeros((m + 1, n + 1), dtype=int)  # 1=上移，2=对角，3=右移

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if mask is not None and not mask[i - 1, j - 1]:
                continue
            candidates = [(D[i - 1, j], (i - 1, j), 1),  # 上移
                          (D[i - 1, j - 1], (i - 1, j - 1), 2),  # 对角
                          (D[i, j - 1], (i, j - 1), 3)]  # 右移
            min_val, _, best_dir = min(candidates, key=lambda x: x[0])
            D[i, j] = min_val + dist[i, j]
            direction[i, j] = best_dir

    if np.isinf(D[m, n]):
        return np.inf, []

    # 回溯路径
    path = []
    i, j = m, n
    while i > 0 and j > 0:
        path.append((i - 1, j - 1))
        if direction[i, j] == 1:  # 上移
            i -= 1
        elif direction[i, j] == 2:  # 对角
            i -= 1
            j -= 1
        elif direction[i, j] == 3:  # 右移
            j -= 1
        else:
            break
    path.reverse()
    return D[m, n], path


def encode_step(prev: Tuple[int, int], curr: Tuple[int, int]) -> Tuple[int, int, int]:
    """根据两个连续路径步的坐标编码方向（右移、对角、上移）"""
    dr = curr[0] - prev[0]  # 行差（序列索引）
    dc = curr[1] - prev[1]  # 列差（R索引）
    if dr == 0 and dc == 1:
        return (1, 0, 0)  # 右移
    elif dr == 1 and dc == 1:
        return (0, 1, 0)  # 对角
    elif dr == 1 and dc == 0:
        return (0, 0, 1)  # 上移
    else:
        return (0, 0, 0)


# ================== 3. 构建规整矩阵M和约束矩阵N ==================
def build_M_and_N(train_series: List[List[float]], R: List[float]) -> Tuple[np.ndarray, np.ndarray]:
    m = len(R)
    max_train_len = max(len(s) for s in train_series) if train_series else 0
    M = np.zeros((m, max_train_len, 3), dtype=int)
    N = np.zeros((m, max_train_len), dtype=bool)

    with tqdm(total=len(train_series), desc="Building M and N") as pbar:
        for seq in train_series:
            _, path = dtw_path(seq, R, mask=None)
            if not path:
                continue
            for k in range(1, len(path)):
                prev, curr = path[k - 1], path[k]
                row_r = curr[1]  # R的索引
                col_seq = curr[0]  # 序列索引
                if row_r < m and col_seq < max_train_len:
                    enc = encode_step(prev, curr)
                    M[row_r, col_seq] += enc
                    N[row_r, col_seq] = True
            start = path[0]
            if start[1] < m and start[0] < max_train_len:
                N[start[1], start[0]] = True
            pbar.update(1)
    return M, N


# %%
# ================== 4. 路径支持度计算 ==================
def original_support(M: np.ndarray, path_points_with_dir: List[Tuple[Tuple[int, int], Tuple[int, int, int]]]) -> float:
    # TODO: 谁说更稳定的？不是平均就一定稳定，论文取了最大值
    """原始支持度：窗口内各点与M的点积的均值（更稳定）"""
    if not path_points_with_dir:
        return 0.0
    dots = []
    # TODO: 需不需要包含最后一个点
    # for (r, c), enc in path_points_with_dir:
    for (r, c), enc in path_points_with_dir[:-1]:
        if r < M.shape[0] and c < M.shape[1]:
            dot = np.dot(M[r, c], enc)
            dots.append(dot)
    if not dots:
        return 0.0
    # return np.mean(dots)
    return np.max(dots)


def relative_support(M: np.ndarray, path_points_with_dir: List[Tuple[Tuple[int, int], Tuple[int, int, int]]]) -> float:
    """
    相对支持度 = 原始支持度 / 当前方向的路径计数
    """
    if not path_points_with_dir:
        return 0.0

    sup = original_support(M, path_points_with_dir)

    # 使用最后一个点的方向
    (r, c), enc = path_points_with_dir[-1]

    if r >= M.shape[0] or c >= M.shape[1]:
        return 0.0

    # 只取当前方向的数量
    # TODO: 为什么只取当前方向?
    # direction_count = np.dot(M[r, c], enc)
    direction_count = M[r, c].sum()

    if direction_count == 0:
        return 0.0

    return sup / direction_count


# %%
# ================== 5. 阈值计算 ==================
def compute_threshold(M: np.ndarray, training_paths: List[List[Tuple[Tuple[int, int], Tuple[int, int, int]]]],
                      l: int) -> [float, float]:
    min_windows_rel_supp = 100000
    min_rel_supp = 1.0
    for path in training_paths:
        current_windows_rel_supp = 0
        for i in range(l - 1, len(path)):
            segment = path[i - l + 1:i + 1]
            current_rel_supp = relative_support(M, segment)
            current_windows_rel_supp += current_rel_supp
            if current_rel_supp < min_rel_supp:
                min_rel_supp = current_rel_supp
        if current_windows_rel_supp < min_windows_rel_supp:
            min_windows_rel_supp = current_windows_rel_supp
    return min_rel_supp, min_windows_rel_supp


# ================== 6. 片段正常性判定 ==================
def detect_segment(M: np.ndarray, segment: List[Tuple[Tuple[int, int], Tuple[int, int, int]]],
                   threshold: float) -> [bool, float]:
    if not segment:
        return False
    last_pos = segment[-1][0]
    # 检查该位置是否有当前方向的计数
    (r, c), enc = segment[-1]
    if r >= M.shape[0] or c >= M.shape[1]:
        return False, 0
    # TODO: 应该是所有方向的路线
    # direction_count = np.dot(M[r, c], enc)
    direction_count = M[r, c].sum()
    if direction_count == 0:
        return False, 0
    rel_supp = relative_support(M, segment)
    return rel_supp >= threshold, rel_supp


# ================== 7. E-DTWA得分计算 ==================
def edtwa_score(M: np.ndarray, R: List[float], Q: List[float], l: int,
                threshold: float, windows_threshold: float) -> [float, bool]:
    _, path = dtw_path(Q, R, mask=None)
    if not path:
        return 0.0

    path_points_with_dir = []
    for k in range(1, len(path)):
        prev, curr = path[k - 1], path[k]
        pos = (curr[1], curr[0])  # (R_idx, Q_idx)
        enc = encode_step(prev, curr)
        path_points_with_dir.append((pos, enc))

    # TODO：（还没改） 计算有问题
    detect_results = []
    windows_rel_supp = 0
    for i in range(l - 1, len(path_points_with_dir)):
        segment = path_points_with_dir[i - l + 1:i + 1]
        is_normal, _rel_supp = detect_segment(M, segment, threshold)
        windows_rel_supp += _rel_supp
        detect_results.append(is_normal)

    return 0 if len(detect_results) == 0 else sum(detect_results) / len(
        detect_results), windows_rel_supp >= windows_threshold


# %%
# ================== 8. 可视化函数 ==================
def plot_score_distribution(scores, threshold, output_file='score_distribution.png'):
    plt.figure(figsize=(10, 6))
    plt.hist(scores, bins=20, edgecolor='black', alpha=0.7)
    plt.axvline(x=threshold, color='red', linestyle='--', label=f'阈值 θ={threshold:.4f}')
    plt.xlabel('E-DTWA 正常性得分')
    plt.ylabel('序列数量')
    plt.title('异常检测得分分布')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.savefig(output_file, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"得分分布图已保存至 {output_file}")


def plot_anomaly_sequence(seq, R, pvi, idx, scores, output_dir='anomaly_plots'):
    os.makedirs(output_dir, exist_ok=True)
    plt.figure(figsize=(12, 5))
    x = np.arange(len(R))
    plt.plot(x, R, label='正常原型 R', linewidth=2, color='blue')
    plt.plot(x, seq, label=f'序列 {pvi}', linewidth=1.5, color='red', alpha=0.8)
    plt.fill_between(x, R, seq, where=(np.abs(np.array(seq) - np.array(R)) > 0),
                     color='red', alpha=0.2, label='差异区域')
    plt.title(f'异常序列对比 (PVI: {pvi}, 得分: {scores[idx]:.4f})')
    plt.xlabel('时间点')
    plt.ylabel('数值')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.savefig(f'{output_dir}/anomaly_{pvi}.png', dpi=150, bbox_inches='tight')
    plt.close()


def plot_all_sequences(train_series, test_series, test_pvi_list, test_anomaly_flags, R,
                       output_file='all_sequences.png'):
    plt.figure(figsize=(14, 7))
    x = np.arange(len(R))
    for seq in train_series:
        plt.plot(x, seq, color='gray', alpha=0.2, linewidth=0.8)
    for i, seq in enumerate(test_series):
        color = 'red' if test_anomaly_flags[i] else 'blue'
        label = f'测试集 (异常)' if test_anomaly_flags[i] else None
        plt.plot(x, seq, color=color, alpha=0.6, linewidth=1.0, label=label if i == 0 else "")
    plt.plot(x, R, color='black', linewidth=2.5, label='正常原型 R')
    plt.xlabel('时间点')
    plt.ylabel('数值')
    plt.title('所有序列对比（训练集灰色，测试集正常蓝色，异常红色）')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output_file, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"所有序列对比图已保存至 {output_file}")


# %%
# ================== 9. 主程序 ==================
def main():
    # ===== 训练阶段 =====
    train_file = "RC020R04-32.xlsx"
    print(f"正在读取训练集文件 {train_file} ...")
    try:
        df_train = pd.read_excel(train_file)
    except FileNotFoundError:
        print(f"错误：训练集文件 {train_file} 未找到，请检查路径。")
        return

    curve_col_train = 'ActualCurveData'
    if curve_col_train not in df_train.columns:
        print(f"错误：训练集文件中缺少列 '{curve_col_train}'。当前列名：{list(df_train.columns)}")
        return

    train_series_raw = []
    for _, row in df_train.iterrows():
        s = row[curve_col_train]
        seq = parse_curve(str(s))
        if seq and len(seq) == 256:
            train_series_raw.append(seq)
        else:
            print(f"警告：训练集某行曲线数据无效，已跳过")

    if not train_series_raw:
        print("训练集中没有有效的时间序列数据，程序退出。")
        return

    print(f"训练集成功读取 {len(train_series_raw)} 条序列")

    # 填充训练集到相同长度
    train_series_padded = pad_sequences(train_series_raw)
    seq_len_train = len(train_series_padded[0])
    print(f"训练集序列统一长度: {seq_len_train}")

    # 计算平均序列作为正常原型R
    R = average_sequence(train_series_padded)
    print(f"正常原型R已计算（所有训练序列的平均）")

    # 构建规整矩阵M和约束矩阵N
    print("正在构建规整矩阵M和约束矩阵N...")
    M, N = build_M_and_N(train_series_padded, R)
    print(f"M形状: {M.shape}, N形状: {N.shape}")

    # 收集训练路径用于阈值计算
    print("正在收集训练路径...")
    training_paths = []
    for seq in train_series_padded:
        _, path = dtw_path(seq, R, mask=None)
        if not path:
            continue
        path_with_dir = []
        for k in range(1, len(path)):
            prev, curr = path[k - 1], path[k]
            pos = (curr[1], curr[0])
            enc = encode_step(prev, curr)
            path_with_dir.append((pos, enc))
        training_paths.append(path_with_dir)

    # 设置窗口长度l
    l = 5
    print(f"使用窗口长度 l = {l}")

    # 计算自适应阈值（使用改进方法）
    theta, windows_theta = compute_threshold(M, training_paths, l)
    print(f"自适应阈值 θ = {theta:.4f}, 自适应窗口阈值 θ = {windows_theta:.4f}")

    # ===== 测试阶段 =====
    test_file = "RC020R04-32.csv"
    print(f"\n正在读取测试集文件 {test_file} ...")
    try:
        df_test = pd.read_csv(test_file)
    except FileNotFoundError:
        print(f"错误：测试集文件 {test_file} 未找到，请检查路径。")
        return

    pvi_col = '车辆ID'
    curve_col_test = '曲线数据'
    if pvi_col not in df_test.columns or curve_col_test not in df_test.columns:
        print(f"错误：测试集文件缺少必要列。当前列名：{list(df_test.columns)}")
        return

    test_series = []
    pvi_list = []
    for _, row in df_test.iterrows():
        curve_str = row[curve_col_test]
        pvi = row[pvi_col]
        seq = parse_curve(str(curve_str))
        if seq:
            test_series.append(seq)
            pvi_list.append(pvi)
        else:
            print(f"警告：测试集 PVI {pvi} 的曲线数据无效，已跳过")

    if not test_series:
        print("测试集中没有有效的时间序列数据，程序退出。")
        return

    print(f"测试集成功读取 {len(test_series)} 条序列")

    # 填充测试集到与R相同的长度
    test_series_padded = pad_sequences(test_series, target_len=len(R))
    print(f"测试集序列已填充至长度 {len(R)}")

    # 计算每个测试序列的E-DTWA得分
    print("正在计算每个测试序列的E-DTWA得分...")
    scores = []
    is_windows_normals = []
    for seq in test_series_padded:
        score, is_windows_normal = edtwa_score(M, R, seq, l, theta, windows_theta)
        scores.append(score)
        is_windows_normals.append(is_windows_normal)

    # 构建结果DataFrame
    result_df = pd.DataFrame({
        'PVI': pvi_list,
        'E-DTWA_score': scores,
        'is_anomaly': is_windows_normals  # [s < theta for s in scores]
    })
    result_df = result_df.sort_values('E-DTWA_score')
    print("\n检测结果（前10个得分最低的序列）：")
    print(result_df.head(10))

    # 保存结果到CSV
    output_csv = "RC020R04-32_detection_results.csv"
    result_df.to_csv(output_csv, index=False)
    print(f"\n检测结果已保存至 {output_csv}")

    # ===== 可视化 =====
    plot_score_distribution(scores, theta)

    anomaly_indices = [i for i, s in enumerate(scores) if s < theta]
    plot_count = len(anomaly_indices)
    if plot_count > 0:
        print(f"\n正在绘制 {plot_count} 个最异常序列的对比图...")
        for i in anomaly_indices[:plot_count]:
            plot_anomaly_sequence(test_series_padded[i], R, pvi_list[i], i, scores)
        print(f"对比图已保存至 anomaly_plots/ 目录")
    else:
        print("\n没有检测到异常序列，不生成对比图。")

    anomaly_flags = [s < theta for s in scores]
    plot_all_sequences(train_series_padded, test_series_padded, pvi_list, anomaly_flags, R)

    print("\n分析完成！")

main()