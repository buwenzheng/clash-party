# IPC 通道参考

来源：`src/preload/index.ts` 的 `validInvokeChannels` / `validListenChannels` / `validSendChannels`。白名单外的 channel 会被 preload 直接 reject，错误为 `Invalid invoke channel: <name>`。

## 错误模型

`src/main/utils/ipc.ts` 用 `wrapAsync` 包装 handler：handler 抛错时不会 reject，而是 resolve 成：

```json
{ "invokeError": "错误信息" }
```

渲染层 `src/renderer/src/utils/ipc.ts` 会解包 `invokeError` 并抛异常；但直接用 `window.electron.ipcRenderer.invoke` 时（包括 `browser_evaluate`）必须自己检查。成功时返回值就是 handler 的返回值。

## 只读探测

适用于断言、截图前确认状态，不会主动改配置。

| 领域       | channel                                                                                                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 应用配置   | `getAppConfig`（可传 `true` 强制读盘）、`getVersion`、`getAppInfo`、`platform`、`checkAutoRun`                                                                                                                                                            |
| 内核配置   | `getControledMihomoConfig`、`getRuntimeConfig`、`getRuntimeConfigStr`、`getSmartOverrideContent`、`getSmartModelStatus`                                                                                                                                   |
| 订阅/规则  | `getProfileConfig`、`getCurrentProfileItem`、`getProfileItem`、`getProfileStr`、`getRuleStr`、`getOverrideConfig`、`getOverrideItem`、`getOverride`、`getSimpleConfig`、`getSimpleNode`、`getSimpleProxyGroup`、`getSimpleRulesEditor`、`getPluginConfig` |
| mihomo API | `mihomoVersion`、`mihomoProxies`、`mihomoGroups`、`mihomoRules`、`mihomoProxyProviders`、`mihomoRuleProviders`、`mihomoSmartGroupWeights`                                                                                                                 |
| 流量统计   | `queryTrafficUsageOverview`、`queryTrafficUsageBreakdown`                                                                                                                                                                                                 |
| 文件       | `readTextFile`、`getFileStr`、`getImageDataURL`、`readImageFileDataURL`（传路径，不弹对话框）                                                                                                                                                             |
| 窗口       | `isAlwaysOnTop`                                                                                                                                                                                                                                           |
| 主题/托盘  | `resolveThemes`、`readTheme`、`getTrayTrafficStyle`                                                                                                                                                                                                       |
| 系统信息   | `checkAdminPrivileges`、`checkTunPermissions`、`checkMihomoCorePermissions`、`checkHighPrivilegeCore`、`getInterfaces`                                                                                                                                    |
| Sub-Store  | `subStorePort`、`subStoreFrontendPort`、`subStoreSubs`、`subStoreCollections`（服务未启动时会失败）                                                                                                                                                       |
| 备份       | `listWebdavBackups`（走网络，只读）                                                                                                                                                                                                                       |
| 游戏加速   | `gameAccelGetConfig`、`gameAccelGetState`、`gameAccelGetPresets`、`gameAccelDiagnose`、`gameAccelPreview`                                                                                                                                                 |

主动探测/外网请求（不改配置，但会发流量）：`mihomoProxyDelay`、`mihomoGroupDelay`、`measureLatency`、`fetchIPInfo`、`checkUpdate`、`fetchMihomoTags`、`listWebdavBackups`。

## 写操作（默认不要调用）

除非用户明确要求验证某个写操作，否则只用只读通道。写操作应遵循“记录初值 → 操作 → 断言 → 还原”。

