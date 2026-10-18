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

async function writeGameAccelConfig(config: GameAccelConfig): Promise<void> {
  await mkdir(dataDir(), { recursive: true })
  await atomicWriteFile(gameAccelConfigPath(), stringify(config), { encoding: 'utf8' })
}

export async function saveGameAccelConfig(config: GameAccelConfig): Promise<void> {
  await configWriteQueue.run(() => writeGameAccelConfig(config))
}

function mergeGameAccelConfig(
  current: GameAccelConfig,
  patch: GameAccelConfigPatch
): GameAccelConfig {
  return {
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
}

/** Read-modify-write helper: the whole mutation runs inside the write queue. */
export async function mutateGameAccelConfig(
  mutate: (current: GameAccelConfig) => GameAccelConfig | Promise<GameAccelConfig>
): Promise<GameAccelConfig> {
  return configWriteQueue.run(async () => {
    const current = await loadGameAccelConfig()
    const next = await mutate(current)
    await writeGameAccelConfig(next)
    return next
  })
}

export async function patchGameAccelConfig(patch: GameAccelConfigPatch): Promise<GameAccelConfig> {
  return mutateGameAccelConfig((current) => mergeGameAccelConfig(current, patch))
}

export async function addDirectDomains(
  domains: string[],
  origin: 'user' | 'guard' = 'user'
): Promise<GameAccelConfig> {
  const normalized = [...new Set(domains)]
  return mutateGameAccelConfig((current) => {
    const targets = new Set(normalized)
    const customDirect = current.customDirect.filter(
      (entry) => entry.kind !== 'domain' || !targets.has(entry.value)
    )
    for (const value of normalized) {
      customDirect.push({ value, kind: 'domain', origin, addedAt: Date.now() })
    }
    return {
      ...current,
      customDirect,
      customProxy: current.customProxy.filter((value) => !targets.has(value))
    }
  })
}

export async function ignoreGuardHost(host: string): Promise<GameAccelConfig> {
  return mutateGameAccelConfig((current) => ({
    ...current,
    guard: {
      ...current.guard,
      ignored: [...new Set([...current.guard.ignored, host])]
    }
  }))
}
