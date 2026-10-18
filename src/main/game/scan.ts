import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { GAME_ACCEL_LOG_SCOPE } from '../../shared/game/constants'
import type { GameCandidate } from '../../shared/game/types'
import { createLogger } from '../utils/logger'
import { gameAccelCachePath } from './store'

const logger = createLogger(GAME_ACCEL_LOG_SCOPE)
const VDF_PATH = /"path"\s+"([^"]+)"/g

function unescapeVdf(value: string): string {
  return value.replace(/\\\\/g, '\\')
}

async function isFile(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isFile()
  } catch {
    return false
  }
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory()
  } catch {
    return false
  }
}

function steamRoots(): string[] {
  const roots = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => path.join(value, 'Steam'))
  roots.push('C:\\Steam')
  return [...new Set(roots.map((value) => path.resolve(value)))]
}

async function steamLibraries(): Promise<string[]> {
  const libraries = new Set<string>()
  for (const root of steamRoots()) {
    const libraryFile = path.join(root, 'steamapps', 'libraryfolders.vdf')
    if (await isFile(libraryFile)) {
      const content = await readFile(libraryFile, 'utf8').catch(() => '')
      for (const match of content.matchAll(VDF_PATH)) {
        const library = match[1]?.trim()
        if (library) libraries.add(path.resolve(unescapeVdf(library)))
      }
    }
    if (await isDirectory(path.join(root, 'steamapps'))) libraries.add(root)
  }
  return [...libraries]
}

function acfField(content: string, name: string): string | undefined {
  const match = content.match(new RegExp(`"${name}"\\s+"([^"]*)"`, 'i'))
  return match?.[1]
}

async function scanSteam(): Promise<GameCandidate[]> {
  const candidates: GameCandidate[] = []
  for (const library of await steamLibraries()) {
    const steamapps = path.join(library, 'steamapps')
    if (!(await isDirectory(steamapps))) continue
    const entries = await readdir(steamapps).catch(() => [])
    for (const entry of entries) {
      if (!/^appmanifest_\d+\.acf$/i.test(entry)) continue
      const content = await readFile(path.join(steamapps, entry), 'utf8').catch(() => '')
      const name = acfField(content, 'name')
      const installDir = acfField(content, 'installdir')
      const appid = acfField(content, 'appid') ?? entry.match(/\d+/)?.[0]
      if (!name || !installDir || !appid) continue
      const directory = path.resolve(steamapps, 'common', unescapeVdf(installDir))
      if (!(await isDirectory(directory))) continue
      candidates.push({
        source: 'steam',
        sourceId: appid,
        name,
        directory,
        executables: [],
        added: false
      })
    }
  }
  return candidates
}

async function scanEpic(): Promise<GameCandidate[]> {
  const manifestDir = process.env.ProgramData
    ? path.join(process.env.ProgramData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')
    : ''
  if (!manifestDir || !(await isDirectory(manifestDir))) return []

  const candidates: GameCandidate[] = []
  const entries = await readdir(manifestDir).catch(() => [])
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.item')) continue
    const content = await readFile(path.join(manifestDir, entry), 'utf8').catch(() => '')
    let data: Record<string, unknown>
    try {
      data = JSON.parse(content) as Record<string, unknown>
    } catch {
      continue
    }
    const name =
      typeof data.DisplayName === 'string'
        ? data.DisplayName
        : typeof data.AppName === 'string'
          ? data.AppName
          : ''
    const install = typeof data.InstallLocation === 'string' ? data.InstallLocation : ''
    if (!name || !install) continue
    const directory = path.resolve(install)
    if (!(await isDirectory(directory))) continue
    const launch = typeof data.LaunchExecutable === 'string' ? data.LaunchExecutable.trim() : ''
    const executables = launch
      ? [path.isAbsolute(launch) ? launch : path.join(directory, launch)]
      : []
    candidates.push({
      source: 'epic',
      sourceId:
        typeof data.AppName === 'string'
          ? data.AppName
          : typeof data.CatalogItemId === 'string'
            ? data.CatalogItemId
            : entry,
      name,
      directory,
      executables,
      added: false
    })
  }
  return candidates
}

function dedupe(candidates: GameCandidate[]): GameCandidate[] {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key =
      process.platform === 'win32' ? candidate.directory.toLowerCase() : candidate.directory
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function scanGameCandidates(): Promise<GameCandidate[]> {
  const candidates = dedupe([...(await scanSteam()), ...(await scanEpic())])
  try {
    await mkdir(path.dirname(gameAccelCachePath()), { recursive: true })
    await writeFile(
      gameAccelCachePath(),
      `${JSON.stringify({ version: 1, scannedAt: Date.now(), candidates }, null, 2)}\n`,
      'utf8'
    )
  } catch (error) {
    logger.warn('Failed to write game scan cache', error)
  }
  logger.info(`Game scan finished, candidates=${candidates.length}`)
  return candidates
}
