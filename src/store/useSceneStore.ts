import { create } from 'zustand'
import type { WindowScene, SceneFormData, TransferChain } from '@/types'
import {
  getAllScenes,
  saveScene as storageSaveScene,
  updateScene as storageUpdateScene,
  deleteScene as storageDeleteScene,
  getScenesByRoute,
  getAllRouteNames,
  getRandomScene,
  getAllChains,
  finalizeChain as storageFinalizeChain,
} from '@/services/storage'

interface SceneState {
  scenes: WindowScene[]
  chains: TransferChain[]
  routeNames: string[]
  currentRouteScenes: WindowScene[]
  selectedRoute: string
  randomScene: WindowScene | null

  loadAll: () => void
  saveScene: (data: SceneFormData) => { healed: boolean }
  updateScene: (id: string, data: SceneFormData) => void
  deleteScene: (id: string) => void
  selectRoute: (routeName: string) => void
  refreshRandom: () => void
  finalizeChain: (memberIds: string[]) => TransferChain | null
}

export const useSceneStore = create<SceneState>((set) => ({
  scenes: [],
  chains: [],
  routeNames: [],
  currentRouteScenes: [],
  selectedRoute: '',
  randomScene: null,

  loadAll: () => {
    const scenes = getAllScenes()
    const chains = getAllChains()
    const routeNames = getAllRouteNames()
    set((state) => ({
      scenes,
      chains,
      routeNames,
      currentRouteScenes: state.selectedRoute
        ? getScenesByRoute(state.selectedRoute)
        : [],
    }))
  },

  saveScene: (data) => {
    const scene: WindowScene = {
      ...data,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    }
    const result = storageSaveScene(scene)
    const scenes = getAllScenes()
    const chains = getAllChains()
    const routeNames = getAllRouteNames()
    set((state) => ({
      scenes,
      chains,
      routeNames,
      currentRouteScenes: state.selectedRoute
        ? getScenesByRoute(state.selectedRoute)
        : [],
    }))
    return result
  },

  updateScene: (id, data) => {
    const existing = getAllScenes().find((s) => s.id === id)
    if (!existing) return
    storageUpdateScene({ ...existing, ...data })
    const scenes = getAllScenes()
    const chains = getAllChains()
    const routeNames = getAllRouteNames()
    set((state) => ({
      scenes,
      chains,
      routeNames,
      currentRouteScenes: state.selectedRoute
        ? getScenesByRoute(state.selectedRoute)
        : [],
    }))
  },

  deleteScene: (id) => {
    storageDeleteScene(id)
    const scenes = getAllScenes()
    const chains = getAllChains()
    const routeNames = getAllRouteNames()
    set((state) => ({
      scenes,
      chains,
      routeNames,
      currentRouteScenes: state.selectedRoute
        ? getScenesByRoute(state.selectedRoute)
        : [],
    }))
  },

  selectRoute: (routeName) => {
    const currentRouteScenes = routeName ? getScenesByRoute(routeName) : []
    set({ selectedRoute: routeName, currentRouteScenes })
  },

  refreshRandom: () => {
    const randomScene = getRandomScene()
    set({ randomScene })
  },

  finalizeChain: (memberIds) => {
    const chain = storageFinalizeChain(memberIds)
    if (chain) set({ chains: getAllChains() })
    return chain
  },
}))
