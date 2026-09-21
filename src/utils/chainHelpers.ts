import type {
  WindowScene,
  TransferChain,
  ChainRules,
  ChainEvent,
} from '@/types'

/** 默认接驳规则：不同线路 + 共享非空招牌 + 相隔不超过十五分钟 */
export const DEFAULT_CHAIN_RULES: ChainRules = {
  maxGapMinutes: 15,
  requireDifferentRoute: true,
  requireNonEmptySign: true,
}

export function normalizeSign(signText: string): string {
  return signText.trim()
}

function timeOf(scene: WindowScene): number {
  return new Date(scene.timestamp).getTime()
}

/** 两条记录是否可接续：不同线路、共享同一块非空招牌、相隔不超过规则时限 */
export function canLinkScenes(
  a: WindowScene,
  b: WindowScene,
  rules: ChainRules
): boolean {
  if (a.id === b.id) return false
  const signA = normalizeSign(a.signText)
  const signB = normalizeSign(b.signText)
  if (rules.requireNonEmptySign && (!signA || !signB)) return false
  if (signA !== signB) return false
  if (
    rules.requireDifferentRoute &&
    a.routeName.trim() === b.routeName.trim()
  ) {
    return false
  }
  const gap = Math.abs(timeOf(a) - timeOf(b))
  return gap <= rules.maxGapMinutes * 60_000
}

/** 统计链中失效的接续（相邻记录不满足接续规则，或记录已缺失） */
export function countBrokenLinks(
  chain: TransferChain,
  sceneMap: Map<string, WindowScene>,
  rules: ChainRules
): number {
  let broken = 0
  for (let i = 0; i < chain.sceneIds.length - 1; i++) {
    const a = sceneMap.get(chain.sceneIds[i])
    const b = sceneMap.get(chain.sceneIds[i + 1])
    if (!a || !b || !canLinkScenes(a, b, rules)) broken++
  }
  return broken
}

export function isChainFullyLinked(
  chain: TransferChain,
  sceneMap: Map<string, WindowScene>,
  rules: ChainRules
): boolean {
  return chain.sceneIds.length >= 2 && countBrokenLinks(chain, sceneMap, rules) === 0
}

/** 记录按时间应插入链中的位置（链始终按时间升序，线性结构保证一前一继、不成环） */
function insertPosition(
  chain: TransferChain,
  scene: WindowScene,
  sceneMap: Map<string, WindowScene>
): number {
  const t = timeOf(scene)
  let pos = chain.sceneIds.length
  for (let i = 0; i < chain.sceneIds.length; i++) {
    const member = sceneMap.get(chain.sceneIds[i])
    if (member && timeOf(member) > t) {
      pos = i
      break
    }
  }
  return pos
}

interface InsertAttempt {
  sceneIds: string[]
  broken: number
}

/** 尝试把记录按时间序插入链中，要求与前后邻居的接续均有效；返回插入后的失效接续数 */
function tryInsert(
  chain: TransferChain,
  scene: WindowScene,
  sceneMap: Map<string, WindowScene>,
  rules: ChainRules
): InsertAttempt | null {
  if (chain.sceneIds.includes(scene.id)) return null
  const pos = insertPosition(chain, scene, sceneMap)
  const prevId = pos > 0 ? chain.sceneIds[pos - 1] : null
  const nextId = pos < chain.sceneIds.length ? chain.sceneIds[pos] : null
  const prev = prevId ? sceneMap.get(prevId) : null
  const next = nextId ? sceneMap.get(nextId) : null
  if (prev && !canLinkScenes(prev, scene, rules)) return null
  if (next && !canLinkScenes(scene, next, rules)) return null
  const sceneIds = [
    ...chain.sceneIds.slice(0, pos),
    scene.id,
    ...chain.sceneIds.slice(pos),
  ]
  const broken = countBrokenLinks({ ...chain, sceneIds }, sceneMap, rules)
  return { sceneIds, broken }
}

export interface IntegrateResult {
  chains: TransferChain[]
  event: ChainEvent | null
}

