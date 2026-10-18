import BasePage from '@renderer/components/base/base-page'
import { toast } from '@renderer/components/base/toast'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Select,
  SelectItem,
  Spinner,
  Switch
} from '@heroui/react'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { gameAccelGetState, gameAccelPatchConfig } from '@renderer/utils/game-accel-ipc'
import { getFilePath, mihomoChangeProxy } from '@renderer/utils/ipc'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IoAdd, IoTrashOutline, IoWarningOutline } from 'react-icons/io5'
import { useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import type { GameAccelConfig, GameItem, PlatformSetting } from '../../../shared/game/types'

const PLATFORMS = [
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic Games' }
] as const

const EMPTY_PLATFORM: PlatformSetting = {
  enable: false,
  extraDownload: [],
  extraDownloadKeyword: [],
  extraPlatform: [],
  removed: []
}

interface GroupCardProps {
  testId: string
  title: string
  groupName: string
  groups: IMihomoMixedGroup[] | undefined
  hint: string
  disabled?: boolean
  onChange: (group: string, proxy: string) => Promise<void>
}

const GroupCard: React.FC<GroupCardProps> = ({
  testId,
  title,
  groupName,
  groups,
  hint,
  disabled = false,
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
  const { groups, mutate: mutateGroups } = useGroups()
  const { controledMihomoConfig } = useControledMihomoConfig()
  const [draft, setDraft] = useState<GameAccelConfig>()
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)

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
      const now = Date.now()
      const games: GameItem[] = files.map((file) => {
        const base = file.split(/[\\/]/).pop() ?? file
        const directory = file.replace(/[\\/][^\\/]+$/, '')
        return {
          id: crypto.randomUUID(),
          name: base.replace(/\.exe$/i, ''),
          source: 'manual',
          enable: true,
          match: {
            directories: directory && directory !== file ? [directory] : [],
            processNames: [base],
            processPaths: [file],
            domains: [],
            ipCidrs: []
          },
          policy: 'inherit',
          routeMode: 'process',
          createdAt: now,
          updatedAt: now
        }
      })
      update({ games: [...draft.games, ...games] })
    } catch (error) {
      toast.error(String(error))
    } finally {
      setAdding(false)
    }
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await gameAccelPatchConfig(draft)
      const next = await mutateState()
      if (next) setDraft(next.config)
      setDirty(false)
      toast.success(t('gameAccel.saved'))
    } catch (error) {
      toast.error(String(error))
    } finally {
      setSaving(false)
    }
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

        <Card className="shadow-none">
          <CardBody className="gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div data-testid="game-enable">
                  <Switch
                    aria-label={t('gameAccel.enable')}
                    isSelected={draft.enable}
                    onValueChange={(enable) => update({ enable })}
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
              onChange={changeGroupProxy}
            />
            <GroupCard
              testId="game-group-platform"
              title={draft.groupNames.platform}
              groupName={draft.groupNames.platform}
              groups={groups}
              hint={t('gameAccel.groupPending')}
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
            {PLATFORMS.map((platform) => (
              <div
                key={platform.id}
                data-testid={`platform-${platform.id}`}
                className="flex items-center gap-2 rounded-medium border border-default-200 px-3 py-2"
              >
                <Switch
                  aria-label={platform.label}
                  isSelected={draft.platforms[platform.id]?.enable ?? false}
                  onValueChange={(enable) => updatePlatform(platform.id, enable)}
                />
                <span className="text-small">{platform.label}</span>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex items-center justify-between gap-2 p-4 pb-0">
            <h3 className="font-bold">{t('gameAccel.games')}</h3>
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
    </BasePage>
  )
}

export default GameAccel
