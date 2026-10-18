export interface ParsedVersion {
  main: [number, number, number]
  pre: string[]
}

const VERSION_PATTERN = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

function parseVersion(input: string): ParsedVersion {
  const normalized = input.trim().replace(/^v/i, '')
  const match = VERSION_PATTERN.exec(normalized)
  if (!match) {
    return { main: [0, 0, 0], pre: [] }
  }
  return {
    main: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)],
    pre: match[4] ? match[4].split('.') : []
  }
}

function comparePreIdentifier(a: string, b: string): number {
  const aNumeric = /^\d+$/.test(a)
  const bNumeric = /^\d+$/.test(b)
  if (aNumeric && bNumeric) {
    const left = Number(a)
    const right = Number(b)
    return left === right ? 0 : left > right ? 1 : -1
  }
  if (aNumeric) return -1
  if (bNumeric) return 1
  return a === b ? 0 : a > b ? 1 : -1
}

/**
 * Compares two SemVer-like versions.
 *
 * Returns 1 when `a` is newer, -1 when `b` is newer, and 0 when equal.
 * A release is newer than its prerelease, prerelease identifiers are compared
 * segment by segment, and invalid versions fall back to 0.0.0.
 */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a)
  const vb = parseVersion(b)

  for (let i = 0; i < 3; i++) {
    if (va.main[i] === vb.main[i]) continue
    return va.main[i] > vb.main[i] ? 1 : -1
  }

  if (va.pre.length === 0 && vb.pre.length === 0) return 0
  if (va.pre.length === 0) return 1
  if (vb.pre.length === 0) return -1

  const length = Math.max(va.pre.length, vb.pre.length)
  for (let i = 0; i < length; i++) {
    const left = va.pre[i]
    const right = vb.pre[i]
    if (left === undefined) return -1
    if (right === undefined) return 1
    const result = comparePreIdentifier(left, right)
    if (result !== 0) return result
  }
  return 0
}
