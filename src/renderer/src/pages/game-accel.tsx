import BasePage from '@renderer/components/base/base-page'
import { toast } from '@renderer/components/base/toast'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
  Switch
} from '@heroui/react'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useGroups } from '@renderer/hooks/use-groups'
import {
  gameAccelAddFromPath,
  gameAccelDiagnose,
  gameAccelGetLiveState,
  gameAccelGetPresets,
  gameAccelGetState,
  gameAccelHandleGuardAlert,
  gameAccelOptimizeGroup,
  gameAccelPatchConfig,
  gameAccelRestoreAuto,
  gameAccelScan,
  gameAccelSetPlatformDirect,
  gameAccelStartCapture,
  gameAccelStopCapture
} from '@renderer/utils/game-accel-ipc'
import { getFilePath, mihomoChangeProxy } from '@renderer/utils/ipc'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IoAdd, IoCheckmarkCircleOutline, IoTrashOutline, IoWarningOutline } from 'react-icons/io5'
import { useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import type {
  GameAccelConfig,
  GameAccelDiagnostic,
  GameAccelLiveState,
  GameCandidate,
  GameItem,
  PlatformPreset,
  PlatformSetting
} from '../../../shared/game/types'

const DEFAULT_PLATFORMS = [
  { id: 'steam', name: 'Steam' },
  { id: 'epic', name: 'Epic Games' }
]

const EMPTY_PLATFORM: PlatformSetting = {
  enable: false,
  extraDownload: [],
  extraDownloadKeyword: [],
  extraPlatform: [],
  removed: []
}

function candidateKey(candidate: GameCandidate): string {
  return `${candidate.source}:${candidate.sourceId}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

interface GroupAction {
  label: string
  onPress: () => Promise<void>
}

interface GroupCardProps {
  testId: string
  title: string
  groupName: string
  groups: IMihomoMixedGroup[] | undefined
  hint: string
  disabled?: boolean
  actions?: GroupAction[]
  onChange: (group: string, proxy: string) => Promise<void>
}

const GroupCard: React.FC<GroupCardProps> = ({
  testId,
  title,
  groupName,
  groups,
  hint,
  disabled = false,
  actions = [],
  onChange
}) => {
  const [changing, setChanging] = useState(false)
  const group = groups?.find((item) => item.name === groupName)

  return (
    <div data-testid={testId}>
      <Card className="h-full border border-default-200 shadow-none">
        <CardBody className="gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="min-w-0 truncate font-bold">{title}</h3>
            <Chip size="sm" variant="flat" color={group?.now === 'DIRECT' ? 'default' : 'primary'}>
              {group?.now ?? '—'}
            </Chip>
          </div>
          {group ? (
            <Select
              size="sm"
              aria-label={title}
              selectedKeys={[group.now]}
              isDisabled={disabled || changing}
              onSelectionChange={async (selection) => {
                const proxy = selection.currentKey
                if (!proxy || proxy === group.now) return
                setChanging(true)
                try {
                  await onChange(group.name, proxy)
                } finally {
                  setChanging(false)
                }
              }}
            >
              {group.all.map((proxy) => (
                <SelectItem key={proxy.name}>{proxy.name}</SelectItem>
              ))}
            </Select>
          ) : (
            <p className="text-tiny leading-5 text-default-500">{hint}</p>
          )}
          {group && actions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {actions.map((action) => (
                <Button
                  key={action.label}
                  size="sm"
                  variant="flat"
                  isDisabled={disabled || changing}
                  onPress={() => void action.onPress()}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

const GameAccel: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: state, mutate: mutateState } = useSWR('gameAccelGetState', gameAccelGetState, {
    revalidateOnFocus: false
  })
  const { data: liveData, mutate: mutateLive } = useSWR(
    'gameAccelGetLiveState',
    gameAccelGetLiveState,
    { refreshInterval: 5000, revalidateOnFocus: false }
  )
  const { groups, mutate: mutateGroups } = useGroups()
  const { data: presets } = useSWR('gameAccelGetPresets', gameAccelGetPresets, {
    revalidateOnFocus: false
  })
  const platformItems: Pick<PlatformPreset, 'id' | 'name'>[] = presets?.length
    ? presets
    : DEFAULT_PLATFORMS
  const { controledMihomoConfig } = useControledMihomoConfig()
  const [draft, setDraft] = useState<GameAccelConfig>()
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanAdding, setScanAdding] = useState(false)
  const [scanResults, setScanResults] = useState<GameCandidate[]>([])
  const [scanSelected, setScanSelected] = useState<Set<string>>(new Set())
  const [live, setLive] = useState<GameAccelLiveState>()
  const [diagnostics, setDiagnostics] = useState<GameAccelDiagnostic[]>([])
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (state && !dirty) setDraft(state.config)
  }, [state, dirty])

  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on('gameAccelUpdated', () => {
      void mutateState()
      void mutateGroups()
    })
    return unsubscribe
  }, [mutateState, mutateGroups])

  useEffect(() => {
    if (liveData) setLive(liveData)
  }, [liveData])

  useEffect(() => {
    const offLive = window.electron.ipcRenderer.on('gameAccelLiveUpdated', (_event, info) => {
      setLive(info as GameAccelLiveState)
    })
    const offAlert = window.electron.ipcRenderer.on('gameAccelGuardAlert', () => {
      void mutateLive()
    })
    return () => {
      offLive()
      offAlert()
    }
  }, [mutateLive])

  if (!draft) {
    return (
      <BasePage title={t('gameAccel.title')}>
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      </BasePage>
    )
  }

  const tunEnabled = controledMihomoConfig?.tun?.enable === true
  const generatedNames = Object.values(draft.groupNames)
  const upstreamNames = [
    ...(draft.platformUpstream && !generatedNames.includes(draft.platformUpstream)
      ? [draft.platformUpstream]
      : []),
    ...(groups ?? [])
      .map((group) => group.name)
      .filter((name) => !generatedNames.includes(name) && name !== draft.platformUpstream)
  ]
  const upstreamOptions = upstreamNames.filter((name) => name !== 'auto')

  const update = (patch: Partial<GameAccelConfig>): void => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
    setDirty(true)
  }

  const updatePlatform = (id: string, enable: boolean): void => {
    const current = draft.platforms[id] ?? EMPTY_PLATFORM
    update({
      platforms: {
        ...draft.platforms,
        [id]: { ...current, enable }
      }
    })
  }

  const updateGame = (id: string, enable: boolean): void => {
    update({
      games: draft.games.map((game) => (game.id === id ? { ...game, enable } : game))
    })
  }

  const removeGame = (id: string): void => {
    update({ games: draft.games.filter((game) => game.id !== id) })
  }

  const addGame = async (): Promise<void> => {
    setAdding(true)
    try {
      const files = await getFilePath(['exe'], t('gameAccel.addGameTitle'), 'Executable')
      if (!files?.length) return
      const results = await Promise.all(files.map((file) => gameAccelAddFromPath(file)))
      const additions = results.filter((result) => !result.duplicate).map((result) => result.game)
      if (!additions.length) {
        toast.error(t('gameAccel.duplicateGame'))
        return
      }
      update({ games: [...draft.games, ...additions] })
      if (results.some((result) => result.duplicate)) {
        toast.error(t('gameAccel.duplicateGame'))
      }
    } catch (error) {
      toast.error(String(error))
    } finally {
      setAdding(false)
    }
  }

  const isScanCandidateAdded = (candidate: GameCandidate): boolean => {
    const directory = candidate.directory.toLowerCase()
    return draft.games.some((game) =>
      [...game.match.directories, ...game.match.processPaths].some((value) => {
        const normalized = value.toLowerCase()
        return normalized === directory || normalized.startsWith(`${directory}\\`)
      })
    )
  }

  const scan = async (): Promise<void> => {
    setScanOpen(true)
    setScanning(true)
    setScanResults([])
    try {
      const results = await gameAccelScan()
      setScanResults(results)
      setScanSelected(
        new Set(results.filter((candidate) => !isScanCandidateAdded(candidate)).map(candidateKey))
      )
    } catch (error) {
      toast.error(`${t('gameAccel.scanFailed')}: ${String(error)}`)
    } finally {
      setScanning(false)
    }
  }

  const toggleScan = (key: string): void => {
    setScanSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const addScanSelected = async (): Promise<void> => {
    setScanAdding(true)
    try {
      const selected = scanResults.filter(
        (candidate) => scanSelected.has(candidateKey(candidate)) && !isScanCandidateAdded(candidate)
      )
      const additions: GameItem[] = []
      for (const candidate of selected) {
        const result = await gameAccelAddFromPath(candidate.directory)
        if (result.duplicate) continue
        additions.push({
          ...result.game,
          name: candidate.name,
          source: candidate.source,
          sourceId: candidate.sourceId,
          icon: result.game.icon ?? candidate.icon,
          match: { ...result.game.match, directories: [candidate.directory] }
        })
      }
      if (!additions.length) {
        toast.error(t('gameAccel.duplicateGame'))
        return
      }
      update({ games: [...draft.games, ...additions] })
      setScanOpen(false)
    } catch (error) {
      toast.error(String(error))
    } finally {
      setScanAdding(false)
    }
  }

  const runDiagnose = async (): Promise<void> => {
    setChecking(true)
    try {
      const result = await gameAccelDiagnose()
      setDiagnostics(result)
      if (result.length === 0) toast.success(t('gameAccel.diagnoseEmpty'))
    } catch (error) {
      toast.error(`${t('gameAccel.diagnoseFailed')}: ${String(error)}`)
    } finally {
      setChecking(false)
    }
  }

  const toggleCapture = async (): Promise<void> => {
    try {
      if (live?.captureActive) await gameAccelStopCapture()
      else await gameAccelStartCapture()
      await mutateLive()
    } catch (error) {
      toast.error(String(error))
    }
  }

  const handleAlert = async (id: string, action: 'direct' | 'proxy' | 'ignored'): Promise<void> => {
    try {
      await gameAccelHandleGuardAlert(id, action)
      await mutateLive()
    } catch (error) {
      toast.error(String(error))
    }
  }

  const addCaptured = async (processPath: string): Promise<void> => {
    try {
      const result = await gameAccelAddFromPath(processPath)
      if (result.duplicate) {
        toast.error(t('gameAccel.duplicateGame'))
        return
      }
      update({ games: [...draft.games, result.game] })
      toast.success(t('gameAccel.captureAdded'))
    } catch (error) {
      toast.error(String(error))
    }
  }

  const optimizeGameGroup = async (): Promise<void> => {
    try {
      const best = await gameAccelOptimizeGroup(draft.groupNames.game)
      if (!best) {
        toast.error(t('gameAccel.optimizeFailed'))
        return
      }
      await mutateGroups()
      toast.success(`${t('gameAccel.optimized')}: ${best}`)
    } catch (error) {
      toast.error(String(error))
    }
  }

  const setPlatformDirect = async (): Promise<void> => {
    try {
      await gameAccelSetPlatformDirect()
      await mutateGroups()
    } catch (error) {
      toast.error(String(error))
    }
  }

  const restorePlatformAuto = async (): Promise<void> => {
    try {
      await gameAccelRestoreAuto()
      await mutateGroups()
    } catch (error) {
      toast.error(String(error))
    }
  }

  const persist = async (next: GameAccelConfig): Promise<void> => {
    setSaving(true)
    try {
      await gameAccelPatchConfig(next)
      const updated = await mutateState()
      if (updated) setDraft(updated.config)
      setDirty(false)
      setOnboardingOpen(false)
      toast.success(t('gameAccel.saved'))
    } catch (error) {
      toast.error(String(error))
    } finally {
      setSaving(false)
    }
  }

  const save = (): void => {
    if (draft) void persist(draft)
  }

  const changeGroupProxy = async (group: string, proxy: string): Promise<void> => {
    try {
      await mihomoChangeProxy(group, proxy)
      await mutateGroups()
    } catch (error) {
      toast.error(String(error))
    }
  }

  return (
    <BasePage
      title={t('gameAccel.title')}
      header={
        <div className="flex items-center gap-2">
          <span data-testid="game-diagnose">
            <Button
              size="sm"
              variant="flat"
              isLoading={checking}
              onPress={() => void runDiagnose()}
            >
              {t('gameAccel.diagnose')}
            </Button>
          </span>
          <span data-testid="game-save">
            <Button
              id="game-save"
              size="sm"
              color="primary"
              isLoading={saving}
              isDisabled={!dirty}
              onPress={() => void save()}
            >
              {t('common.save')}
            </Button>
          </span>
        </div>
      }
    >
      <div data-testid="game-accel-page" className="flex flex-col gap-3 p-3">
        {draft.enable && !tunEnabled && (
          <Card className="border border-warning/30 bg-warning/10 shadow-none">
            <CardBody className="flex flex-row items-center gap-3 p-3">
              <IoWarningOutline className="shrink-0 text-xl text-warning" />
              <p className="min-w-0 flex-1 text-small">{t('gameAccel.tunWarning')}</p>
              <Button size="sm" variant="flat" color="warning" onPress={() => navigate('/tun')}>
                {t('gameAccel.goTun')}
              </Button>
            </CardBody>
          </Card>
        )}

        {diagnostics.length > 0 && (
          <Card className="shadow-none">
            <CardHeader className="flex items-center justify-between gap-2 p-4 pb-0">
              <h3 className="font-bold">{t('gameAccel.diagnose')}</h3>
              <Button size="sm" variant="light" onPress={() => setDiagnostics([])}>
                {t('common.close')}
              </Button>
            </CardHeader>
            <CardBody className="gap-2 p-4">
              {diagnostics.map((diagnostic, index) => (
                <div
                  key={`${diagnostic.code}-${index}`}
                  className="flex items-start gap-2 rounded-medium border border-default-200 p-3"
                >
                  <Chip
                    size="sm"
                    variant="flat"
                    color={
                      diagnostic.level === 'error'
                        ? 'danger'
                        : diagnostic.level === 'warning'
                          ? 'warning'
                          : 'primary'
                    }
                  >
                    {diagnostic.level}
                  </Chip>
                  <div className="min-w-0">
                    <p className="text-small">{diagnostic.message}</p>
                    <p className="text-tiny text-default-500">{diagnostic.code}</p>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        <Card className="shadow-none">
          <CardBody className="gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div data-testid="game-enable">
                  <Switch
                    aria-label={t('gameAccel.enable')}
                    isSelected={draft.enable}
                    onValueChange={(enable) => {
                      if (
                        enable &&
                        (!tunEnabled ||
                          Object.values(draft.platforms).every((item) => !item.enable))
                      ) {
                        setOnboardingOpen(true)
                        return
                      }
                      update({ enable })
                    }}
                  />
                </div>
                <div>
                  <p className="font-bold">{t('gameAccel.enable')}</p>
                  <p className="text-tiny text-default-500">{t('gameAccel.enableHint')}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div data-testid="game-mode" className="flex items-center gap-2">
                  <span className="text-small text-default-500">{t('gameAccel.mode')}</span>
                  <Select
                    size="sm"
                    className="w-28"
                    aria-label={t('gameAccel.mode')}
                    selectedKeys={[draft.mode]}
                    disallowEmptySelection
                    onSelectionChange={(selection) => {
                      const mode = selection.currentKey
                      if (mode === 'overlay' || mode === 'exclusive') update({ mode })
                    }}
                  >
                    <SelectItem key="overlay">{t('gameAccel.modeOverlay')}</SelectItem>
                    <SelectItem key="exclusive">{t('gameAccel.modeExclusive')}</SelectItem>
                  </Select>
                </div>

                <div data-testid="game-upstream" className="flex items-center gap-2">
                  <span className="text-small text-default-500">{t('gameAccel.upstream')}</span>
                  <select
                    className="h-8 w-44 rounded-medium border border-default-200 bg-transparent px-2 text-small"
                    aria-label={t('gameAccel.upstream')}
                    value={draft.platformUpstream ?? 'auto'}
                    onChange={(event) => {
                      const value = event.target.value
                      update({ platformUpstream: value === 'auto' ? undefined : value })
                    }}
                  >
                    <option value="auto">{t('gameAccel.upstreamAuto')}</option>
                    {upstreamOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div data-testid="game-download-proxy" className="flex items-center gap-2">
                  <Switch
                    aria-label={t('gameAccel.downloadViaProxy')}
                    isSelected={draft.downloadViaProxy}
                    onValueChange={(downloadViaProxy) => update({ downloadViaProxy })}
                  />
                  <span className="text-small">{t('gameAccel.downloadViaProxy')}</span>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex items-center justify-between gap-2 p-4 pb-0">
            <h3 className="font-bold">{t('gameAccel.live')}</h3>
            <Button
              size="sm"
              variant="flat"
              isDisabled={!draft.enable}
              onPress={() => void toggleCapture()}
            >
              {live?.captureActive ? t('gameAccel.captureStop') : t('gameAccel.captureStart')}
            </Button>
          </CardHeader>
          <CardBody className="gap-4 p-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <p className="text-tiny text-default-500">{t('gameAccel.currentGame')}</p>
                <p className="mt-1 text-small font-medium">
                  {live?.currentGame?.name ?? t('gameAccel.noCurrentGame')}
                </p>
              </div>
              <div>
                <p className="text-tiny text-default-500">{t('gameAccel.connections')}</p>
                <p className="mt-1 text-small font-medium">{live?.connections ?? 0}</p>
              </div>
              <div>
                <p className="text-tiny text-default-500">↑</p>
                <p className="mt-1 text-small font-medium">
                  {formatBytes(live?.uploadSpeed ?? 0)}/s
                </p>
              </div>
              <div>
                <p className="text-tiny text-default-500">↓</p>
                <p className="mt-1 text-small font-medium">
                  {formatBytes(live?.downloadSpeed ?? 0)}/s
                </p>
              </div>
            </div>

            {live?.captureActive && (
              <div className="flex flex-col gap-2">
                <p className="text-small font-medium">{t('gameAccel.capture')}</p>
                {live.capture.length === 0 ? (
                  <p className="text-tiny text-default-500">{t('gameAccel.captureEmpty')}</p>
                ) : (
                  live.capture.slice(0, 8).map((item) => (
                    <div
                      key={item.processPath || item.process}
                      className="flex items-center gap-3 rounded-medium border border-default-200 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-small font-medium">{item.process}</p>
                        <p className="truncate text-tiny text-default-500">
                          {item.processPath || '—'}
                        </p>
                        <p className="text-tiny text-default-500">
                          {item.connections} · UDP {(item.udpRatio * 100).toFixed(0)}% ·{' '}
                          {formatBytes(item.download)}
                          {item.countries.length > 0 ? ` · ${item.countries.join(', ')}` : ''}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="flat"
                        isDisabled={!item.processPath}
                        onPress={() => void addCaptured(item.processPath)}
                      >
                        {t('gameAccel.addProcess')}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}

            {live && live.alerts.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-small font-medium">{t('gameAccel.guardAlerts')}</p>
                {live.alerts.slice(0, 5).map((alert) => (
                  <div
                    key={alert.id}
                    className="flex flex-col gap-2 rounded-medium border border-warning/30 bg-warning/10 p-3 md:flex-row md:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-small font-medium">{alert.host}</p>
                      <p className="truncate text-tiny text-default-500">
                        {alert.process} · {formatBytes(alert.speed)}/s · {alert.chain.join(' → ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => void handleAlert(alert.id, 'direct')}
                      >
                        {t('gameAccel.markDirect')}
                      </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => void handleAlert(alert.id, 'proxy')}
                      >
                        {t('gameAccel.markProxy')}
                      </Button>
                      <Button
                        size="sm"
                        variant="light"
                        onPress={() => void handleAlert(alert.id, 'ignored')}
                      >
                        {t('gameAccel.ignore')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="p-4 pb-0">
            <h3 className="font-bold">{t('gameAccel.groups')}</h3>
          </CardHeader>
          <CardBody className="grid gap-3 p-4 md:grid-cols-3">
            <GroupCard
              testId="game-group-game"
              title={draft.groupNames.game}
              groupName={draft.groupNames.game}
              groups={groups}
              hint={t('gameAccel.groupPending')}
              actions={[{ label: t('gameAccel.optimize'), onPress: optimizeGameGroup }]}
              onChange={changeGroupProxy}
            />
            <GroupCard
              testId="game-group-platform"
              title={draft.groupNames.platform}
              groupName={draft.groupNames.platform}
              groups={groups}
              hint={t('gameAccel.groupPending')}
              actions={[
                { label: t('gameAccel.webDirect'), onPress: setPlatformDirect },
                { label: t('gameAccel.restoreAuto'), onPress: restorePlatformAuto }
              ]}
              onChange={changeGroupProxy}
            />
            <GroupCard
              testId="game-group-download"
              title={draft.groupNames.download}
              groupName={draft.groupNames.download}
              groups={groups}
              hint={t('gameAccel.groupPending')}
              disabled={!draft.downloadViaProxy}
              onChange={changeGroupProxy}
            />
          </CardBody>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="p-4 pb-0">
            <h3 className="font-bold">{t('gameAccel.platforms')}</h3>
          </CardHeader>
          <CardBody className="flex flex-wrap gap-3 p-4">
            {platformItems.map((platform) => (
              <div
                key={platform.id}
                data-testid={`platform-${platform.id}`}
                className="flex items-center gap-2 rounded-medium border border-default-200 px-3 py-2"
              >
                <Switch
                  aria-label={platform.name}
                  isSelected={draft.platforms[platform.id]?.enable ?? false}
                  onValueChange={(enable) => updatePlatform(platform.id, enable)}
                />
                <span className="text-small">{platform.name}</span>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex items-center justify-between gap-2 p-4 pb-0">
            <h3 className="font-bold">{t('gameAccel.games')}</h3>
            <div className="flex items-center gap-2">
              <span data-testid="game-scan">
                <Button size="sm" variant="flat" isLoading={scanning} onPress={() => void scan()}>
                  {t('gameAccel.scan')}
                </Button>
              </span>
              <span data-testid="game-add">
                <Button
                  size="sm"
                  variant="flat"
                  color="primary"
                  isLoading={adding}
                  startContent={<IoAdd />}
                  onPress={() => void addGame()}
                >
                  {t('gameAccel.addGame')}
                </Button>
              </span>
            </div>
          </CardHeader>
          <CardBody className="p-4">
            {draft.games.length === 0 ? (
              <p className="text-small text-default-500">{t('gameAccel.emptyGames')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {draft.games.map((game) => (
                  <div
                    key={game.id}
                    data-testid={`game-item-${game.id}`}
                    className="flex items-center gap-3 rounded-medium border border-default-200 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{game.name}</p>
                      <p className="text-tiny text-default-500 truncate">
                        {game.match.processPaths[0] ??
                          game.match.directories[0] ??
                          game.match.processNames[0] ??
                          '—'}
                      </p>
                    </div>
                    <Chip size="sm" variant="flat">
                      {game.source === 'manual' ? t('gameAccel.manualSource') : game.source}
                    </Chip>
                    <Switch
                      aria-label={game.name}
                      isSelected={game.enable}
                      onValueChange={(enable) => updateGame(game.id, enable)}
                    />
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="danger"
                      aria-label={t('common.delete')}
                      onPress={() => removeGame(game.id)}
                    >
                      <IoTrashOutline />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal
        isOpen={onboardingOpen}
        onOpenChange={setOnboardingOpen}
        size="lg"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t('gameAccel.onboarding.title')}</ModalHeader>
              <ModalBody>
                <div data-testid="game-onboarding" className="flex flex-col gap-4">
                  <p className="text-small leading-6 text-default-500">
                    {t('gameAccel.onboarding.description')}
                  </p>

                  <div
                    className={`flex items-center gap-3 rounded-medium border p-3 ${tunEnabled ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning'}`}
                  >
                    {tunEnabled ? (
                      <IoCheckmarkCircleOutline className="shrink-0 text-xl" />
                    ) : (
                      <IoWarningOutline className="shrink-0 text-xl" />
                    )}
                    <p className="min-w-0 flex-1 text-small">
                      {tunEnabled
                        ? t('gameAccel.onboarding.tunOn')
                        : t('gameAccel.onboarding.tunOff')}
                    </p>
                    {!tunEnabled && (
                      <Button
                        size="sm"
                        variant="flat"
                        color="warning"
                        onPress={() => {
                          onClose()
                          navigate('/tun')
                        }}
                      >
                        {t('gameAccel.goTun')}
                      </Button>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-small font-medium">{t('gameAccel.platforms')}</p>
                    <div className="flex flex-wrap gap-3">
                      {platformItems.map((platform) => (
                        <div
                          key={platform.id}
                          className="flex items-center gap-2 rounded-medium border border-default-200 px-3 py-2"
                        >
                          <Switch
                            aria-label={platform.name}
                            isSelected={draft.platforms[platform.id]?.enable ?? false}
                            onValueChange={(enable) => updatePlatform(platform.id, enable)}
                          />
                          <span className="text-small">{platform.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-small font-medium">{t('gameAccel.upstream')}</p>
                    <select
                      className="h-9 w-full rounded-medium border border-default-200 bg-transparent px-2 text-small"
                      aria-label={t('gameAccel.upstream')}
                      value={draft.platformUpstream ?? 'auto'}
                      onChange={(event) => {
                        const value = event.target.value
                        update({ platformUpstream: value === 'auto' ? undefined : value })
                      }}
                    >
                      <option value="auto">{t('gameAccel.upstreamAuto')}</option>
                      {upstreamOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-tiny text-default-500">
                      {t('gameAccel.onboarding.nodeHint')}
                    </p>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {t('gameAccel.onboarding.cancel')}
                </Button>
                <Button
                  color="primary"
                  isLoading={saving}
                  onPress={() => void persist({ ...draft, enable: true })}
                >
                  {t('gameAccel.onboarding.confirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal isOpen={scanOpen} onOpenChange={setScanOpen} size="2xl" scrollBehavior="inside">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t('gameAccel.scan')}</ModalHeader>
              <ModalBody>
                <div data-testid="game-scan-results" className="flex flex-col gap-2">
                  {scanning ? (
                    <div className="flex items-center justify-center p-6">
                      <Spinner />
                    </div>
                  ) : scanResults.length === 0 ? (
                    <p className="p-4 text-small text-default-500">{t('gameAccel.scanEmpty')}</p>
                  ) : (
                    scanResults.map((candidate) => {
                      const key = candidateKey(candidate)
                      const added = isScanCandidateAdded(candidate)
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-3 rounded-medium border border-default-200 p-3 ${added ? 'opacity-60' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={added || scanSelected.has(key)}
                            disabled={added}
                            onChange={() => toggleScan(key)}
                          />
                          {candidate.icon && (
                            <img
                              src={candidate.icon}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-medium object-contain"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-small font-medium">{candidate.name}</p>
                            <p className="truncate text-tiny text-default-500">
                              {candidate.source} · {candidate.directory}
                            </p>
                          </div>
                          {added && (
                            <Chip size="sm" variant="flat">
                              {t('gameAccel.scanAdded')}
                            </Chip>
                          )}
                        </label>
                      )
                    })
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {t('common.cancel')}
                </Button>
                <Button
                  color="primary"
                  isDisabled={scanning || scanSelected.size === 0}
                  isLoading={scanAdding}
                  onPress={() => void addScanSelected()}
                >
                  {`${t('gameAccel.scanAdd')} (${scanSelected.size})`}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </BasePage>
  )
}

export default GameAccel
