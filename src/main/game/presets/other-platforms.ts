import type { PlatformPreset } from '../../../shared/game/types'

export const GOG_PRESET: PlatformPreset = {
  id: 'gog',
  name: 'GOG',
  version: '0.1.0',
  source: 'builtin',
  download: {
    domainSuffix: ['gogcdn.net', 'gogdownload.com'],
    domainKeyword: ['gogcdn']
  },
  platform: {
    domainSuffix: ['gog.com', 'gogstatic.com', 'gogalaxy.com', 'gogservices.com']
  },
  mixedDomains: ['gog.com'],
  mixedDomainFallback: 'direct',
  clientUpdate: ['gog.com', 'gogcdn.net'],
  clientProcesses: ['GalaxyClient.exe', 'GalaxyClientHelper.exe', 'gog.exe'],
  tips: ['GOG Galaxy 商店与社区走代理，下载 CDN 默认直连。']
}

export const UBISOFT_PRESET: PlatformPreset = {
  id: 'ubisoft',
  name: 'Ubisoft Connect',
  version: '0.1.0',
  source: 'builtin',
  download: {},
  platform: {
    domainSuffix: ['ubisoft.com', 'ubisoftconnect.com', 'ubisoft.net', 'uplay.com', 'ubi.com']
  },
  mixedDomains: ['ubisoft.com', 'ubi.com'],
  mixedDomainFallback: 'direct',
  clientUpdate: ['ubisoft.com', 'ubi.com'],
  clientProcesses: ['UbisoftConnect.exe', 'UbisoftGameLauncher.exe', 'upc.exe'],
  tips: ['Ubisoft Connect 商店走代理，未知下载子域默认直连。']
}

export const EA_PRESET: PlatformPreset = {
  id: 'ea',
  name: 'EA App',
  version: '0.1.0',
  source: 'builtin',
  download: {
    domainSuffix: ['eaassets-a.akamaihd.net', 'origin-a.akamaihd.net']
  },
  platform: {
    domainSuffix: ['ea.com', 'origin.com', 'eaplay.com', 'eaassets-a.akamaihd.net']
  },
  mixedDomains: ['ea.com', 'origin.com'],
  mixedDomainFallback: 'direct',
  clientUpdate: ['ea.com'],
  clientProcesses: ['EADesktop.exe', 'Origin.exe', 'EABackgroundService.exe', 'EALocalHostSvc.exe'],
  tips: ['EA App 商店走代理，游戏下载 CDN 默认直连。']
}

export const BATTLENET_PRESET: PlatformPreset = {
  id: 'battlenet',
  name: 'Battle.net',
  version: '0.1.0',
  source: 'builtin',
  download: {
    domainSuffix: ['blzstatic.cn', 'blizzard.vo.llnwd.net'],
    domainKeyword: ['blzstatic']
  },
  platform: {
    domainSuffix: ['battle.net', 'blizzard.com', 'battlenet.com.cn', 'blzstatic.cn']
  },
  mixedDomains: ['blizzard.com', 'battle.net'],
  mixedDomainFallback: 'direct',
  clientUpdate: ['battle.net', 'blizzard.com'],
  clientProcesses: ['Battle.net.exe', 'Agent.exe', 'BlizzardBrowser.exe'],
  tips: ['Battle.net 商店与战网服务走代理，游戏下载默认直连。']
}

export const XBOX_PRESET: PlatformPreset = {
  id: 'xbox',
  name: 'Xbox',
  version: '0.1.0',
  source: 'builtin',
  download: {
    domainSuffix: [
      'delivery.mp.microsoft.com',
      'tlu.dl.delivery.mp.microsoft.com',
      'assets1.xboxlive.com',
      'assets2.xboxlive.com'
    ]
  },
  platform: {
    domainSuffix: ['xbox.com', 'xboxlive.com', 'xboxservices.com', 'gamepass.com']
  },
  mixedDomains: ['xboxlive.com'],
  mixedDomainFallback: 'direct',
  clientUpdate: ['xboxlive.com'],
  clientProcesses: ['XboxPcApp.exe', 'GameBar.exe', 'Xbox.exe'],
  tips: ['Xbox App 商店与 Game Pass 页面走代理，游戏下载 CDN 默认直连。']
}