/**
 * 把一条记录接入现有链体系：
 * 1. 修复待重连链（仅全新记录允许，补入同招牌记录后恢复接续）
 * 2. 接续到待定稿/已定稿链的首尾
 * 3. 与另一条未入链的记录结成新的待定稿链
 */
export function integrateScene(
  scene: WindowScene,
  scenes: WindowScene[],
  chains: TransferChain[],
  rules: ChainRules,
  options: { allowPendingRepair: boolean }
): IntegrateResult {
  const sign = normalizeSign(scene.signText)
  if (!sign) return { chains, event: null }
  const sceneMap = new Map(scenes.map((s) => [s.id, s]))
  const now = new Date().toISOString()

  if (options.allowPendingRepair) {
    for (let i = 0; i < chains.length; i++) {
      const chain = chains[i]
      if (chain.status !== 'pending' || chain.signText !== sign) continue
      const attempt = tryInsert(chain, scene, sceneMap, rules)
      if (!attempt) continue
      const oldBroken = countBrokenLinks(chain, sceneMap, rules)
      // 必须减少失效接续才允许补入；链本已完好（退化情形）时保持完好即可
      const acceptable =
        oldBroken === 0 ? attempt.broken === 0 : attempt.broken < oldBroken
      if (!acceptable) continue
      const restored = attempt.broken === 0
      const next = [...chains]
      next[i] = {
        ...chain,
        sceneIds: attempt.sceneIds,
        status: restored ? 'finalized' : 'pending',
        updatedAt: now,
      }
      return {
        chains: next,
        event: { type: restored ? 'restored' : 'joined', chainId: chain.id },
      }
    }
  }

  for (let i = 0; i < chains.length; i++) {
    const chain = chains[i]
    if (chain.status === 'pending' || chain.signText !== sign) continue
    const pos = insertPosition(chain, scene, sceneMap)
    // 活跃链只在首尾延伸，不打断已有接续
    if (pos !== 0 && pos !== chain.sceneIds.length) continue
    const attempt = tryInsert(chain, scene, sceneMap, rules)
    if (!attempt || attempt.broken !== 0) continue
    const next = [...chains]
    next[i] = { ...chain, sceneIds: attempt.sceneIds, updatedAt: now }
    return { chains: next, event: { type: 'joined', chainId: chain.id } }
  }

  const chainedIds = new Set(chains.flatMap((c) => c.sceneIds))
  let best: WindowScene | null = null
  let bestGap = Infinity
  for (const candidate of scenes) {
    if (candidate.id === scene.id || chainedIds.has(candidate.id)) continue
    if (!canLinkScenes(scene, candidate, rules)) continue
    const gap = Math.abs(timeOf(candidate) - timeOf(scene))
    if (gap < bestGap) {
      best = candidate
      bestGap = gap
    }
  }
  if (!best) return { chains, event: null }

  const ordered = [scene, best].sort((a, b) => timeOf(a) - timeOf(b))
  const chain: TransferChain = {
    id: crypto.randomUUID(),
    signText: sign,
    sceneIds: ordered.map((s) => s.id),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }
  return { chains: [...chains, chain], event: { type: 'created', chainId: chain.id } }
}

/** 把待定稿链按有效接续切分为若干段，不足两条的散段脱链 */
function splitDraftChain(
  chain: TransferChain,
  sceneMap: Map<string, WindowScene>,
  rules: ChainRules
): TransferChain[] {
  const now = new Date().toISOString()
  const segments: string[][] = []
  let current: string[] = []
  for (const id of chain.sceneIds) {
    const prevId = current[current.length - 1]
    const prev = prevId ? sceneMap.get(prevId) : null
    const member = sceneMap.get(id)
    if (prev && member && !canLinkScenes(prev, member, rules)) {
      segments.push(current)
      current = [id]
    } else {
      current.push(id)
    }
  }
  if (current.length > 0) segments.push(current)

  const result: TransferChain[] = []
  let keptOriginalId = false
  for (const segment of segments) {
    if (segment.length < 2) continue
    if (!keptOriginalId) {
      result.push({ ...chain, sceneIds: segment, updatedAt: now })
      keptOriginalId = true
    } else {
      result.push({
        id: crypto.randomUUID(),
        signText: chain.signText,
        sceneIds: segment,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      })
    }
  }
  return result
}

