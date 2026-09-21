import { useEffect, useMemo, useState } from 'react'
import {
  Search, Route, X, Trash2, Clock, MapPin, Link2, Unlink, PenLine, Check,
} from 'lucide-react'
import { useSceneStore } from '@/store/useSceneStore'
import {
  formatTimestamp,
  getTimeOfDay,
  getWeatherIcon,
  getTreeIcon,
  getPedestrianIcon,
  CHAIN_STATUS_LABEL,
  formatGapMinutes,
} from '@/utils/sceneHelpers'
import { canLinkScenes } from '@/utils/chainHelpers'
import { getChainRules } from '@/services/storage'
import type {
  WindowScene,
  TransferChain,
  SceneFormData,
  Weather,
  TreeDensity,
  PedestrianStatus,
  SeatDirection,
  ChainStatus,
} from '@/types'

const WEATHERS: Weather[] = ['晴', '多云', '阴', '小雨', '大雨', '雪', '雾']
const TREES: TreeDensity[] = ['稀疏', '适中', '茂密']
const PEDESTRIANS: PedestrianStatus[] = ['稀少', '零星', '密集']

const STATUS_CHIP_CLASS: Record<ChainStatus, string> = {
  draft: 'bg-teal-800/70 text-mist-300',
  finalized: 'bg-dusk-400/20 text-dusk-300',
  pending: 'bg-red-900/40 text-red-300',
}

const STATUS_DOT_CLASS: Record<ChainStatus, string> = {
  draft: 'bg-mist-400',
  finalized: 'bg-dusk-400',
  pending: 'bg-red-400',
}

