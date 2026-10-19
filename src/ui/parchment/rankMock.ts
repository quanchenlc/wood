/** Harness / 客户端 mock：好友柴榜 ≥15 行，便于滚动验收 */

export interface RankRow {
  rank: number;
  name: string;
  pieces: number;
  self?: boolean;
}

const FRIEND_POOL = [
  "林间樵夫",
  "雾里砍柴",
  "晚风",
  "小斧头",
  "松果",
  "南枝",
  "柴门客",
  "山客",
  "阿菜",
  "松下客",
  "青石碓",
  "秋后问薪",
  "篱笆外",
  "半亩塘",
  "老槐树下",
  "云中客",
  "谷雨",
  "霜降",
];

/** 生成 16 行：自我排在中后段，滚动后可测 pin「我」 */
export function buildMockRankRows(
  selfPieces: number,
  selfName = "我",
): RankRow[] {
  const base = Math.max(selfPieces, 420);
  const others: Omit<RankRow, "rank" | "self">[] = FRIEND_POOL.map((name, i) => {
    // 分数递减，覆盖自我上下
    const pieces = Math.max(40, Math.round(base + 860 - i * 95 + ((i * 17) % 40)));
    return { name, pieces };
  });
  others.push({ name: selfName, pieces: base });
  others.sort((a, b) => b.pieces - a.pieces);
  return others.slice(0, 16).map((r, i) => ({
    rank: i + 1,
    name: r.name,
    pieces: r.pieces,
    self: r.name === selfName,
  }));
}

export const RANK_ROW_H = 54;
export const RANK_PIN_H = 52;
