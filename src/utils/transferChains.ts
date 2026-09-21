import type { WindowScene, TransferChain } from '@/types'

/**
 * 换乘接驳规则（全部规则本地保存、本地执行）：
 * 1. 两条记录必须来自不同线路；
 * 2. 共享同一块非空招牌（trim 后完全相同）；
 * 3. 时间相隔不超过十五分钟；
 * 4. 每条记录最多一个前序、一个后继，链条不得成环。
 */
export const MAX_TRANSFER_GAP_MS = 15 * 60 * 1000

/** 判断两条记录能否接续（方向：a 为前序，b 为后继） */
export function canLink(a: WindowScene, b: WindowScene): boolean {
  const signA = a.signText.trim()
  const signB = b.signText.trim()
  if (!signA || !signB) return false
  if (signA !== signB) return false
  if (a.routeName.trim() === '' || b.routeName.trim() === '') return false
  if (a.routeName === b.routeName) return false
  const ta = new Date(a.timestamp).getTime()
  const tb = new Date(b.timestamp).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb) || tb <= ta) return false
  return tb - ta <= MAX_TRANSFER_GAP_MS
}

function byTimeAsc(a: WindowScene, b: WindowScene): number {
  return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime() || a.id.localeCompare(b.id)
}

/**
 * 推导未定稿接驳链：按时间贪心构建。
 * 每个记录最多挂到一条链尾（至多一个前序），已挂入的记录不再成为
 * 其他链的候选，从而保证「最多一前序一后继、无环」。
 * 仅返回长度 >= 2 的链。
 */
export function deriveDraftChains(
  scenes: WindowScene[],
  excludeIds: Set<string> = new Set(),
): WindowScene[][] {
  const groups = new Map<string, WindowScene[]>()
  for (const s of scenes) {
    const sign = s.signText.trim()
    if (!sign || excludeIds.has(s.id)) continue
    const list = groups.get(sign)
    if (list) list.push(s)
    else groups.set(sign, [s])
  }

  const runs: WindowScene[][] = []
  for (const list of groups.values()) {
    list.sort(byTimeAsc)
    const tails: WindowScene[][] = []
    for (const scene of list) {
      // 选时间最晚的可接续链尾，尽量保持时间贴近
      let best: WindowScene[] | null = null
      for (const run of tails) {
        const tail = run[run.length - 1]
        if (canLink(tail, scene) && (!best || byTimeAsc(best[best.length - 1], tail) < 0)) {
          best = run
        }
      }
      if (best) {
        best.push(scene)
      } else {
        tails.push([scene])
      }
    }
    for (const run of tails) {
      if (run.length >= 2) runs.push(run)
    }
  }

  runs.sort((a, b) => byTimeAsc(b[b.length - 1], a[a.length - 1]))
  return runs
}

/** 定稿链是否仍然接续完整（相邻成员全部满足接续规则） */
export function isChainIntact(chain: TransferChain, scenesById: Map<string, WindowScene>): boolean {
  if (chain.memberIds.length < 2) return false
  const members = chain.memberIds.map((id) => scenesById.get(id))
  if (members.some((m) => !m)) return false
  for (let i = 1; i < members.length; i++) {
    if (!canLink(members[i - 1] as WindowScene, members[i] as WindowScene)) return false
  }
  return true
}

/**
 * 按接续规则计算相邻断裂位置（字段改动后规则不再满足）。
 * 注意：中间记录"被删除"造成的显式断裂单独持久化在 chain.gaps，
 * 即使剩余前后项仍满足规则也算断裂，且只能靠补入新记录恢复。
 */
export function ruleGapIndexes(chain: TransferChain, scenesById: Map<string, WindowScene>): number[] {
  const gaps: number[] = []
  for (let i = 1; i < chain.memberIds.length; i++) {
    const a = scenesById.get(chain.memberIds[i - 1])
    const b = scenesById.get(chain.memberIds[i])
    if (!a || !b || !canLink(a, b)) gaps.push(i)
  }
  return gaps
}

/**
 * 展示用：合并"显式删除缺口"与"规则断裂相邻"。
 */
export function chainGapIndexes(chain: TransferChain, scenesById: Map<string, WindowScene>): number[] {
  return Array.from(new Set([...chain.gaps, ...ruleGapIndexes(chain, scenesById)])).sort((x, y) => x - y)
}

/**
 * 尝试用一条新记录补接定稿链的断裂处。
 * 仅当新记录可以插入到某个缺口内部（前后都能接续）时恢复；
 * 不允许从端点延长——恢复只来自"补入共享同招牌的新记录"。
 * 一条新记录补入后必须整链缺口全部闭合才恢复 active，否则保持待重连。
 */