| 领域              | channel 与影响                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 应用配置          | `patchAppConfig`、`resetAppConfig`、`changeLanguage`、`setControlDns`、`takeDnsOverrideAutoDisabledNotice`                                                                                                                                                                                                                                                                                                               |
| 内核配置          | `patchControledMihomoConfig`、`patchMihomoConfig`；内核重启：`restartCore`、`mihomoHotReloadConfig`、`quitWithoutCore`                                                                                                                                                                                                                                                                                                   |
| 订阅              | `setProfileConfig`、`setProfileStr`、`addProfileItem`、`removeProfileItem`、`updateProfileItem`、`changeCurrentProfile`、`addProfileUpdater`、`removeProfileUpdater`                                                                                                                                                                                                                                                     |
| Override/规则     | `setOverrideConfig`、`addOverrideItem`、`removeOverrideItem`、`updateOverrideItem`、`setOverride`、`setRuleStr`、`mihomoRulesDisable`                                                                                                                                                                                                                                                                                    |
| 简单模式          | `setOperationMode`（可能 `restartCore`）、`saveSimpleNode`、`removeSimpleNode`、`createSimpleNodes`、`saveSimpleRules`、`saveSimpleRuleProvider`、`createSimpleProxyGroup`、`saveSimpleProxyGroup`、`removeSimpleProxyGroup`、`reorderSimpleProxyGroups`、`saveSimpleDraft`、`previewSimpleConfig`、`publishSimpleConfig`、`exportSimpleConfig`、`importSimpleSubscription`、`refreshSimpleSource`、`removeSimpleSource` |
| 代理              | `mihomoChangeProxy`、`mihomoUnfixedProxy`、`mihomoCloseConnection`、`mihomoCloseAllConnections`                                                                                                                                                                                                                                                                                                                          |
| Provider/内核更新 | `mihomoUpdateProxyProviders`、`mihomoUpdateRuleProviders`、`mihomoUpgradeGeo`、`mihomoUpgrade`、`mihomoUpgradeUI`、`installSpecificMihomoCore`、`downloadSmartModel`、`mihomoSmartFlushCache`、`clearMihomoVersionCache`、`downloadAndInstallUpdate`                                                                                                                                                                     |
| 系统网络          | `triggerSysProxy`、`grantTunPermissions`、`requestTunPermissions`、`restartAsAdmin`、`setupFirewall`、`openUWPTool`、`manualGrantCorePermition`、`showTunPermissionDialog`、`enableAutoRun`、`disableAutoRun`                                                                                                                                                                                                            |
| 生命周期          | `relaunchApp`、`quitApp`、`createHeapSnapshot`、`startMonitor`、`registerShortcut`                                                                                                                                                                                                                                                                                                                                       |
| 窗口/托盘         | `showMainWindow`、`closeMainWindow`、`triggerMainWindow`、`showFloatingWindow`、`closeFloatingWindow`、`showContextMenu`、`setAlwaysOnTop`、`setTitleBarOverlay`、`openDevTools`、`showTrayIcon`、`closeTrayIcon`、`updateTrayIcon`、`updateTrayIconImmediate`                                                                                                                                                           |
| 文件/对话框       | `setFileStr`、`openFile`、`getFilePath`、`showErrorDialog`、`copyEnv`、`convertMrsRuleset`                                                                                                                                                                                                                                                                                                                               |
| 主题              | `importThemes`、`writeTheme`、`applyTheme`、`fetchThemes`                                                                                                                                                                                                                                                                                                                                                                |
| 备份              | `webdavBackup`、`webdavRestore`、`webdavDelete`、`reinitWebdavBackupScheduler`、`exportLocalBackup`、`importLocalBackup`                                                                                                                                                                                                                                                                                                 |
| Sub-Store         | `startSubStoreFrontendServer`、`stopSubStoreFrontendServer`、`startSubStoreBackendServer`、`stopSubStoreBackendServer`、`ensureSubStoreServices`、`downloadSubStore`                                                                                                                                                                                                                                                     |
| 插件              | `installPlugin`、`loginPlugin`、`removePlugin`、`updatePluginProfile`、`patchPluginItem`、`previewPlugin`                                                                                                                                                                                                                                                                                                                |
| 游戏加速          | `gameAccelPatchConfig`、`gameAccelSetEnable`、`gameAccelUpsertGame`、`gameAccelRemoveGame`                                                                                                                                                                                                                                                                                                                               |
| 流量统计          | `importTrafficUsage`、`clearTrafficUsage`                                                                                                                                                                                                                                                                                                                                                                                |

