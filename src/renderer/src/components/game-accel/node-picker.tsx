import {
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader
} from '@heroui/react'
import { mihomoProxyDelay } from '@renderer/utils/ipc'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IoCheckmarkCircleOutline } from 'react-icons/io5'
import { TbBolt } from 'react-icons/tb'

export interface NodePickerItem {
  name: string
  kind: 'group' | 'node'
  udp?: boolean
  provider?: string
  history?: IMihomoHistory[]
}

export interface NodePickerSpecialOption {
  value: string
  label: string
  description?: string
}

interface NodePickerModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: string
  items: NodePickerItem[]
  specialOptions?: NodePickerSpecialOption[]
  current?: string
  onSelect: (value: string) => void | Promise<void>
}

function lastDelay(history?: IMihomoHistory[]): number | undefined {
  const latest = history?.at(-1)
  return typeof latest?.delay === 'number' ? latest.delay : undefined
}

function delayColor(delay: number | undefined): 'default' | 'success' | 'warning' | 'danger' {
  if (delay === undefined) return 'default'
  if (delay <= 0) return 'danger'
  if (delay < 500) return 'success'
  return 'warning'
}

const NodePickerModal: React.FC<NodePickerModalProps> = ({
  isOpen,
  onOpenChange,
  title,
  items,
  specialOptions = [],
  current,
  onSelect
}) => {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [delays, setDelays] = useState<Record<string, number>>({})
  const [testing, setTesting] = useState<Set<string>>(new Set())
  const [testingAll, setTestingAll] = useState(false)
  const [selecting, setSelecting] = useState<string>()
  const query = search.trim().toLowerCase()
  const filteredSpecial = specialOptions.filter(
    (option) =>
      !query ||
      option.label.toLowerCase().includes(query) ||
      option.value.toLowerCase().includes(query)
  )
  const filteredItems = useMemo(
    () => (query ? items.filter((item) => item.name.toLowerCase().includes(query)) : items),
    [items, query]
  )
  const groups = filteredItems.filter((item) => item.kind === 'group')
  const nodes = filteredItems.filter((item) => item.kind === 'node')

  const testItem = async (item: NodePickerItem): Promise<void> => {
    if (testing.has(item.name)) return
    setTesting((currentTesting) => new Set(currentTesting).add(item.name))
    try {
      const result = await mihomoProxyDelay(item.name, undefined, item.provider)
      setDelays((currentDelays) => ({
        ...currentDelays,
        [item.name]: typeof result.delay === 'number' ? result.delay : 0
      }))
    } catch {
      setDelays((currentDelays) => ({ ...currentDelays, [item.name]: 0 }))
    } finally {
      setTesting((currentTesting) => {
        const next = new Set(currentTesting)
        next.delete(item.name)
        return next
      })
    }
  }

  const testAll = async (): Promise<void> => {
    const queue = nodes.filter((item) => item.name !== 'DIRECT')
    if (queue.length === 0) return
    setTestingAll(true)
    try {
      const workers = Array.from({ length: Math.min(8, queue.length) }, async () => {
        while (queue.length > 0) {
          const item = queue.shift()
          if (item) await testItem(item)
        }
      })
      await Promise.all(workers)
    } finally {
      setTestingAll(false)
    }
  }

  const choose = async (value: string): Promise<void> => {
    if (value === current) {
      onOpenChange(false)
      return
    }
    setSelecting(value)
    try {
      await onSelect(value)
      onOpenChange(false)
    } finally {
      setSelecting(undefined)
    }
  }

  const delayLabel = (name: string, history?: IMihomoHistory[]): string => {
    if (testing.has(name)) return t('gameAccel.testing')
    const delay = delays[name] ?? lastDelay(history)
    if (delay === undefined) return t('gameAccel.notTested')
    if (delay <= 0) return t('proxies.delay.timeout')
    return `${delay} ms`
  }

  const delayFor = (name: string, history?: IMihomoHistory[]): number | undefined =>
    delays[name] ?? lastDelay(history)

  const row = (item: NodePickerItem): React.ReactNode => {
    const selected = current === item.name
    const delay = delayFor(item.name, item.history)
    return (
      <div
        key={`${item.kind}:${item.name}`}
        className={`flex w-full items-center gap-2 rounded-medium border px-3 py-2 transition-colors ${
          selected ? 'border-primary/40 bg-primary/10' : 'border-default-200 hover:bg-default-100'
        }`}
      >
        <div
          role="button"
          tabIndex={0}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
          onClick={() => void choose(item.name)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              void choose(item.name)
            }
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-small">{item.name}</span>
              {item.kind === 'group' && (
                <Chip size="sm" variant="flat">
                  {t('gameAccel.policyGroups')}
                </Chip>
              )}
              {item.kind === 'node' && item.udp === false && (
                <Chip size="sm" variant="flat" color="warning">
                  {t('gameAccel.policyTcpOnly')}
                </Chip>
              )}
            </div>
          </div>
          <Chip size="sm" variant="flat" color={delayColor(delay)}>
            {delayLabel(item.name, item.history)}
          </Chip>
          {selected ? <IoCheckmarkCircleOutline className="shrink-0 text-success" /> : null}
        </div>
        {item.kind === 'node' && (
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label={t('proxies.delay.test')}
            title={t('proxies.delay.test')}
            isLoading={testing.has(item.name)}
            onPress={() => void testItem(item)}
          >
            <TbBolt />
          </Button>
        )}
      </div>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) setSearch('')
        onOpenChange(open)
      }}
      size="3xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>{title}</ModalHeader>
            <ModalBody className="gap-3">
              <Input
                size="sm"
                isClearable
                value={search}
                onValueChange={setSearch}
                placeholder={t('gameAccel.searchNode')}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-tiny text-default-500">
                  {filteredItems.length} · {t('gameAccel.policyGroups')} {groups.length} ·{' '}
                  {t('gameAccel.policyNodes')} {nodes.length}
                </span>
                <Button
                  size="sm"
                  variant="flat"
                  isLoading={testingAll}
                  startContent={<TbBolt />}
                  onPress={() => void testAll()}
                >
                  {t('gameAccel.testAll')}
                </Button>
              </div>
              <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto pr-1">
                {filteredSpecial.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {filteredSpecial.map((option) => {
                      const selected = current === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`flex w-full items-center gap-2 rounded-medium border px-3 py-2 text-left ${
                            selected
                              ? 'border-primary/40 bg-primary/10'
                              : 'border-default-200 hover:bg-default-100'
                          }`}
                          disabled={selecting === option.value}
                          onClick={() => void choose(option.value)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-small">{option.label}</p>
                            {option.description && (
                              <p className="text-tiny text-default-500">{option.description}</p>
                            )}
                          </div>
                          {selected ? (
                            <IoCheckmarkCircleOutline className="shrink-0 text-success" />
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                )}
                {groups.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="px-1 text-tiny font-medium text-default-500">
                      {t('gameAccel.policyGroups')}
                    </p>
                    {groups.map(row)}
                  </div>
                )}
                {nodes.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="px-1 text-tiny font-medium text-default-500">
                      {t('gameAccel.policyNodes')}
                    </p>
                    {nodes.map(row)}
                  </div>
                )}
                {filteredSpecial.length === 0 && filteredItems.length === 0 && (
                  <p className="py-8 text-center text-small text-default-500">
                    {t('gameAccel.noMatch')}
                  </p>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button size="sm" variant="flat" onPress={onClose}>
                {t('common.close')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}

export default NodePickerModal
