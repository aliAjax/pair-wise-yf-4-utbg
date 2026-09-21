import type { WindowScene, TransferChain } from '@/types'
import { healChain, canLink, ruleGapIndexes } from '@/utils/transferChains'

const STORAGE_KEY = 'bus_window_scenes'
const CHAINS_STORAGE_KEY = 'bus_window_transfer_chains'

export function getAllScenes(): WindowScene[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as WindowScene[]
  } catch {
    return []
  }
}

function saveAllScenes(scenes: WindowScene[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes))
}

/** 全部接驳链状态（localStorage 持久化，刷新后仍在） */
export function getAllChains(): TransferChain[] {
  try {
    const raw = localStorage.getItem(CHAINS_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as TransferChain[]
  } catch {
    return []
  }
}

function saveAllChains(chains: TransferChain[]): void {
  localStorage.setItem(CHAINS_STORAGE_KEY, JSON.stringify(chains))
}

export function saveScene(scene: WindowScene): { healed: boolean } {
  const scenes = getAllScenes()
  scenes.push(scene)
  saveAllScenes(scenes)

  // 补入新记录时，尝试恢复待重连的定稿链；其余情况不自动并入定稿链
  const chains = getAllChains()
  const byId = new Map(scenes.map((s) => [s.id, s]))
  let healed = false
  for (const chain of chains) {
    if (chain.status !== 'broken') continue
    const result = healChain(chain, byId, scene)
    if (result) {
      chain.memberIds = result.memberIds
      chain.gaps = result.gaps
      chain.status = 'active'
      healed = true
    }
  }
  if (healed) saveAllChains(chains)
  return { healed }
}

/**
 * 编辑已有记录：未定稿链在展示时按数据实时推导，天然重新校验；
 * 已定稿链则立刻重新校验，字段改动导致规则不满足时退为待重连。
 */
export function updateScene(updated: WindowScene): void {
  const scenes = getAllScenes().map((s) => (s.id === updated.id ? updated : s))
  saveAllScenes(scenes)

  const chains = getAllChains()
  if (chains.length === 0) return
  const byId = new Map(scenes.map((s) => [s.id, s]))
  let changed = false
  for (const chain of chains) {
    if (!chain.memberIds.includes(updated.id)) continue
    // 未定稿链由数据实时推导；定稿链立刻按最新字段重新校验。
    // 删除造成的显式缺口只能靠新记录补入；纯字段规则断裂在字段改回后自动恢复。
    const ruleBroken = ruleGapIndexes(chain, byId).length > 0
    const next = chain.gaps.length > 0 || ruleBroken ? 'broken' : 'active'
    if (chain.status !== next) {
      chain.status = next
      changed = true
    }
  }
  if (changed) saveAllChains(chains)
}

/**
 * 删除记录：定稿链中间记录被删 → 前后项保留、整链退为待重连；
 * 删除的是端点 → 剩余项仍完整则保持定稿；不足两条则链移除。
 * 待重连只能靠之后补入新记录恢复，不会用既有其他记录自动重连。
 */
export function deleteScene(id: string): void {
  const scenes = getAllScenes().filter((s) => s.id !== id)
  saveAllScenes(scenes)

  let chains = getAllChains()
  if (chains.length === 0) return
  let changed = false

  chains = chains.flatMap((chain) => {
    const idx = chain.memberIds.indexOf(id)
    if (idx < 0) return [chain]
    changed = true
    const wasInterior = idx > 0 && idx < chain.memberIds.length - 1
    const nextIds = chain.memberIds.filter((mid) => mid !== id)
    if (nextIds.length < 2) return [] // 剩余不足两条，链不再成立

    if (!wasInterior) {
      let gaps: number[]
      if (idx === 0) {
        // 删除首项：旧缺口 1（首项→次项）消失，其余前移 1
        gaps = chain.gaps.filter((g) => g !== 1).map((g) => g - 1)
      } else {
        // 删除末项：旧缺口 idx（次末→末项）消失，其余不变
        gaps = chain.gaps.filter((g) => g !== idx)
      }
      gaps = gaps.filter((g) => g >= 1 && g < nextIds.length)
      return [{ ...chain, memberIds: nextIds, status: gaps.length ? ('broken' as const) : chain.status, gaps }]
    }

    // 中间项删除：前后项保留，整链退为待重连；
    // 被删节点涉及的两个旧邻接（缺口 idx 与 idx+1）合并为新缺口 idx，
    // 其余旧缺口下标后移 1
    const gaps = Array.from(
      new Set([
        idx,
        ...chain.gaps
          .filter((g) => g !== idx && g !== idx + 1)
          .map((g) => (g > idx ? g - 1 : g)),
      ]),
    ).sort((x, y) => x - y)
    return [{ ...chain, memberIds: nextIds, status: 'broken' as const, gaps }]
  })

  if (changed) {
    // 状态复核：显式删除缺口或字段规则断裂任一存在即待重连；
    // chain.gaps 只持久化"删除缺口"，规则断裂实时推导不写入
    const byId = new Map(scenes.map((s) => [s.id, s]))
    for (const chain of chains) {
      const ruleBroken = ruleGapIndexes(chain, byId).length > 0
      chain.status = chain.gaps.length > 0 || ruleBroken ? 'broken' : 'active'
    }
    saveAllChains(chains)
  }
}

/**
 * 将一条未定稿链定稿。成员不能已属于其它定稿链；
 * 定稿时再次校验，防止与既有状态冲突。
 */
export function finalizeChain(memberIds: string[]): TransferChain | null {
  if (memberIds.length < 2) return null
  const scenes = getAllScenes()
  const byId = new Map(scenes.map((s) => [s.id, s]))
  const members = memberIds.map((id) => byId.get(id))
  if (members.some((m) => !m)) return null
  for (let i = 1; i < members.length; i++) {
    if (!canLink(members[i - 1]!, members[i]!)) return null
  }

  const chains = getAllChains()
  for (const chain of chains) {
    if (memberIds.some((id) => chain.memberIds.includes(id))) return null
  }

  const ordered = [...members]
    .sort(
      (a, b) =>
        new Date(a!.timestamp).getTime() - new Date(b!.timestamp).getTime() ||
        a!.id.localeCompare(b!.id),
    )
    .map((m) => m!.id)

  const now = new Date().toISOString()
  const chain: TransferChain = {
    id: crypto.randomUUID(),
    memberIds: ordered,
    status: 'active',
    gaps: [],
    createdAt: now,
    finalizedAt: now,
  }
  chains.push(chain)
  saveAllChains(chains)
  return chain
}

export function getScenesByRoute(routeName: string): WindowScene[] {
  return getAllScenes()
    .filter((s) => s.routeName === routeName)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export function getAllRouteNames(): string[] {
  const scenes = getAllScenes()
  const routeSet = new Set(scenes.map((s) => s.routeName))
  return Array.from(routeSet).sort()
}

/**
 * 灵感抽取：待重连定稿链中的记录不能参与；
 * 已定稿且完整、未定稿、独立记录均可正常抽取。
 */
export function getRandomScene(): WindowScene | null {
  const scenes = getAllScenes()
  if (scenes.length === 0) return null
  const excluded = new Set<string>()
  for (const c of getAllChains()) {
    if (c.status === 'broken') c.memberIds.forEach((id) => excluded.add(id))
  }
  const pool = scenes.filter((s) => !excluded.has(s.id))
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}
