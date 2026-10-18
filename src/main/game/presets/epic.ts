import type { PlatformPreset } from '../../../shared/game/types'

export const EPIC_PRESET: PlatformPreset = {
  id: 'epic',
  name: 'Epic Games',
  version: '0.2.0',
  source: 'builtin',
  download: {
    domainSuffix: ['epicgamescdn.com'],
    domainKeyword: ['epicgames-download', 'epicgamescdn'],
    domain: [
      'download.epicgames.com',
      'download2.epicgames.com',
      'download3.epicgames.com',
      'download4.epicgames.com',
      'fastly-download.epicgames.com',
      'epicgames-download1.akamaized.net',
      'cloudflare.epicgamescdn.com',
      'epicgames-download1-1251447533.file.myqcloud.com'
    ]
  },
  platform: {
    geosite: ['epicgames'],
    domain: [
      'store.epicgames.com',
      'www.epicgames.com',
      'accounts.epicgames.com',
      'api.epicgames.com',
      'launcher.epicgames.com',
      'friends.epicgames.com',
      'library.epicgames.com',
      'dev.epicgames.com'
    ],
    domainSuffix: ['epicgames.dev', 'unrealengine.com', 'fortnite.com']
  },
  mixedDomains: ['epicgames.com'],
  mixedDomainFallback: 'direct',
  clientProcesses: ['EpicGamesLauncher.exe', 'EpicWebHelper.exe', 'EpicOnlineServicesHost.exe'],
  tips: [
    'Epic 没有手动下载地区，CDN 按客户端出口 IP 选择；大下载前先开启「网页直连模式」，再开始下载。',
    '`epicgamescdn.com` 必须留在下载层，不能放进平台层，否则未知 CDN 子域会走代理。'
  ]
}
