import type { Weather, TreeDensity, PedestrianStatus, ChainStatus, TransferChain, WindowScene } from '@/types'
import {
  Sun, Cloud, CloudRain, CloudDrizzle, CloudSnow, CloudFog,
  TreePine, TreePine as TreeSparse, Trees,
  PersonStanding, Users,
} from 'lucide-react'

export function getWeatherIcon(weather: Weather) {
  const map: Record<Weather, React.ReactNode> = {
    '晴': <Sun className="w-4 h-4 text-dusk-400" />,
    '多云': <Cloud className="w-4 h-4 text-mist-400" />,
    '阴': <Cloud className="w-4 h-4 text-mist-500" />,
    '小雨': <CloudDrizzle className="w-4 h-4 text-blue-400" />,
    '大雨': <CloudRain className="w-4 h-4 text-blue-500" />,
    '雪': <CloudSnow className="w-4 h-4 text-mist-200" />,
    '雾': <CloudFog className="w-4 h-4 text-mist-400" />,
  }
  return map[weather]
}

export function getTreeIcon(density: TreeDensity) {
  const map: Record<TreeDensity, React.ReactNode> = {
    '稀疏': <TreeSparse className="w-4 h-4 text-green-600" />,
    '适中': <TreePine className="w-4 h-4 text-green-500" />,
    '茂密': <Trees className="w-4 h-4 text-green-400" />,
  }
  return map[density]
}

export function getPedestrianIcon(status: PedestrianStatus) {
  const map: Record<PedestrianStatus, React.ReactNode> = {
    '稀少': <PersonStanding className="w-4 h-4 text-mist-400" />,
    '零星': <PersonStanding className="w-4 h-4 text-dusk-300" />,
    '密集': <Users className="w-4 h-4 text-dusk-400" />,
  }
  return map[status]
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${year}/${month}/${day} ${hour}:${minute}`
}

export function getTimeOfDay(iso: string): string {
  const h = new Date(iso).getHours()
  if (h < 6) return '深夜'
  if (h < 9) return '清晨'
  if (h < 12) return '上午'
  if (h < 14) return '中午'
  if (h < 17) return '下午'
  if (h < 19) return '傍晚'
  return '夜晚'
}

export const WRITING_PROMPTS = [
  '尝试以窗外招牌为线索，写一个关于陌生人的短篇',
  '用树木的密度变化暗示主人公的心境转折',
  '让行人的状态成为故事中某个预兆的隐喻',
  '把天气当作叙事节奏的调节器，写一段场景转换',
  '以座位方向为视角限制，写一段只看到一侧世界的独白',
  '从观察笔记中的一句话出发，展开一篇城市散文',
  '将窗景中所有招牌串联成一条线索，写一个悬疑片段',
  '用行人的姿态写一首自由诗',
  '以"窗外"为题，把这段记录扩写成五百字的微型小说',
  '从树木间隙中想象一个被遮挡的完整故事',
  '用天气和行人密度写一段氛围描写',
  '把窗景当作一幅画，为它写一段策展词',
]

export const CHAIN_STATUS_LABEL: Record<ChainStatus, string> = {
  draft: '待定稿',
  finalized: '已定稿',
  pending: '待重连',
}

/** 两条记录相隔的分钟数（取整），用于展示接续间隔 */
export function formatGapMinutes(fromIso: string, toIso: string): string {
  const minutes = Math.round(
    Math.abs(new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000
  )
  return `${minutes} 分钟`
}

/** 接驳链涉及的不同线路数 */
export function countChainRoutes(scenes: WindowScene[]): number {
  return new Set(scenes.map((s) => s.routeName.trim())).size
}

/** 为已定稿接驳链生成写作角度提示 */
export function buildChainPrompts(chain: TransferChain, scenes: WindowScene[]): string[] {
  const first = scenes[0]
  const last = scenes[scenes.length - 1]
  const routes = countChainRoutes(scenes)
  const spanMinutes = formatGapMinutes(first.timestamp, last.timestamp)
  return [
    `以招牌「${chain.signText}」为接头暗号，写一段从${first.routeName}到${last.routeName}的换乘`,
    `把这条跨 ${routes} 条线路、历时 ${spanMinutes} 的接驳链，写成一次城市漂流`,
    `在${first.routeName}与${last.routeName}之间，让「${chain.signText}」成为两个人错过的信号`,
    `用 ${scenes.length} 段窗景的接力，写一篇关于"抵达之前"的散文`,
  ]
}
