import { execSync } from 'child_process'
import { readFileSync } from 'fs'

// 获取Git commit hash
export function getGitCommitHash(short = true) {
  try {
    const command = short ? 'git rev-parse --short HEAD' : 'git rev-parse HEAD'
    return execSync(command, { encoding: 'utf-8' }).trim()
  } catch (error) {
    console.warn('Failed to get git commit hash:', error.message)
    return 'unknown'
  }
}

// 获取当前月份日期
export function getCurrentMonthDate() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${month}${day}`
}

// 当前 fork 的 GitHub 仓库。CI 中直接用 GITHUB_REPOSITORY，
// 本地构建则从 package.json 的 repository 字段读取，避免把上游仓库写死。
export function getRepoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
    const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
    const match = typeof url === 'string' ? url.match(/github\.com[/:]([^/]+)\/([^/]+)/) : null
    if (match) return `${match[1]}/${match[2].replace(/\.git$/, '')}`
  } catch (error) {
    console.warn('Failed to read repository from package.json:', error.message)
  }
  return 'buwenzheng/clash-party'
}

// 从package.json读取基础版本号
export function getBaseVersion() {
  try {
    const pkg = readFileSync('package.json', 'utf-8')
    const { version } = JSON.parse(pkg)
    // 移除 dev 版本后缀（兼容旧的 -d1018.hash 和新格式 -dev.1018.hash）
    return version.replace(/-d(?:ev\.)?\d{2,4}\.[a-f0-9]{7}$/, '')
  } catch (error) {
    console.error('Failed to read package.json:', error.message)
    return '1.0.0'
  }
}

// 生成dev版本号
export function getDevVersion() {
  const baseVersion = getBaseVersion()
  const monthDate = getCurrentMonthDate()
  const commitHash = getGitCommitHash(true)

  return `${baseVersion}-dev.${monthDate}.${commitHash}`
}

// 检查当前环境是否为dev构建
export function isDevBuild() {
  return (
    process.env.NODE_ENV === 'development' ||
    process.argv.includes('--dev') ||
    process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
  )
}

// 获取处理后的版本号
export function getProcessedVersion() {
  if (isDevBuild()) {
    return getDevVersion()
  } else {
    return getBaseVersion()
  }
}

// 生成下载URL
export function getDownloadUrl(isDev, version) {
  const repo = getRepoSlug()
  if (isDev) {
    return `https://github.com/${repo}/releases/download/dev`
  } else {
    return `https://github.com/${repo}/releases/download/v${version}`
  }
}

export function generateDownloadLinksMarkdown(downloadUrl, version, platforms = null) {
  const enabled = (name) => !platforms || platforms.includes(name)
  let links = '\n### 下载地址：\n\n'
  if (enabled('windows')) {
    links += '#### Windows x64：\n\n'
    links += `- 安装版：[64位](${downloadUrl}/clash-party-windows-${version}-x64-setup.exe)\n\n`
    links += `- 便携版：[64位](${downloadUrl}/clash-party-windows-${version}-x64-portable.7z)\n\n`
  }
  if (enabled('win7')) {
    links += '\n#### Windows7/8：\n\n'
    links += `- 安装版：[64位](${downloadUrl}/clash-party-win7-${version}-x64-setup.exe)\n\n`
    links += `- 便携版：[64位](${downloadUrl}/clash-party-win7-${version}-x64-portable.7z)\n\n`
  }
  if (enabled('macos')) {
    links += '\n#### macOS 11+：\n\n'
    links += `- PKG：[Intel](${downloadUrl}/clash-party-macos-${version}-x64.pkg) | [Apple Silicon](${downloadUrl}/clash-party-macos-${version}-arm64.pkg)\n\n`
  }
  if (enabled('catalina')) {
    links += '\n#### macOS 10.15+：\n\n'
    links += `- PKG：[Intel](${downloadUrl}/clash-party-catalina-${version}-x64.pkg) | [Apple Silicon](${downloadUrl}/clash-party-catalina-${version}-arm64.pkg)\n\n`
  }
  if (enabled('linux')) {
    links += '\n#### Linux：\n\n'
    links += `- DEB：[64位](${downloadUrl}/clash-party-linux-${version}-amd64.deb) | [ARM64](${downloadUrl}/clash-party-linux-${version}-arm64.deb)\n\n`
    links += `- RPM：[64位](${downloadUrl}/clash-party-linux-${version}-x86_64.rpm) | [ARM64](${downloadUrl}/clash-party-linux-${version}-aarch64.rpm)\n\n`
    links += `- PACMAN：[64位](${downloadUrl}/clash-party-linux-${version}-x64.pkg.tar.zst) | [ARM64](${downloadUrl}/clash-party-linux-${version}-aarch64.pkg.tar.zst)`
  }

  return links
}