function ChainCard({
  chain,
  sceneMap,
  onFinalize,
}: {
  chain: TransferChain
  sceneMap: Map<string, WindowScene>
  onFinalize: (chainId: string) => void
}) {
  const rules = getChainRules()
  const members = chain.sceneIds
    .map((id) => sceneMap.get(id))
    .filter((s): s is WindowScene => !!s)

  return (
    <div className="rounded-xl border border-teal-800 bg-teal-900/50 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link2 className="w-4 h-4 text-dusk-400" />
        <span className="rounded bg-teal-800/70 px-2 py-0.5 text-xs text-mist-200">
          招牌「{chain.signText}」
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] ${STATUS_CHIP_CLASS[chain.status]}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASS[chain.status]}`} />
          {CHAIN_STATUS_LABEL[chain.status]}
        </span>
        {chain.status === 'draft' && (
          <button
            onClick={() => onFinalize(chain.id)}
            className="ml-auto rounded-full bg-dusk-400/15 px-3 py-1 text-[11px] text-dusk-300 transition-colors hover:bg-dusk-400/30"
          >
            定稿此链
          </button>
        )}
      </div>

      <div className="space-y-0">
        {members.map((scene, idx) => {
          const next = members[idx + 1]
          const linked = next ? canLinkScenes(scene, next, rules) : true
          return (
            <div key={scene.id}>
              <div className="flex items-center gap-3 text-xs">
                <span className="w-14 shrink-0 text-right text-dusk-400">
                  {formatTimestamp(scene.timestamp).split(' ')[1]}
                </span>
                <span className="text-mist-200">{scene.routeName}</span>
                <span className="text-mist-500">·</span>
                <span className="truncate text-mist-400">{scene.segment}</span>
              </div>
              {next && (
                <div className="ml-16 flex items-center gap-1.5 py-0.5 pl-1 text-[10px]">
                  {linked ? (
                    <>
                      <span className="h-3 w-px bg-dusk-400/50" />
                      <span className="text-mist-500">
                        换乘 {next.routeName} · 相隔 {formatGapMinutes(scene.timestamp, next.timestamp)}
                      </span>
                    </>
                  ) : (
                    <>
                      <Unlink className="w-3 h-3 text-red-400" />
                      <span className="text-red-300/80">接续中断，待补入同招牌记录</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-3 border-t border-teal-800/60 pt-2 text-[11px] text-mist-500">
        {chain.status === 'finalized' && '已定稿，正参与灵感抽取'}
        {chain.status === 'draft' && '待定稿，定稿后整链参与灵感抽取'}
        {chain.status === 'pending' && `待重连，补入共享招牌「${chain.signText}」的新记录后恢复接续`}
      </p>
    </div>
  )
}

export default function TimelinePage() {
  const {
    scenes,
    routeNames,
    selectedRoute,
    currentRouteScenes,
    chains,
    sceneChainMap,
    selectRoute,
    loadAll,
    deleteScene,
    updateScene,
    finalizeChain,
  } = useSceneStore()
  const [search, setSearch] = useState('')
  const [detailScene, setDetailScene] = useState<WindowScene | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<SceneFormData | null>(null)

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const sceneMap = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes])

  const filteredRoutes = routeNames.filter((r) =>
    r.toLowerCase().includes(search.toLowerCase())
  )

  const sorted = [...currentRouteScenes].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  const visibleChains = useMemo(() => {
    const list = selectedRoute
      ? chains.filter((chain) =>
          chain.sceneIds.some((id) => sceneMap.get(id)?.routeName === selectedRoute)
        )
      : chains
    return [...list].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  }, [chains, selectedRoute, sceneMap])

  const handleDelete = (id: string) => {
    deleteScene(id)
    setDetailScene(null)
    setEditing(false)
  }

  const startEdit = (scene: WindowScene) => {
    const { routeName, segment, seatDirection, weather, signText, treeDensity, pedestrianStatus, note } = scene
    setEditForm({ routeName, segment, seatDirection, weather, signText, treeDensity, pedestrianStatus, note })
    setEditing(true)
  }

  const handleSaveEdit = () => {
    if (!detailScene || !editForm) return
    updateScene(detailScene.id, editForm)
    setDetailScene({ ...detailScene, ...editForm })
    setEditing(false)
  }

  const updateEdit = <K extends keyof SceneFormData>(key: K, val: SceneFormData[K]) =>
    setEditForm((prev) => (prev ? { ...prev, [key]: val } : prev))

  const detailChain = detailScene ? sceneChainMap[detailScene.id] : undefined

  return (
    <div className="min-h-screen bg-teal-950 font-serif text-mist-100">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold tracking-wide text-dusk-400">
          窗景时间线
        </h1>

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
              全部
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

        {visibleChains.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-dusk-300">
              <Link2 className="w-4 h-4" />
              换乘接驳链
            </h2>
            <div className="space-y-3">
              {visibleChains.map((chain) => (
                <ChainCard
                  key={chain.id}
                  chain={chain}
                  sceneMap={sceneMap}
                  onFinalize={finalizeChain}
                />
              ))}
            </div>
          </section>
        )}

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-mist-400">
            <div className="mb-4 text-6xl opacity-30">🪟</div>
            <p className="text-lg">
              {selectedRoute ? '该路线暂无窗景记录' : '选择一条路线，开始浏览窗景'}
            </p>
          </div>
        ) : (
          <div className="relative pl-8">
            <div className="absolute left-3 top-0 bottom-0 w-px bg-teal-800" />
            <div className="space-y-6">
              {sorted.map((scene) => {
                const chain = sceneChainMap[scene.id]
                return (
                  <div key={scene.id} className="relative flex gap-4">
                    <div className="absolute -left-5 top-1 h-2.5 w-2.5 rounded-full bg-dusk-400 ring-4 ring-teal-950" />
                    <div className="w-20 shrink-0 pt-0.5 text-right">
                      <p className="text-xs text-dusk-400">
                        {formatTimestamp(scene.timestamp)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-mist-500">
                        {getTimeOfDay(scene.timestamp)}
                      </p>
                    </div>
                    <button
                      onClick={() => { setDetailScene(scene); setEditing(false) }}
                      className="group flex-1 rounded-xl border border-teal-800 bg-teal-900/50 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-dusk-400/40 hover:shadow-lg hover:shadow-dusk-400/10"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {getWeatherIcon(scene.weather)}
                        <span className="text-sm font-semibold text-mist-100">
                          {scene.segment}
                        </span>
                        {chain && (
                          <span
                            className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${STATUS_CHIP_CLASS[chain.status]}`}
                          >
                            <Link2 className="w-3 h-3" />
                            {CHAIN_STATUS_LABEL[chain.status]}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mb-1.5 text-mist-400">
                        <MapPin className="w-3 h-3" />
                        <span className="text-xs">{scene.routeName}</span>
                        <span className="mx-1 text-teal-700">·</span>
                        <span className="text-xs">{scene.seatDirection}侧</span>
                      </div>
                      {scene.note && (
                        <p className="text-xs text-mist-400 line-clamp-2">
                          {scene.note}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        {getTreeIcon(scene.treeDensity)}
                        {getPedestrianIcon(scene.pedestrianStatus)}
                        {scene.signText && (
                          <span className="rounded bg-teal-800/60 px-1.5 py-0.5 text-[10px] text-mist-300">
                            {scene.signText}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {detailScene && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => { setDetailScene(null); setEditing(false) }}
        >
          <div
            className="relative mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto animate-scale-in rounded-2xl border border-teal-700 bg-teal-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setDetailScene(null); setEditing(false) }}
              className="absolute right-4 top-4 text-mist-400 hover:text-mist-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {editing && editForm ? (
              <>
                <h2 className="mb-4 text-xl font-bold text-dusk-400">编辑窗景</h2>
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-mist-400">线路</label>
                      <input
                        className="w-full rounded-lg bg-teal-850 px-3 py-2 text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
                        value={editForm.routeName}
                        onChange={(e) => updateEdit('routeName', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-mist-400">区间</label>
                      <input
                        className="w-full rounded-lg bg-teal-850 px-3 py-2 text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
                        value={editForm.segment}
                        onChange={(e) => updateEdit('segment', e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-mist-400">座位方向</label>
                    <div className="flex gap-2">
                      {(['左', '右'] as SeatDirection[]).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => updateEdit('seatDirection', d)}
                          className={`flex-1 rounded-lg py-1.5 text-xs transition ${editForm.seatDirection === d ? 'bg-dusk-400/20 text-dusk-400 border border-dusk-400' : 'bg-teal-850 text-mist-300 border border-transparent'}`}
                        >
                          {d}侧
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-mist-400">天气</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {WEATHERS.map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => updateEdit('weather', w)}
                          className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] transition ${editForm.weather === w ? 'bg-dusk-400/20 border border-dusk-400 text-dusk-400' : 'bg-teal-850 border border-transparent text-mist-300'}`}
                        >
                          {getWeatherIcon(w)}{w}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-mist-400">招牌文字</label>
                    <input
                      className="w-full rounded-lg bg-teal-850 px-3 py-2 text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
                      value={editForm.signText}
                      onChange={(e) => updateEdit('signText', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-mist-400">树木密度</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {TREES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => updateEdit('treeDensity', t)}
                          className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] transition ${editForm.treeDensity === t ? 'bg-dusk-400/20 border border-dusk-400 text-dusk-400' : 'bg-teal-850 border border-transparent text-mist-300'}`}
                        >
                          {getTreeIcon(t)}{t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-mist-400">行人状态</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {PEDESTRIANS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => updateEdit('pedestrianStatus', p)}
                          className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] transition ${editForm.pedestrianStatus === p ? 'bg-dusk-400/20 border border-dusk-400 text-dusk-400' : 'bg-teal-850 border border-transparent text-mist-300'}`}
                        >
                          {getPedestrianIcon(p)}{p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-mist-400">观察笔记</label>
                    <textarea
                      className="h-20 w-full resize-none rounded-lg bg-teal-850 px-3 py-2 text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
                      value={editForm.note}
                      onChange={(e) => updateEdit('note', e.target.value)}
                    />
                  </div>
                  <p className="text-[11px] text-mist-500">保存后相关接驳链将重新校验</p>
                </div>
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="flex-1 rounded-lg bg-teal-800/60 py-2.5 text-sm text-mist-300 transition-colors hover:bg-teal-800"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-dusk-400 py-2.5 text-sm text-teal-950 transition-colors hover:bg-dusk-300"
                  >
                    <Check className="w-4 h-4" />
                    保存修改
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-3">
                  {getWeatherIcon(detailScene.weather)}
                  <h2 className="text-xl font-bold text-dusk-400">{detailScene.segment}</h2>
                </div>

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
                  {detailChain && (
                    <div className="flex items-center gap-2 rounded-lg border border-teal-800 px-3 py-2 text-mist-300">
                      <Link2 className="w-4 h-4 shrink-0 text-dusk-400" />
                      <span className="text-xs">
                        接驳链「{detailChain.signText}」· 第{' '}
                        {detailChain.sceneIds.indexOf(detailScene.id) + 1}/
                        {detailChain.sceneIds.length} 段
                      </span>
                      <span
                        className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${STATUS_CHIP_CLASS[detailChain.status]}`}
                      >
                        {CHAIN_STATUS_LABEL[detailChain.status]}
                      </span>
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
                    onClick={() => startEdit(detailScene)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-teal-800/60 py-2.5 text-sm text-mist-200 transition-colors hover:bg-teal-800"
                  >
                    <PenLine className="w-4 h-4" />
                    编辑
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
            )}
          </div>
        </div>
      )}
    </div>
  )
}
