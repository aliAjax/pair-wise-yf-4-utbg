import { useEffect, useMemo, useState } from 'react'
import {
  Search, Route, X, Trash2, Clock, MapPin, ArrowLeftRight, Lock, Unlink,
  Pencil, ArrowDown, Signpost, AlertTriangle,
} from 'lucide-react'
import { useSceneStore } from '@/store/useSceneStore'
import {
  formatTimestamp,
  getTimeOfDay,
  getWeatherIcon,
  getTreeIcon,
  getPedestrianIcon,
  WEATHERS,
  TREES,
  PEDESTRIANS,
} from '@/utils/sceneHelpers'
import {
  buildTimelineBlocks,
  chainGapIndexes,
  findChainInfo,
  type TimelineBlock,
} from '@/utils/transferChains'
import type { WindowScene, SceneFormData, SeatDirection, TransferChain } from '@/types'

export default function TimelinePage() {
  const {
    scenes, chains, routeNames, selectedRoute, currentRouteScenes,
    selectRoute, loadAll, deleteScene, updateScene, finalizeChain,
  } = useSceneStore()
  const [search, setSearch] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<SceneFormData | null>(null)

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const filteredRoutes = routeNames.filter((r) =>
    r.toLowerCase().includes(search.toLowerCase())
  )

  const blocks = useMemo(() => buildTimelineBlocks(scenes, chains), [scenes, chains])

  const chainInfoById = useMemo(() => {
    const map = new Map<string, { chain: TransferChain; index: number }>()
    for (const chain of chains) {
      chain.memberIds.forEach((id, index) => map.set(id, { chain, index }))
    }
    return map
  }, [chains])

  const scenesById = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes])

  const sorted = useMemo(
    () => [...currentRouteScenes].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    ),
    [currentRouteScenes],
  )

  const detailScene = detailId ? scenesById.get(detailId) ?? null : null
  const detailInfo = detailScene ? findChainInfo(detailScene.id, chains) : null

  const openDetail = (id: string) => {
    setDetailId(id)
    setEditing(false)
  }

  const startEdit = () => {
    if (!detailScene) return
    const {
      routeName, segment, seatDirection, weather, signText,
      treeDensity, pedestrianStatus, note,
    } = detailScene
    setEditForm({
      routeName, segment, seatDirection, weather, signText,
      treeDensity, pedestrianStatus, note,
    })
    setEditing(true)
  }

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!detailScene || !editForm) return
    updateScene(detailScene.id, editForm)
    setEditing(false)
  }

  const handleDelete = (id: string) => {
    deleteScene(id)
    setDetailId(null)
    setEditing(false)
  }

  const handleFinalize = (members: WindowScene[]) => {
    finalizeChain(members.map((m) => m.id))
  }

  const editUpdate = <K extends keyof SceneFormData>(key: K, val: SceneFormData[K]) =>
    setEditForm((prev) => (prev ? { ...prev, [key]: val } : prev))

  return (
    <div className="min-h-screen bg-teal-950 font-serif text-mist-100">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-4 text-3xl font-bold tracking-wide text-dusk-400">
          窗景时间线
        </h1>

        <div className="mb-6 rounded-xl border border-teal-800 bg-teal-900/40 p-3 text-xs leading-relaxed text-mist-400">
          <div className="mb-1 flex items-center gap-1.5 text-mist-300">
            <ArrowLeftRight className="h-3.5 w-3.5 text-dusk-400" />
            换乘接驳规则
          </div>
          两条<span className="text-mist-200">不同线路</span>的记录共享同一块
          <span className="text-mist-200">非空招牌</span>、且时间相隔
          <span className="text-mist-200">不超过十五分钟</span>时接续；每条记录至多一个前序与一个后继，链条不成环。
          未定稿链按时间自动呈现、字段改动后重新校验；定稿链中间记录被删则整链退为<span className="text-amber-400/90">待重连</span>、
          不参与灵感抽取，补入共享同招牌的新记录后恢复。所有规则与链状态仅保存在本机浏览器。
        </div>

        <div className="mb-6 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-mist-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索路线..."
              className="w-full rounded-lg border border-teal-800 bg-teal-900/60 py-2.5 pl-10 pr-4 text-sm text-mist-100 placeholder:text-mist-500 focus:border-dusk-400 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => selectRoute('')}
              className={`rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                !selectedRoute
                  ? 'bg-dusk-400 text-teal-950'
                  : 'bg-teal-900 text-mist-300 hover:bg-teal-800'
              }`}
            >
              全部（含接驳链）
            </button>
            {filteredRoutes.map((name) => (
              <button
                key={name}
                onClick={() => selectRoute(name)}
                className={`rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                  selectedRoute === name
                    ? 'bg-dusk-400 text-teal-950'
                    : 'bg-teal-900 text-mist-300 hover:bg-teal-800'
                }`}
              >
                <Route className="mr-1 inline w-3 h-3" />
                {name}
              </button>
            ))}
          </div>
        </div>

        {selectedRoute && sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-mist-400">
            <div className="mb-4 text-6xl opacity-30">🪟</div>
            <p className="text-lg">该路线暂无窗景记录</p>
          </div>
        ) : !selectedRoute && blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-mist-400">
            <div className="mb-4 text-6xl opacity-30">🪟</div>
            <p className="text-lg">还没有窗景记录，去记录页采样第一段窗景</p>
          </div>
        ) : (
          <div className="relative pl-8">
            <div className="absolute left-3 top-0 bottom-0 w-px bg-teal-800" />
            <div className="space-y-6">
              {selectedRoute
                ? sorted.map((scene) => (
                    <FlatTimelineItem
                      key={scene.id}
                      scene={scene}
                      chainInfo={chainInfoById.get(scene.id) ?? null}
                      onClick={() => openDetail(scene.id)}
                    />
                  ))
                : blocks.map((block) => (
                    <BlockItem
                      key={blockKey(block)}
                      block={block}
                      scenesById={scenesById}
                      onOpen={openDetail}
                      onFinalize={handleFinalize}
                    />
                  ))}
            </div>
          </div>
        )}
      </div>

      {detailScene && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setDetailId(null)}
        >
          <div
            className="relative mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto animate-scale-in rounded-2xl border border-teal-700 bg-teal-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setDetailId(null)}
              className="absolute right-4 top-4 z-10 text-mist-400 hover:text-mist-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {!editing || !editForm ? (
              <>
                <div className="mb-4 flex items-center gap-3 pr-8">
                  {getWeatherIcon(detailScene.weather)}
                  <h2 className="text-xl font-bold text-dusk-400">{detailScene.segment}</h2>
                </div>

                {detailInfo && (
                  <div className={`mb-4 rounded-lg border px-3 py-2.5 text-xs ${
                    detailInfo.chain.status === 'broken'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300/90'
                      : 'border-dusk-400/30 bg-dusk-400/10 text-mist-300'
                  }`}>
                    <div className="mb-1 flex items-center gap-1.5 font-medium">
                      {detailInfo.chain.status === 'broken' ? (
                        <><Unlink className="h-3.5 w-3.5" />待重连接驳链 · 第 {detailInfo.index + 1}/{detailInfo.chain.memberIds.length} 段</>
                      ) : (
                        <><Lock className="h-3.5 w-3.5 text-dusk-400" />已定稿接驳链 · 第 {detailInfo.index + 1}/{detailInfo.chain.memberIds.length} 段</>
                      )}
                    </div>
                    <div className="space-y-1">
                      {detailInfo.chain.memberIds.map((id, i) => {
                        const m = scenesById.get(id)
                        return (
                          <div key={id} className={`flex items-center gap-1.5 ${id === detailScene.id ? 'text-dusk-300 font-medium' : 'text-mist-400'}`}>
                            <span className="w-3 text-right text-[10px]">{i + 1}</span>
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{m ? `${m.routeName} · ${m.segment}` : '（记录已删除）'}</span>
                            {m && <span className="ml-auto shrink-0 text-[10px] opacity-70">{formatTimestamp(m.timestamp).split(' ')[1]}</span>}
                          </div>
                        )
                      })}
                    </div>
                    {detailInfo.chain.status === 'broken' && (
                      <p className="mt-2 flex items-start gap-1 text-[11px] leading-relaxed text-amber-300/80">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        中间记录被删，前后项保留但整链待重连，期间不参与灵感抽取；补入共享同招牌的新记录后恢复。
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-mist-300">
                    <MapPin className="w-4 h-4 text-dusk-400" />
                    <span>{detailScene.routeName}</span>
                    <span className="text-teal-600">·</span>
                    <span>{detailScene.seatDirection}侧</span>
                  </div>
                  <div className="flex items-center gap-2 text-mist-300">
                    <Clock className="w-4 h-4 text-dusk-400" />
                    <span>{formatTimestamp(detailScene.timestamp)}</span>
                    <span className="text-teal-600">·</span>
                    <span>{getTimeOfDay(detailScene.timestamp)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-mist-300">
                    {getTreeIcon(detailScene.treeDensity)}
                    <span>{detailScene.treeDensity}</span>
                    {getPedestrianIcon(detailScene.pedestrianStatus)}
                    <span>{detailScene.pedestrianStatus}</span>
                  </div>
                  {detailScene.signText && (
                    <div className="rounded-lg bg-teal-800/50 px-3 py-2 text-mist-200">
                      招牌: {detailScene.signText}
                    </div>
                  )}
                  {detailScene.note && (
                    <div className="rounded-lg border border-teal-800 px-3 py-2 text-mist-300">
                      {detailScene.note}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    onClick={startEdit}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-teal-800/60 py-2.5 text-sm text-mist-200 transition-colors hover:bg-teal-800"
                  >
                    <Pencil className="w-4 h-4" />
                    修改字段
                  </button>
                  <button
                    onClick={() => handleDelete(detailScene.id)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-900/40 py-2.5 text-sm text-red-300 transition-colors hover:bg-red-900/60"
                  >
                    <Trash2 className="w-4 h-4" />
                    删除此窗景
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleSaveEdit} className="space-y-4">
                <h2 className="pr-8 text-lg font-bold text-dusk-400">修改窗景字段</h2>
                <p className="text-[11px] leading-relaxed text-mist-400">
                  保存后接驳规则立即重新校验：未定稿链按新字段重新接续，所属定稿链若不再满足规则将退为待重连。
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs text-mist-300"><Route className="h-3 w-3" />线路</label>
                    <input required className="w-full rounded-lg bg-teal-800/70 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
                      value={editForm.routeName} onChange={(e) => editUpdate('routeName', e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs text-mist-300"><MapPin className="h-3 w-3" />区间</label>
                    <input required className="w-full rounded-lg bg-teal-800/70 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
                      value={editForm.segment} onChange={(e) => editUpdate('segment', e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="mb-1 text-xs text-mist-300">座位方向</label>
                  <div className="flex gap-2">
                    {(['左', '右'] as SeatDirection[]).map((d) => (
                      <button key={d} type="button" onClick={() => editUpdate('seatDirection', d)}
                        className={`flex-1 rounded-lg py-1.5 text-sm transition ${editForm.seatDirection === d ? 'bg-dusk-400/20 text-dusk-400 border border-dusk-400' : 'bg-teal-800/70 text-mist-300 border border-transparent'}`}>
                        {d}侧
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-mist-300">天气</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {WEATHERS.map((w) => (
                      <button key={w} type="button" onClick={() => editUpdate('weather', w)}
                        className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] transition ${editForm.weather === w ? 'bg-dusk-400/20 border border-dusk-400 text-dusk-400' : 'bg-teal-800/70 border border-transparent text-mist-300'}`}>
                        {getWeatherIcon(w)}{w}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs text-mist-300"><Signpost className="h-3 w-3" />招牌文字（接驳依据）</label>
                  <input className="w-full rounded-lg bg-teal-800/70 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
                    value={editForm.signText} onChange={(e) => editUpdate('signText', e.target.value)} />
                </div>

                <div>
                  <label className="mb-1 text-xs text-mist-300">树木密度</label>
                  <div className="grid grid-cols-3 gap-2">
                    {TREES.map((t) => (
                      <button key={t} type="button" onClick={() => editUpdate('treeDensity', t)}
                        className={`flex items-center justify-center gap-1 rounded-lg py-2 text-xs transition ${editForm.treeDensity === t ? 'bg-dusk-400/20 border border-dusk-400 text-dusk-400' : 'bg-teal-800/70 border border-transparent text-mist-300'}`}>
                        {getTreeIcon(t)}{t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 text-xs text-mist-300">行人状态</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PEDESTRIANS.map((p) => (
                      <button key={p} type="button" onClick={() => editUpdate('pedestrianStatus', p)}
                        className={`flex items-center justify-center gap-1 rounded-lg py-2 text-xs transition ${editForm.pedestrianStatus === p ? 'bg-dusk-400/20 border border-dusk-400 text-dusk-400' : 'bg-teal-800/70 border border-transparent text-mist-300'}`}>
                        {getPedestrianIcon(p)}{p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-mist-300">观察笔记</label>
                  <textarea className="h-20 w-full resize-none rounded-lg bg-teal-800/70 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
                    value={editForm.note} onChange={(e) => editUpdate('note', e.target.value)} />
                </div>

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setEditing(false)}
                    className="flex-1 rounded-lg bg-teal-800/60 py-2.5 text-sm text-mist-300 hover:bg-teal-800">
                    取消
                  </button>
                  <button type="submit"
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-dusk-400 py-2.5 text-sm font-medium text-teal-950">
                    <Pencil className="h-4 w-4" />保存修改
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function blockKey(block: TimelineBlock): string {
  if (block.kind === 'chain') return `chain-${block.chain.id}`
  if (block.kind === 'draft') return `draft-${block.members.map((m) => m.id).join('-')}`
  return `single-${block.scene.id}`
}

function FlatTimelineItem({
  scene, chainInfo, onClick,
}: {
  scene: WindowScene
  chainInfo: { chain: TransferChain; index: number } | null
  onClick: () => void
}) {
  return (
    <div className="relative flex gap-4">
      <div className={`absolute -left-5 top-1 h-2.5 w-2.5 rounded-full ring-4 ring-teal-950 ${
        chainInfo?.chain.status === 'broken' ? 'bg-amber-400' : chainInfo ? 'bg-dusk-400' : 'bg-dusk-400/80'
      }`} />
      <div className="w-20 shrink-0 pt-0.5 text-right">
        <p className="text-xs text-dusk-400">{formatTimestamp(scene.timestamp)}</p>
        <p className="mt-0.5 text-[10px] text-mist-500">{getTimeOfDay(scene.timestamp)}</p>
      </div>
      <button
        onClick={onClick}
        className="group flex-1 rounded-xl border border-teal-800 bg-teal-900/50 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-dusk-400/40 hover:shadow-lg hover:shadow-dusk-400/10"
      >
        <div className="mb-2 flex items-center gap-2">
          {getWeatherIcon(scene.weather)}
          <span className="text-sm font-semibold text-mist-100">{scene.segment}</span>
        </div>
        <div className="mb-1.5 flex items-center gap-1 text-mist-400">
          <MapPin className="h-3 w-3" />
          <span className="text-xs">{scene.routeName}</span>
          <span className="mx-1 text-teal-700">·</span>
          <span className="text-xs">{scene.seatDirection}侧</span>
        </div>
        {scene.note && (
          <p className="line-clamp-2 text-xs text-mist-400">{scene.note}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {getTreeIcon(scene.treeDensity)}
          {getPedestrianIcon(scene.pedestrianStatus)}
          {scene.signText && (
            <span className="rounded bg-teal-800/60 px-1.5 py-0.5 text-[10px] text-mist-300">
              {scene.signText}
            </span>
          )}
          {chainInfo && (
            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
              chainInfo.chain.status === 'broken'
                ? 'bg-amber-500/15 text-amber-300'
                : 'bg-dusk-400/15 text-dusk-300'
            }`}>
              {chainInfo.chain.status === 'broken'
                ? <><Unlink className="h-2.5 w-2.5" />待重连链 {chainInfo.index + 1}/{chainInfo.chain.memberIds.length}</>
                : <><Lock className="h-2.5 w-2.5" />接驳链 {chainInfo.index + 1}/{chainInfo.chain.memberIds.length}</>}
            </span>
          )}
        </div>
      </button>
    </div>
  )
}

function BlockItem({
  block, scenesById, onOpen, onFinalize,
}: {
  block: TimelineBlock
  scenesById: Map<string, WindowScene>
  onOpen: (id: string) => void
  onFinalize: (members: WindowScene[]) => void
}) {
  if (block.kind === 'single') {
    return (
      <FlatTimelineItem
        scene={block.scene}
        chainInfo={null}
        onClick={() => onOpen(block.scene.id)}
      />
    )
  }

  const isFinalized = block.kind === 'chain'
  const chain = isFinalized ? block.chain : null
  const broken = chain?.status === 'broken'
  const members = block.members
  const last = members[members.length - 1]
  const sign = last.signText.trim()
  const routeCount = new Set(members.map((m) => m.routeName)).size
  const gapIndexes = chain ? chainGapIndexes(chain, scenesById) : []

  return (
    <div className="relative flex gap-4">
      <div className={`absolute -left-5 top-2 h-2.5 w-2.5 rounded-full ring-4 ring-teal-950 ${
        broken ? 'bg-amber-400' : isFinalized ? 'bg-dusk-400' : 'bg-mist-400'
      }`} />
      <div className="w-20 shrink-0 pt-2 text-right">
        <p className="text-xs text-dusk-400">{formatTimestamp(last.timestamp)}</p>
        <p className="mt-0.5 text-[10px] text-mist-500">{members.length} 段接驳</p>
      </div>
      <div className={`flex-1 rounded-xl border p-3 ${
        broken
          ? 'border-amber-500/40 bg-amber-500/[0.04]'
          : isFinalized
            ? 'border-dusk-400/40 bg-dusk-400/[0.06]'
            : 'border-teal-700/70 bg-teal-900/40'
      }`}>
        <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {broken ? (
            <span className="inline-flex items-center gap-1 font-medium text-amber-300">
              <Unlink className="h-3.5 w-3.5" />待重连接驳链
            </span>
          ) : isFinalized ? (
            <span className="inline-flex items-center gap-1 font-medium text-dusk-300">
              <Lock className="h-3.5 w-3.5" />已定稿接驳链
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-mist-300">
              <ArrowLeftRight className="h-3.5 w-3.5" />未定稿接驳链
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded bg-teal-800/70 px-1.5 py-0.5 text-[10px] text-mist-300">
            <Signpost className="h-2.5 w-2.5" />招牌「{sign}」
          </span>
          <span className="text-[10px] text-mist-500">{members.length} 段 · 跨 {routeCount} 条线路</span>
        </div>

        <div className="space-y-1.5">
          {members.map((m, i) => (
            <div key={m.id}>
              {i > 0 && (
                chain && gapIndexes.includes(i) ? (
                  <div className="py-1 pl-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-300/90">
                      <Unlink className="h-3 w-3" />
                      中间记录已删除，整链待重连
                    </div>
                    <p className="mt-0.5 pl-4 text-[10px] leading-relaxed text-amber-300/60">
                      补入共享招牌「{sign}」、与前后相隔均不超过十五分钟的新记录后恢复
                    </p>
                  </div>
                ) : (
                  <ArrowDown className={`mx-auto my-0.5 h-3.5 w-3.5 ${broken ? 'text-amber-500/40' : 'text-teal-600'}`} />
                )
              )}
              <button
                onClick={() => onOpen(m.id)}
                className="w-full rounded-lg border border-teal-800/70 bg-teal-900/60 px-3 py-2 text-left transition hover:border-dusk-400/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-mist-100">
                    {getWeatherIcon(m.weather)}
                    <span className="truncate">{m.segment}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-mist-500">
                    {formatTimestamp(m.timestamp)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-mist-400">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{m.routeName}</span>
                  <span className="text-teal-700">·</span>
                  <span>{m.seatDirection}侧</span>
                </div>
                {m.note && <p className="mt-1 line-clamp-1 text-[11px] text-mist-500">{m.note}</p>}
              </button>
            </div>
          ))}
        </div>

        {!isFinalized && (
          <button
            onClick={() => onFinalize(members)}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-dusk-400/40 px-2.5 py-1.5 text-[11px] text-dusk-300 transition hover:bg-dusk-400/15"
          >
            <Lock className="h-3 w-3" />
            定稿此链
          </button>
        )}
      </div>
    </div>
  )
}
