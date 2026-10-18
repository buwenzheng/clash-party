const REGEX_META = /[\\^$.*+?()[\]{}|]/g

function escapeRegex(value: string): string {
  return value.replace(REGEX_META, '\\$&')
}

/**
 * Converts an install directory into a mihomo PROCESS-PATH-REGEX value.
 * A trailing separator prevents `Apex` from matching `Apex Legends 2`.
 * Commas are encoded as \x2C because mihomo splits rules on commas.
 */
export function directoryToProcessPathRegex(dir: string, platform: string): string {
  const normalized = dir.trim().replace(/[\\/]+$/, '')
  const separator = platform === 'win32' ? '\\' : '/'
  const escaped = escapeRegex(`${normalized}${separator}`).replace(/,/g, '\\x2C')
  return platform === 'linux' ? `^${escaped}` : `(?i)^${escaped}`
}

export function isValidDomain(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/\.$/, '')
  if (!normalized || normalized.length > 253) return false
  if (!/^[a-z0-9.-]+$/.test(normalized)) return false
  return normalized
    .split('.')
    .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
}

export function normalizeDomain(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\.$/, '')
  return isValidDomain(normalized) ? normalized : ''
}

export function isValidCidr(value: string): boolean {
  const normalized = value.trim()
  const slash = normalized.lastIndexOf('/')
  if (slash <= 0) return false
  const address = normalized.slice(0, slash)
  const prefix = Number(normalized.slice(slash + 1))
  if (!Number.isInteger(prefix)) return false

  if (address.includes(':')) {
    if (prefix < 0 || prefix > 128) return false
    if (!/^[0-9a-fA-F:]+$/.test(address)) return false
    return (address.match(/::/g)?.length ?? 0) <= 1
  }

  if (prefix < 0 || prefix > 32) return false
  const parts = address.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

export function normalizeCidr(value: string): string {
  const normalized = value.trim()
  return isValidCidr(normalized) ? normalized : ''
}

export function isValidProcessName(value: string): boolean {
  return value.trim().length > 0 && value.length <= 260 && !/[\r\n,]/.test(value)
}

export function isValidProcessPath(value: string): boolean {
  return value.trim().length > 0 && value.length <= 4096 && !/[\r\n,]/.test(value)
}

export function isValidGroupName(value: string): boolean {
  return value.trim().length > 0 && value.length <= 64 && !/[\r\n,]/.test(value)
}

export function formatRule(type: string, value: string, policy: string, extra?: string): string {
  return [type, value, policy, ...(extra ? [extra] : [])].join(',')
}

export function joinRuleList(rules: string[]): string {
  return rules.join('\n')
}

export function uniqueRules(rules: string[]): string[] {
  return Array.from(new Set(rules))
}
