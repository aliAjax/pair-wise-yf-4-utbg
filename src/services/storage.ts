import type {
  WindowScene,
  SceneFormData,
  TransferChain,
  ChainRules,
  ChainEvent,
  Inspiration,
} from '@/types'
import {
  DEFAULT_CHAIN_RULES,
  integrateScene,
  removeSceneFromChains,
  revalidateChainsForScene,
  countBrokenLinks,
} from '@/utils/chainHelpers'

const STORAGE_KEY = 'bus_window_scenes'
const CHAINS_KEY = 'bus_window_chains'
const CHAIN_RULES_KEY = 'bus_window_chain_rules'

export function getAllScenes(): WindowScene[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as WindowScene[]
  } catch {
    return []
  }
}

/** 接驳规则持久化：首次访问写入默认规则，之后从本地读取，刷新后仍在 */
export function getChainRules(): ChainRules {
  try {
    const raw = localStorage.getItem(CHAIN_RULES_KEY)
    if (raw) return { ...DEFAULT_CHAIN_RULES, ...(JSON.parse(raw) as Partial<ChainRules>) }
  } catch {
    // fall through to defaults
  }
  localStorage.setItem(CHAIN_RULES_KEY, JSON.stringify(DEFAULT_CHAIN_RULES))
  return DEFAULT_CHAIN_RULES
}

export function getAllChains(): TransferChain[] {
  let chains: TransferChain[] = []
  try {
    const raw = localStorage.getItem(CHAINS_KEY)
    if (raw) chains = JSON.parse(raw) as TransferChain[]
  } catch {
    return []
  }
  // 清理悬空引用与不足两条记录的链，保证本地数据自洽
  const sceneIds = new Set(getAllScenes().map((s) => s.id))
  let changed = false
  const cleaned: TransferChain[] = []
  for (const chain of chains) {
    const members = chain.sceneIds.filter((id) => sceneIds.has(id))
    if (members.length < 2) {
      changed = true
      continue
    }
    if (members.length !== chain.sceneIds.length) {
      changed = true
      cleaned.push({ ...chain, sceneIds: members })
    } else {
      cleaned.push(chain)
    }
  }
  if (changed) saveChains(cleaned)
  return cleaned
}

function saveChains(chains: TransferChain[]): void {
  localStorage.setItem(CHAINS_KEY, JSON.stringify(chains))
}

/** sceneId -> 所属接驳链，供时间线徽章等快速查询 */
export function getSceneChainMap(): Record<string, TransferChain> {
  const map: Record<string, TransferChain> = {}
  for (const chain of getAllChains()) {
    for (const id of chain.sceneIds) map[id] = chain
  }
  return map
}

export function saveScene(scene: WindowScene): ChainEvent | null {
  const scenes = getAllScenes()
  scenes.push(scene)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes))
  const { chains, event } = integrateScene(
    scene,
    scenes,
    getAllChains(),
    getChainRules(),
    { allowPendingRepair: true }
  )
  saveChains(chains)
  return event
}

/** 任一字段改动后落库，并对相关接驳链重新校验 */
export function updateScene(id: string, data: SceneFormData): void {
  const scenes = getAllScenes()
  const idx = scenes.findIndex((s) => s.id === id)
  if (idx === -1) return
  scenes[idx] = { ...scenes[idx], ...data }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes))
  const chains = revalidateChainsForScene(id, scenes, getAllChains(), getChainRules())
  saveChains(chains)
}

export function deleteScene(id: string): void {
  const scenes = getAllScenes()
  const chains = removeSceneFromChains(id, scenes, getAllChains(), getChainRules())
  saveChains(chains)
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(scenes.filter((s) => s.id !== id))
  )
}

/** 待定稿链定稿：校验全链接续有效后转为已定稿，参与灵感抽取 */
export function finalizeChain(chainId: string): void {
  const chains = getAllChains()
  const idx = chains.findIndex((c) => c.id === chainId)
  if (idx === -1) return
  const chain = chains[idx]
  if (chain.status !== 'draft') return
  const sceneMap = new Map(getAllScenes().map((s) => [s.id, s]))
  if (countBrokenLinks(chain, sceneMap, getChainRules()) > 0) return
  chains[idx] = { ...chain, status: 'finalized', updatedAt: new Date().toISOString() }
  saveChains(chains)
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
 * 灵感抽取池：已定稿链作为整体参与（成员不再单抽），
 * 待重连链及其成员不参与，其余记录照常单抽
 */
export function getRandomInspiration(): Inspiration | null {
  const scenes = getAllScenes()
  if (scenes.length === 0) return null
  const sceneMap = new Map(scenes.map((s) => [s.id, s]))
  const pool: Inspiration[] = []
  const excluded = new Set<string>()

  for (const chain of getAllChains()) {
    if (chain.status === 'finalized') {
      const members = chain.sceneIds
        .map((id) => sceneMap.get(id))
        .filter((s): s is WindowScene => !!s)
      if (members.length >= 2) {
        pool.push({ kind: 'chain', chain, scenes: members })
        members.forEach((m) => excluded.add(m.id))
      }
    } else if (chain.status === 'pending') {
      chain.sceneIds.forEach((id) => excluded.add(id))
    }
  }
  for (const scene of scenes) {
    if (!excluded.has(scene.id)) pool.push({ kind: 'scene', scene })
  }
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}
