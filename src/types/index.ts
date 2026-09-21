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

/** 接驳链状态：active=已定稿且接续完整；broken=定稿链中间记录缺失，待重连 */
export type ChainStatus = 'active' | 'broken'

export interface TransferChain {
  id: string
  /** 成员记录 id，按时间从早到晚排列 */
  memberIds: string[]
  status: ChainStatus
  /**
   * 断裂相邻位置：每个数字 i 表示 memberIds[i-1] → memberIds[i]
   * 之间缺失了中间记录（删除事件驱动，即使前后项仍满足规则也算断裂）。
   * status === 'broken' 时非空；恢复后清空。
   */
  gaps: number[]
  createdAt: string
  finalizedAt: string
}
