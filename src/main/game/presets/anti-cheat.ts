import type { AntiCheatPreset } from '../../../shared/game/types'

export const ANTI_CHEAT_PRESET: AntiCheatPreset = {
  version: '0.2.0',
  entries: [
    { process: 'BEService.exe', policy: 'follow' },
    { process: 'BEService_x64.exe', policy: 'follow' },
    { process: 'EasyAntiCheat.exe', policy: 'follow' },
    { process: 'EasyAntiCheat_EOS.exe', policy: 'follow' },
    { process: 'vgc.exe', policy: 'direct' }
  ]
}