export function healChain(
  chain: TransferChain,
  scenesById: Map<string, WindowScene>,
  newScene: WindowScene,
): { memberIds: string[]; gaps: number[] } | null {
  if (chain.status !== 'broken') return null
  if (chain.gaps.length === 0) return null
  if (chain.memberIds.includes(newScene.id)) return null

  // 一条新记录最多补一个缺口（每条记录至多一个前序与一个后继）
  const candidates = chain.gaps.filter((i) => {
    const before = scenesById.get(chain.memberIds[i - 1])
    const after = scenesById.get(chain.memberIds[i])
    if (!before || !after) return false
    const tBefore = new Date(before.timestamp).getTime()
    const tAfter = new Date(after.timestamp).getTime()
    const tNew = new Date(newScene.timestamp).getTime()
    return (
      tNew > tBefore &&
      tNew < tAfter &&
      canLink(before, newScene) &&
      canLink(newScene, after)
    )
  })
  if (candidates.length !== 1) return null

  const at = candidates[0]
  const memberIds = [...chain.memberIds.slice(0, at), newScene.id, ...chain.memberIds.slice(at)]
  // 该删除缺口闭合；后续缺口下标因插入而后移 1
  const gaps = chain.gaps
    .filter((i) => i !== at)
    .map((i) => (i > at ? i + 1 : i))

  // 仅当显式删除缺口全部补齐、且新相邻关系满足规则时恢复 active；
  // 其它既有的规则断裂（字段被改）不阻塞删除缺口的恢复，状态以是否还有断裂综合判定
  const rebuiltById = new Map(scenesById)
  rebuiltById.set(newScene.id, newScene)
  if (gaps.length > 0 || !isChainIntact({ ...chain, memberIds, gaps: [] }, rebuiltById)) {
    return null
  }
  return { memberIds, gaps: [] }
}

/** 所有处于待重连定稿链中的记录 id —— 这些记录不能参与灵感抽取 */
export function brokenMemberIds(chains: TransferChain[]): Set<string> {
  const ids = new Set<string>()
  for (const c of chains) {
    if (c.status === 'broken') c.memberIds.forEach((id) => ids.add(id))
  }
  return ids
}

export type TimelineBlock =
  | { kind: 'chain'; chain: TransferChain; members: WindowScene[] }
  | { kind: 'draft'; members: WindowScene[] }
  | { kind: 'single'; scene: WindowScene }

/**
 * 组织时间线视图所需的时间序列块：
 * 定稿链（含待重连）整块呈现；未定稿链按时间呈现；其余记录单列。
 * 块之间按各自最晚时间倒序。
 */
export function buildTimelineBlocks(scenes: WindowScene[], chains: TransferChain[]): TimelineBlock[] {
  const byId = new Map(scenes.map((s) => [s.id, s]))
  const blocks: TimelineBlock[] = []
  const consumed = new Set<string>()

  for (const chain of chains) {
    // 仅保留仍存在的成员（容忍本地数据缺失），按时间排序并同步修正缺口下标
    const kept: { id: string; index: number }[] = []
    chain.memberIds.forEach((id, index) => {
      if (byId.has(id)) kept.push({ id, index })
    })
    if (kept.length === 0) continue
    kept.sort((x, y) => byTimeAsc(byId.get(x.id)!, byId.get(y.id)!))
    const members = kept.map((k) => byId.get(k.id)!)
    const oldIndexToNew = new Map(kept.map((k, i) => [k.index, i]))
    const gaps = chain.gaps
      .map((g) => ({ before: oldIndexToNew.get(g - 1), after: oldIndexToNew.get(g) }))
      .filter((p): p is { before: number; after: number } =>
        p.before !== undefined && p.after !== undefined && p.after === p.before + 1)
      .map((p) => p.after)
    const normalized: TransferChain = { ...chain, memberIds: members.map((m) => m.id), gaps }
    members.forEach((m) => consumed.add(m.id))
    blocks.push({ kind: 'chain', chain: normalized, members })
  }

  // 未定稿链仅由"不属于任何定稿链"的记录推导，任一字段改动后调用本函数即自动重新校验
  for (const draft of deriveDraftChains(scenes, consumed)) {
    draft.forEach((m) => consumed.add(m.id))
    blocks.push({ kind: 'draft', members: draft })
  }

  for (const s of scenes) {
    if (!consumed.has(s.id)) blocks.push({ kind: 'single', scene: s })
  }

  const blockTime = (b: TimelineBlock): number => {
    const last = b.kind === 'single' ? b.scene : b.members[b.members.length - 1]
    return new Date(last.timestamp).getTime()
  }
  blocks.sort((a, b) => blockTime(b) - blockTime(a))
  return blocks
}

export interface SceneChainInfo {
  chain: TransferChain
  /** 该记录在链中的下标（0 起） */
  index: number
}

/** 查询某条记录所属的定稿链 */
export function findChainInfo(
  sceneId: string,
  chains: TransferChain[],
): SceneChainInfo | null {
  for (const chain of chains) {
    const index = chain.memberIds.indexOf(sceneId)
    if (index >= 0) return { chain, index }
  }
  return null
}
