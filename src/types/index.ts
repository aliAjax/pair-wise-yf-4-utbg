export type SeatDirection = '左' | '右'

export type Weather = '晴' | '多云' | '阴' | '小雨' | '大雨' | '雪' | '雾'

export type TreeDensity = '稀疏' | '适中' | '茂密'

export type PedestrianStatus = '稀少' | '零星' | '密集'

export interface WindowScene {
  id: string
  routeName: string
  segment: string
  seatDirection: SeatDirection
  timestamp: string
  weather: Weather
  signText: string
  treeDensity: TreeDensity
  pedestrianStatus: PedestrianStatus
  note: string
}

export interface SceneFormData {
  routeName: string
  segment: string
  seatDirection: SeatDirection
  weather: Weather
  signText: string
  treeDensity: TreeDensity
  pedestrianStatus: PedestrianStatus
  note: string
}

/** 接驳链状态：draft 待定稿 / finalized 已定稿 / pending 待重连 */
export type ChainStatus = 'draft' | 'finalized' | 'pending'

/** 换乘接驳链：sceneIds 按时间升序排列，相邻记录即前序/后继 */
export interface TransferChain {
  id: string
  /** 全链共享的非空招牌（已去除首尾空白） */
  signText: string
  sceneIds: string[]
  status: ChainStatus
  createdAt: string
  updatedAt: string
}

/** 接驳规则（持久化到浏览器本地） */
export interface ChainRules {
  maxGapMinutes: number
  requireDifferentRoute: boolean
  requireNonEmptySign: boolean
}

export type ChainEventType = 'created' | 'joined' | 'restored'

export interface ChainEvent {
  type: ChainEventType
  chainId: string
}

/** 灵感抽取结果：单条窗景，或一整条已定稿的接驳链 */
export type Inspiration =
  | { kind: 'scene'; scene: WindowScene }
  | { kind: 'chain'; chain: TransferChain; scenes: WindowScene[] }
