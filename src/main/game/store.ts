import { mkdir, readFile, rename } from 'fs/promises'
import path from 'path'
import { parse, stringify } from '../utils/yaml'
import { atomicWriteFile, WriteQueue } from '../utils/safeFile'
import { dataDir } from '../utils/dirs'
import { createLogger } from '../utils/logger'
import {
  createDefaultGameAccelConfig,
  GAME_ACCEL_CACHE_FILE_NAME,
  GAME_ACCEL_FILE_NAME,
  GAME_ACCEL_LOG_SCOPE,
  GAME_ACCEL_PRESETS_FILE_NAME
} from '../../shared/game/constants'
import { migrateGameAccelConfig } from '../../shared/game/config'
import type { GameAccelConfig, GameAccelConfigPatch } from '../../shared/game/types'

const logger = createLogger(GAME_ACCEL_LOG_SCOPE)
const configWriteQueue = new WriteQueue()

export function gameAccelConfigPath(): string {
  return path.join(dataDir(), GAME_ACCEL_FILE_NAME)
}

export function gameAccelCachePath(): string {
  return path.join(dataDir(), GAME_ACCEL_CACHE_FILE_NAME)
}

export function gameAccelPresetsPath(): string {
  return path.join(dataDir(), GAME_ACCEL_PRESETS_FILE_NAME)
}

async function backupBrokenConfig(): Promise<void> {
  try {
    await rename(gameAccelConfigPath(), `${gameAccelConfigPath()}.bak-${Date.now()}`)
  } catch (error) {
    logger.warn('Failed to back up broken game-accel.yaml', error)
  }
}

export async function loadGameAccelConfig(): Promise<GameAccelConfig> {
  try {
    const content = await readFile(gameAccelConfigPath(), 'utf8')
    return migrateGameAccelConfig(parse(content))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createDefaultGameAccelConfig()
    }
    logger.error('Failed to load game-accel.yaml, using defaults', error)
    await backupBrokenConfig()
    return createDefaultGameAccelConfig()
  }
}

export async function saveGameAccelConfig(config: GameAccelConfig): Promise<void> {
  await configWriteQueue.run(async () => {
    await mkdir(dataDir(), { recursive: true })
    await atomicWriteFile(gameAccelConfigPath(), stringify(config), { encoding: 'utf8' })
  })
}

export async function patchGameAccelConfig(patch: GameAccelConfigPatch): Promise<GameAccelConfig> {
  const current = await loadGameAccelConfig()
  const next: GameAccelConfig = {
    ...current,
    ...patch,
    groupNames: patch.groupNames
      ? { ...current.groupNames, ...patch.groupNames }
      : current.groupNames,
    regions: patch.regions ?? current.regions,
    platforms: patch.platforms ?? current.platforms,
    customDirect: patch.customDirect ?? current.customDirect,
    customProxy: patch.customProxy ?? current.customProxy,
    games: patch.games ?? current.games,
    tuning: patch.tuning ? { ...current.tuning, ...patch.tuning } : current.tuning,
    guard: patch.guard
      ? { ...current.guard, ...patch.guard, ignored: patch.guard.ignored ?? current.guard.ignored }
      : current.guard,
    session: patch.session ? { ...current.session, ...patch.session } : current.session
  }
  await saveGameAccelConfig(next)
  return next
}
