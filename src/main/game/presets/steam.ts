import type { PlatformPreset } from '../../../shared/game/types'

export const STEAM_PRESET: PlatformPreset = {
  id: 'steam',
  name: 'Steam',
  version: '0.2.0',
  source: 'builtin',
  download: {
    geosite: ['steam@cn'],
    domainSuffix: ['steamcontent.com', 'steamchina.com'],
    domainKeyword: ['steamcontent', 'steampipe', 'steamcdn'],
    domain: [
      'steampipe.akamaized.net',
      'steamcdn-a.akamaihd.net',
      'cdn.mileweb.cs.steampowered.com.8686c.com',
      'xz.pphimalayanrt.com',
      'lv.queniujq.cn',
      'alibaba.cdn.steampipe.steamcontent.com',
      'video.akamai.steamstatic.com',
      'video.cloudflare.steamstatic.com',
      'video.fastly.steamstatic.com'
    ]
  },
  platform: {
    geosite: ['steam'],
    domainSuffix: [
      'steampowered.com',
      'steamcommunity.com',
      'steamstatic.com',
      'steamserver.net',
      'steam-chat.com',
      'steamusercontent.com',
      'steamgames.com',
      'valvesoftware.com'
    ]
  },
  clientUpdate: ['client-update.akamai.steamstatic.com'],
  clientProcesses: ['steam.exe', 'steamwebhelper.exe', 'steamservice.exe', 'steam_osx', 'steam'],
  clientPorts: [{ process: 'steam.exe', ports: '27015-27050', network: 'tcp' }],
  tips: [
    'Steam 客户端「设置 → 下载 → 下载地区」请选择中国大陆的地区，下载才会使用国内 CDN 并走直连。',
    '客户端更新和游戏下载都走下载层；如果更新仍然很慢，检查 client-update 域名是否被订阅规则覆盖。'
  ]
}
