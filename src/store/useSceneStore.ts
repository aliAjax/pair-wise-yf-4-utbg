import { create } from 'zustand'
import type { WindowScene, SceneFormData, TransferChain, ChainEvent, Inspiration } from '@/types'
import {
  getAllScenes,
  saveScene as storageSaveScene,
  updateScene as storageUpdateScene,
  deleteScene as storageDeleteScene,
  getScenesByRoute,
  getAllRouteNames,
  getAllChains,
  getSceneChainMap,
  finalizeChain as storageFinalizeChain,
  getRandomInspiration,
} from '@/services/storage'

interface SceneState {
  scenes: WindowScene[]
  routeNames: string[]
  currentRouteScenes: WindowScene[]
  selectedRoute: string
  chains: TransferChain[]
  sceneChainMap: Record<string, TransferChain>
  randomInspiration: Inspiration | null

  loadAll: () => void
  saveScene: (data: SceneFormData) => ChainEvent | null
  updateScene: (id: string, data: SceneFormData) => void
  deleteScene: (id: string) => void
  selectRoute: (routeName: string) => void
  finalizeChain: (chainId: string) => void
  refreshRandom: () => void
}

export const useSceneStore = create<SceneState>((set) => ({
  scenes: [],
  routeNames: [],
  currentRouteScenes: [],
  selectedRoute: '',
  chains: [],
  sceneChainMap: {},
  randomInspiration: null,

  loadAll: () => {
    const scenes = getAllScenes()
    const routeNames = getAllRouteNames()
    const chains = getAllChains()
    const sceneChainMap = getSceneChainMap()
    set({ scenes, routeNames, chains, sceneChainMap })
  },

  saveScene: (data: SceneFormData) => {
    const scene: WindowScene = {
      ...data,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    }
    const event = storageSaveScene(scene)
    const scenes = getAllScenes()
    const routeNames = getAllRouteNames()
    const chains = getAllChains()
    const sceneChainMap = getSceneChainMap()
    set((state) => {
      const currentRouteScenes =
        state.selectedRoute ? getScenesByRoute(state.selectedRoute) : []
      return { scenes, routeNames, chains, sceneChainMap, currentRouteScenes }
    })
    return event
  },

  updateScene: (id: string, data: SceneFormData) => {
    storageUpdateScene(id, data)
    const scenes = getAllScenes()
    const routeNames = getAllRouteNames()
    const chains = getAllChains()
    const sceneChainMap = getSceneChainMap()
    set((state) => {
      const currentRouteScenes =
        state.selectedRoute ? getScenesByRoute(state.selectedRoute) : []
      return { scenes, routeNames, chains, sceneChainMap, currentRouteScenes }
    })
  },

  deleteScene: (id: string) => {
    storageDeleteScene(id)
    const scenes = getAllScenes()
    const routeNames = getAllRouteNames()
    const chains = getAllChains()
    const sceneChainMap = getSceneChainMap()
    set((state) => {
      const currentRouteScenes =
        state.selectedRoute ? getScenesByRoute(state.selectedRoute) : []
      return { scenes, routeNames, chains, sceneChainMap, currentRouteScenes }
    })
  },

  selectRoute: (routeName: string) => {
    const currentRouteScenes = routeName ? getScenesByRoute(routeName) : []
    set({ selectedRoute: routeName, currentRouteScenes })
  },

  finalizeChain: (chainId: string) => {
    storageFinalizeChain(chainId)
    const chains = getAllChains()
    const sceneChainMap = getSceneChainMap()
    set({ chains, sceneChainMap })
  },

  refreshRandom: () => {
    const randomInspiration = getRandomInspiration()
    set({ randomInspiration })
  },
}))
