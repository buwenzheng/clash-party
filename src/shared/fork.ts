// Fork-specific release identity.
// Keep the repository slug in one place so switching the fork only touches this file.
export const FORK_REPO = 'buwenzheng/clash-party'
export const FORK_REPO_URL = `https://github.com/${FORK_REPO}`
export const FORK_RELEASES_URL = `${FORK_REPO_URL}/releases`
export const FORK_LATEST_YML_URL = `${FORK_RELEASES_URL}/latest/download/latest.yml`
export const FORK_ISSUES_URL = `${FORK_REPO_URL}/issues/new/choose`

function stripLeadingV(version: string): string {
  return version.replace(/^v/i, '')
}

export function forkReleaseTagUrl(version: string): string {
  return `${FORK_RELEASES_URL}/tag/v${stripLeadingV(version)}`
}

export function forkReleaseDownloadUrl(version: string): string {
  return `${FORK_RELEASES_URL}/download/v${stripLeadingV(version)}/`
}