/**
 * 记录被删除后维护链：
 * - 定稿链中间记录被删：前后项保留，整链退为待重连
 * - 定稿链首尾被删：链缩短，状态不变
 * - 待定稿链：重新校验，按有效接续切分
 * - 待重连链：保持待重连，等待补入新记录
 * - 剩余不足两条记录的链解散
 */
export function removeSceneFromChains(
  sceneId: string,
  scenes: WindowScene[],
  chains: TransferChain[],
  rules: ChainRules
): TransferChain[] {
  const sceneMap = new Map(scenes.map((s) => [s.id, s]))
  const now = new Date().toISOString()
  const result: TransferChain[] = []

  for (const chain of chains) {
    const idx = chain.sceneIds.indexOf(sceneId)
    if (idx === -1) {
      result.push(chain)
      continue
    }
    const wasInterior = idx > 0 && idx < chain.sceneIds.length - 1
    const remaining = chain.sceneIds.filter((id) => id !== sceneId)
    if (remaining.length < 2) continue
    const updated: TransferChain = { ...chain, sceneIds: remaining, updatedAt: now }

    if (chain.status === 'finalized') {
      result.push(wasInterior ? { ...updated, status: 'pending' } : updated)
    } else if (chain.status === 'draft') {
      result.push(...splitDraftChain(updated, sceneMap, rules))
    } else {
      result.push(updated)
    }
  }
  return result
}

/**
 * 记录任一字段改动后重新校验：
 * - 招牌不再匹配的退链（定稿链中间退出则退为待重连；待定稿链重新切分）
 * - 招牌仍匹配的：待定稿链重新校验切分；定稿链接续失效则退为待重连
 * - 待重连链不因字段改动恢复，只能等待补入同招牌的新记录
 * - 脱链的记录重新尝试接续（但不允许借此修复待重连链）
 */
export function revalidateChainsForScene(
  sceneId: string,
  scenes: WindowScene[],
  chains: TransferChain[],
  rules: ChainRules
): TransferChain[] {
  const sceneMap = new Map(scenes.map((s) => [s.id, s]))
  const scene = sceneMap.get(sceneId)
  if (!scene) return chains
  const now = new Date().toISOString()
  const result: TransferChain[] = []
  let sceneChained = false

  for (const chain of chains) {
    const idx = chain.sceneIds.indexOf(sceneId)
    if (idx === -1) {
      result.push(chain)
      continue
    }

    if (normalizeSign(scene.signText) !== chain.signText) {
      const wasInterior = idx > 0 && idx < chain.sceneIds.length - 1
      const remaining = chain.sceneIds.filter((id) => id !== sceneId)
      if (remaining.length >= 2) {
        const updated: TransferChain = { ...chain, sceneIds: remaining, updatedAt: now }
        if (chain.status === 'finalized') {
          result.push(wasInterior ? { ...updated, status: 'pending' } : updated)
        } else if (chain.status === 'draft') {
          result.push(...splitDraftChain(updated, sceneMap, rules))
        } else {
          result.push(updated)
        }
      }
      continue
    }

    if (chain.status === 'draft') {
      const segments = splitDraftChain({ ...chain, updatedAt: now }, sceneMap, rules)
      if (segments.some((c) => c.sceneIds.includes(sceneId))) sceneChained = true
      result.push(...segments)
    } else if (chain.status === 'finalized') {
      const broken = countBrokenLinks(chain, sceneMap, rules)
      result.push(broken > 0 ? { ...chain, status: 'pending', updatedAt: now } : chain)
      sceneChained = true
    } else {
      result.push(chain)
      sceneChained = true
    }
  }

  if (!sceneChained) {
    return integrateScene(scene, scenes, result, rules, {
      allowPendingRepair: false,
    }).chains
  }
  return result
}