说明：

- `showMainWindow`/`closeMainWindow`/`showFloatingWindow`/`closeFloatingWindow` 在调试中常用，但仍属于窗口状态变更；不要用 `triggerMainWindow` 或 `triggerFloatingWindow`，它们会按配置切换并可能持久化。
- `openDevTools` 会新增 DevTools target；非必要不要调用。
- `before-quit` 会停内核并关闭系统代理，因此 `quitApp` 的副作用远大于“关窗口”。

## 监听通道

`window.electron.ipcRenderer.on(channel, listener)` 返回取消闭包；preload 已处理 contextBridge 代理问题，跨调用不要用 `removeListener` 匹配旧函数。

| channel                                 | 用途                               |
| --------------------------------------- | ---------------------------------- |
| `mihomoLogs`                            | 内核日志流（`#/logs` 使用）        |
| `mihomoConnections`                     | 连接列表，周期性全量推送，可能较大 |
| `mihomoTraffic`                         | 上传/下载速率                      |
| `mihomoMemory`                          | 内存占用                           |
| `appConfigUpdated`                      | 应用配置变更                       |
| `controledMihomoConfigUpdated`          | 受控内核配置变更                   |
| `profileConfigUpdated`                  | 订阅配置变更                       |
| `groupsUpdated`、`rulesUpdated`         | 分组/规则变更                      |
| `simpleConfigUpdated`                   | 简单模式配置变更                   |
| `gameAccelUpdated`                      | 游戏加速配置变更                   |
| `updateDownloadProgress`                | 更新下载进度                       |
| `pluginConfigUpdated`、`openPluginFile` | 插件配置/待打开文件                |
| `dnsOverrideAutoDisabled`               | DNS 覆盖被自动关闭                 |

## 发送通道

`window.electron.ipcRenderer.send` 只允许：`updateTrayMenu`、`updateFloatingWindow`、`trayIconUpdate`、`rendererFirstContentReady`。UI 调试基本不用。

## 探测配方

### 读取配置并检查错误

```js
;async () => {
  const r = await window.electron.ipcRenderer.invoke('getAppConfig', true)
  if (r && typeof r === 'object' && 'invokeError' in r) throw new Error(String(r.invokeError))
  return { operationMode: r.operationMode, modeSelected: r.modeSelected, language: r.language }
}
```

### 一次性读取连接推送

```js
;async () =>
  await new Promise((resolve) => {
    let off = () => {}
    const timer = setTimeout(() => {
      off()
      resolve(null)
    }, 3000)
    off = window.electron.ipcRenderer.on('mihomoConnections', (_e, data) => {
      clearTimeout(timer)
      off()
      resolve(data)
    })
  })
```

`mihomoLogs`/`mihomoTraffic`/`mihomoMemory` 用同样方式；连接列表可能很大，断言前先裁剪字段。

### 读取游戏加速状态

```js
;async () => {
  const [state, presets, diagnostics] = await Promise.all([
    window.electron.ipcRenderer.invoke('gameAccelGetState'),
    window.electron.ipcRenderer.invoke('gameAccelGetPresets'),
    window.electron.ipcRenderer.invoke('gameAccelDiagnose')
  ])
  return { state, presetCount: presets?.length, diagnosticCount: diagnostics?.length }
}
```

### 内核是否已启动

```js
;async () => {
  const r = await window.electron.ipcRenderer.invoke('mihomoVersion')
  return r && typeof r === 'object' && 'invokeError' in r
    ? { running: false, error: r.invokeError }
    : { running: true, version: r }
}
```

### 写操作验证模板

仅在用户明确要求时使用：

1. 读初值并记录。
2. 调用目标写通道，检查是否返回 `{ invokeError }`。
3. 再读一次确认生效（必要时 `getAppConfig(true)`）。
4. 还原初值并再次确认。
