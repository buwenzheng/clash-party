import type { PlatformPreset } from '../../../shared/game/types'

export const GOG_PRESET: PlatformPreset = {
  id: 'gog',
  name: 'GOG',
  version: '0.2.0',
  source: 'builtin',
  download: {
    domainSuffix: ['gogcdn.net', 'gogdownload.com'],
    domainKeyword: ['gog-cdn', 'gogcdn'],
    domain: ['cdn.gog.com', 'gog-cdn-fastly.gog.com']
  },
  platform: {
    geosite: ['gog'],
    domain: ['www.gog.com', 'www.gogalaxy.com'],
    domainSuffix: ['gogstatic.com', 'gogservices.com']
  },
  mixedDomains: ['gog.com', 'gogalaxy.com'],
  mixedDomainFallback: 'direct',
  clientProcesses: ['GalaxyClient.exe', 'GalaxyClientHelper.exe', 'GalaxyCommunication.exe'],
  tips: ['GOG Galaxy 商店与社区走代理，未知下载子域默认直连。']
}

export const UBISOFT_PRESET: PlatformPreset = {
  id: 'ubisoft',
  name: 'Ubisoft Connect',
  version: '0.2.0',
  source: 'builtin',
  download: {
    domainKeyword: ['ubistatic'],
    domain: ['ubistatic-a.akamaihd.net', 'uplaypc-s-ubisoft.cdn.ubi.com']
  },
  platform: {
    geosite: ['ubisoft'],
    domain: [
      'www.ubisoft.com',
      'account.ubisoft.com',
      'store.ubisoft.com',
      'support.ubisoft.com',
      'connect.ubisoft.com',
      'www.ubi.com',
      'account.ubi.com',
      'store.ubi.com',
      'www.uplay.com',
      'www.ubisoftconnect.com'
    ]
  },
  mixedDomains: ['ubisoft.com', 'ubi.com', 'uplay.com', 'ubisoftconnect.com'],
  mixedDomainFallback: 'direct',
  clientProcesses: ['UbisoftConnect.exe', 'UbisoftGameLauncher.exe', 'upc.exe'],
  tips: ['Ubisoft Connect 商店走代理，未知下载子域默认直连。']
}

export const EA_PRESET: PlatformPreset = {
  id: 'ea',
  name: 'EA App',
  version: '0.2.0',
  source: 'builtin',
  download: {
    domainKeyword: ['eaassets'],
    domain: [
      'eaassets-a.akamaihd.net',
      'origin-a.akamaihd.net',
      'lvlt.cdn.ea.com',
      'ssl-lvlt.cdn.ea.com'
    ]
  },
  platform: {
    geosite: ['ea'],
    domain: [
      'www.ea.com',
      'accounts.ea.com',
      'help.ea.com',
      'api.ea.com',
      'signin.ea.com',
      'www.origin.com',
      'store.origin.com',
      'tnt-ea.com'
    ],
    domainSuffix: ['eaplay.com']
  },
  mixedDomains: ['ea.com', 'origin.com'],
  mixedDomainFallback: 'direct',
  clientProcesses: ['EADesktop.exe', 'Origin.exe', 'EABackgroundService.exe', 'EALocalHostSvc.exe'],
  tips: ['EA App 商店走代理，游戏下载 CDN 默认直连。']
}

export const BATTLENET_PRESET: PlatformPreset = {
  id: 'battlenet',
  name: 'Battle.net',
  version: '0.2.0',
  source: 'builtin',
  download: {
    domainKeyword: ['blzddist', 'blzstatic'],
    domain: ['blzddist1-a.akamaihd.net', 'level3.blizzard.com', 'blizzard.vo.llnwd.net'],
    domainSuffix: ['cdn.blizzard.com', 'blzstatic.cn', 'battlenet.com.cn']
  },
  platform: {
    domain: ['www.blizzard.com', 'news.blizzard.com', 'shop.blizzard.com', 'blz-contentstack.com'],
    domainSuffix: ['battle.net']
  },
  mixedDomains: ['blizzard.com'],
  mixedDomainFallback: 'direct',
  clientProcesses: ['Battle.net.exe', 'Agent.exe', 'BlizzardBrowser.exe'],
  tips: ['Battle.net 商店与战网服务走代理，游戏下载默认直连。']
}

export const XBOX_PRESET: PlatformPreset = {
  id: 'xbox',
  name: 'Xbox',
  version: '0.2.0',
  source: 'builtin',
  download: {
    domainKeyword: ['dlassets', 'xvcf'],
    domainSuffix: ['delivery.mp.microsoft.com', 'dl.delivery.mp.microsoft.com'],
    domain: [
      'assets1.xboxlive.com',
      'assets2.xboxlive.com',
      'xvcf1.xboxlive.com',
      'xvcf2.xboxlive.com',
      'dlassets.xboxlive.com'
    ]
  },
  platform: {
    geosite: ['xbox'],
    domain: ['xbox.com', 'www.xbox.com', 'account.xbox.com', 'xboxlive.com'],
    domainSuffix: ['xboxservices.com', 'gamepass.com']
  },
  mixedDomains: ['xboxlive.com'],
  mixedDomainFallback: 'direct',
  clientProcesses: ['XboxPcApp.exe', 'GamingServices.exe', 'GameBar.exe', 'Xbox.exe'],
  tips: ['Xbox App 商店与 Game Pass 页面走代理，游戏下载 CDN 默认直连。']
}
