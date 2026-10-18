---
name: clash-party-ui-debug
description: Clash Party 项目的 Electron UI 调试约定：dev 启动与 CDP 端口、主窗口/悬浮窗与 DevTools 目标选择、HashRouter 路由、preload 白名单 IPC 探测、dev 用户数据与日志、系统代理/TUN 安全边界。与用户级 electron-ui-debug 配合使用；当在本仓库调试或验证主窗口/悬浮窗界面、排查 IPC 与路由、执行只读 UI 冒烟时使用。
---

# Clash Party UI 调试

## 定位

通用 CDP 流程、两个 MCP 的分工、快照/交互策略与主进程调试，先遵循用户级 `electron-ui-debug`。本 skill 只写 Clash Party 的项目结构、约定、风险和可复用探测方法；两者同时加载时，先用通用流程，再用本 skill 选目标与断言方式。

## 工具优先级与已验证基线

| 工具                       | 角色           | 使用建议                                                                                                                                                           |
| -------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `playwright-electron`      | 阶段 B 主力    | `browser_snapshot` 取 ref；`browser_click`/`browser_fill_form`/`browser_select_option` 交互；`browser_console_messages` 查新增错误；`browser_take_screenshot` 截图 |
| `chrome-devtools-electron` | 辅助           | `take_snapshot` 看完整 a11y 树；`get_css_styles` 查布局；`performance_*` 查卡顿；`list_network_requests` 看 HTTP 细节                                              |
| `debug-electron`           | 备用           | v1 只有 8 个工具；截图/页面结构/eval 可用；`read_electron_logs` 在 Windows 上因 `ps` 缺失不可用                                                                    |
| 现有 CDP 脚本              | 确定性后端验证 | `game-accel/scripts/cdp-*.mjs` 做 IPC 冒烟、模式切换和配置校验                                                                                                     |

当前 dev 基线：主窗口 `#/proxies`、`operationMode=standard`、`modeSelected=true`、语言 `zh-CN`。Playwright `browser_snapshot` 需要 `depth: 6` 左右才能看到完整侧边栏；`browser_evaluate` 调 `getAppConfig(true)` 已成功。Playwright 当前记录 1 条既有 console 错误（React 渲染 `<script>`），后续只比较新增错误。Chrome DevTools 的 `list_console_messages` 按会话记录，可能为空，不能据此判断历史错误不存在。

## 项目结构速览

- 主进程 `src/main/index.ts`：单实例锁、启动顺序、IPC 注册、生命周期。
- 窗口：主窗口 `src/main/window.ts`；悬浮窗 `src/main/resolve/floatingWindow.ts`；托盘 `src/main/resolve/tray.ts`。
- preload `src/preload/index.ts`：只暴露白名单 channel 与 `window.electron`。
- 渲染进程 `src/renderer`：React 19 + HeroUI + HashRouter + i18next（en-US、fa-IR、ru-RU、zh-CN、zh-TW）。
- IPC 注册 `src/main/utils/ipc.ts`：channel 名即 handler key；异常被包装成 `{ invokeError }`。
- 配置、简单模式、游戏加速：`src/main/config`、`src/main/simple`、`src/main/game`。
- 内核：`extra/sidecar` 下的 mihomo 子进程，真实接管系统代理/TUN，见安全边界。

| 关注点                 | 入口                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| 布局、模式选择、引导   | `src/renderer/src/App.tsx`                                                                              |
| 路由                   | `src/renderer/src/routes/index.tsx`                                                                     |
| 页面                   | `src/renderer/src/pages/*`                                                                              |
| 设置分区               | `src/renderer/src/components/settings/*`                                                                |
| 渲染层 IPC 封装        | `src/renderer/src/utils/ipc.ts`                                                                         |
| preload 白名单         | `src/preload/index.ts`                                                                                  |
| 主进程 handler         | `src/main/utils/ipc.ts`                                                                                 |
| 窗口/托盘/生命周期     | `src/main/window.ts`、`resolve/floatingWindow.ts`、`resolve/tray.ts`、`lifecycle.ts`                    |
| 配置/简单模式/游戏加速 | `src/main/config`、`src/main/simple`、`src/main/game`                                                   |
| 现有 CDP 示例          | `game-accel/scripts/cdp-ipc-smoke.mjs`、`cdp-simple-mode.mjs`（该目录被 `.gitignore` 忽略，仅本地参考） |

## 启动 dev 与 CDP

1. 退出旧 dev 实例。关闭主窗口只是隐藏到托盘，不是退出；用托盘退出或结束进程，不要同时跑两个 dev 实例。
2. 启动：

```powershell
$env:REMOTE_DEBUGGING_PORT = "9222"
pnpm dev
```

3. 验证 `Invoke-RestMethod http://127.0.0.1:9222/json/version`，UA 应包含 `Electron/43.x`；再访问 `/json` 查看 targets。
4. 调试悬浮窗时加 `FLOATING_SAFE_MODE=true`，得到带边框、可缩放、可关闭的普通窗口。
5. 首次启动 `modeSelected=false` 时，主进程不会启动内核，界面先弹操作模式选择；处理后再做依赖内核的验证。
6. 修改 `src/renderer` 走 HMR；修改 `src/main`/`src/preload` 会重启 Electron，CDP 端口随后重开，MCP 必须重连并重新选页。
7. 主进程 attach：`$env:V8_INSPECTOR_PORT="5858"; pnpm dev`，Node 调试器连 5858；它与 9222 的渲染进程 CDP 是两套通道。

## 目标选择

dev 会自动打开 DevTools，典型 target：

- 主窗口：`http://localhost:5173/#/...`，标题 `Clash Party`。
- 悬浮窗：`http://localhost:5173/floating.html`，标题 `Clash Party Floating`。
- DevTools：`devtools://...`，不要操作。

规则：Playwright 用 `browser_tabs` 按 URL 选主窗口；Chrome DevTools 用 `list_pages` → `select_page`；忽略 DevTools 页面。5173 被占用时 Vite 会换端口，以实际 URL 为准。

## 路由与风险

路由在 `src/renderer/src/routes/index.tsx`，使用 HashRouter：

| 路由                                           | 内容                 | 风险                                   |
| ---------------------------------------------- | -------------------- | -------------------------------------- |
| `#/proxies`                                    | 代理组与节点         | 高：点选节点会真实切换代理             |
| `#/profiles`                                   | 订阅配置             | 高：切换、更新、删除会改配置并触发内核 |
| `#/connections`                                | 连接列表             | 中：只读查看安全，关闭连接会断流       |
| `#/rules`                                      | 规则                 | 中：开关规则会改配置                   |
| `#/resources`                                  | 资源与 provider      | 中：更新会下载                         |
| `#/logs`、`#/traffic`、`#/network`             | 日志、流量、网络信息 | 低：日志/流量只读；测速类操作会发请求  |
| `#/settings`                                   | 设置                 | 中：部分开关会重启应用或弹原生对话框   |
| `#/sysproxy`、`#/tun`                          | 系统代理、TUN        | 高：直接改系统网络                     |
| `#/dns`、`#/sniffer`、`#/override`、`#/mihomo` | 内核配置             | 中到高：改内核配置                     |
| `#/substore`                                   | Sub-Store            | 中：启停服务                           |
| `#/simple`、`#/simple/:module`                 | 简单模式             | 中：改简单模式配置                     |

- 无 hash 时 `main.tsx` 强制跳到 `#/proxies`；只有访问 `#/` 时才按 `operationMode` 重定向。
- `operationMode === 'simple'` 时主动导航到 `#/simple`；先用 IPC 读 `getAppConfig` 确认模式。
- 切路由优先软导航：`browser_evaluate` 执行 `location.hash = '#/settings'`，避免全量刷新丢失瞬时状态。
- 游戏加速页面在阶段 B 新增，目标路由 `#/game-accel`；当前版本尚未注册路由和侧边栏，验证前先确认入口已实现。

## IPC 探测

- 只有 `src/preload/index.ts` 白名单里的 channel 可调用；不在白名单会直接 reject `Invalid invoke channel`。
- 主进程 handler 异常会 resolve 成 `{ invokeError: "..." }`，不是 reject；`browser_evaluate` 里必须显式检查，否则会把失败当成功。
- 常用只读探测：

```js
;async () => {
  const r = await window.electron.ipcRenderer.invoke('getAppConfig', true)
  if (r && typeof r === 'object' && 'invokeError' in r) throw new Error(String(r.invokeError))
  return { operationMode: r.operationMode, modeSelected: r.modeSelected, language: r.language }
}
```

- `getAppConfig(true)` 强制主进程重新读盘，绕过主进程缓存；`patchAppConfig` 后建议再读一次或等 `appConfigUpdated`。
- 断言优先用 IPC 返回值，不要依赖文案；界面有 5 种语言。
- 完整 channel 目录、只读/可写分类和监听用法见 [reference/ipc-channels.md](reference/ipc-channels.md)。

## dev 数据与日志

dev 使用独立身份 `mihomo-party-dev`，用户数据在 `%APPDATA%\mihomo-party-dev`；正式版 `%APPDATA%\mihomo-party` 不受影响。

| 路径                                                                  | 内容                                       |
| --------------------------------------------------------------------- | ------------------------------------------ |
| `config.yaml`                                                         | 应用配置（`getAppConfig`）                 |
| `mihomo.yaml`                                                         | 受控内核配置（`getControledMihomoConfig`） |
| `profile.yaml`、`profiles/<id>.yaml`                                  | 订阅配置与订阅内容                         |
| `override.yaml`、`override/`                                          | Override 配置与脚本                        |
| `plugin.yaml`、`plugin-vault/`                                        | 插件配置与密钥                             |
| `simple-config.yaml`、`simple-config.generated.yaml`                  | 简单模式配置与生成结果                     |
| `work/config.yaml`、`work/<id>/config.yaml`                           | 内核运行配置                               |
| `game-accel.yaml`、`game-accel-cache.json`、`game-accel-presets.json` | 游戏加速配置与缓存                         |
| `logs/clash-party-*.log`                                              | 主进程/应用日志                            |
| `logs/core-*.log`                                                     | mihomo 内核日志                            |
| `logs/sub-store-*.log`                                                | Sub-Store 日志                             |

- UI 的 `#/logs` 只显示 mihomo 日志；主进程错误要看 `logs/clash-party-*.log`。
- 不要把订阅 URL、token、节点信息写进结论或截图。

## 安全边界

- 应用会真实修改系统代理、TUN、节点与订阅；验证时优先只读。
- 高风险操作：切换节点/分组、开关系统代理/TUN、切换操作模式（可能 `restartCore`）、切换订阅、关闭连接、改规则、备份恢复、安装插件、`relaunchApp`/`quitApp`、`resetAppConfig`、更新内核。
- `before-quit` 会停内核并关闭系统代理；不要用退出/重启做清理。关窗口只是隐藏。
- 避免原生对话框：`getFilePath`、`openFile`、`showErrorDialog`、`showContextMenu`。
- 首次启动可能有操作模式模态框和 driver.js 引导（`localStorage.tourShown`）；先处理遮罩。
- 主窗口渲染进程崩溃后 60 秒内最多自动恢复 3 次；连续崩溃会停止重建，需看主进程日志。

## 键盘与窗口陷阱

- `Escape` 触发 `window.close()`，主窗口隐藏到托盘；不要随手按。
- `Ctrl+Q` 退出应用；`F12` 连按 5 次打开 DevTools。
- `browser_close` / `close_page` 会关窗并隐藏应用；不要用于清理。
- 恢复隐藏窗口：IPC `showMainWindow`；隐藏：`closeMainWindow`；不要用 `triggerMainWindow`（按配置切换显隐）。
- 单实例：第二个实例把参数交给首实例（无深链/插件文件时唤醒主窗口）；带新参数启动不会新开 CDP 端口。
- dev 与正式版 userData 不同可共存，但不要同时开系统代理/TUN。

## 常用工作流

1. 只读页面冒烟：启动 dev → 选主窗口 → 软导航 → `browser_snapshot` → 查 console → 用 IPC 读状态断言。
2. 配置断言：`getAppConfig(true)` 记录初值 → 操作 → 再读对比 → 必要时还原。
3. 内核状态：`mihomoVersion`、`mihomoGroups`、`mihomoRules`、`mihomoProxies`；内核未启动时这些会失败。
4. 悬浮窗：`FLOATING_SAFE_MODE=true` → IPC `showFloatingWindow` → 选 `floating.html` → 操作后 `closeFloatingWindow`。
5. 游戏加速：`gameAccelGetState`、`gameAccelGetConfig`、`gameAccelGetPresets`、`gameAccelDiagnose`、`gameAccelPreview`；UI 验证按下面的 B0 流程，先保持 `enable=false` 验证页面，再单独测启用。
6. 编辑后验证：渲染层等 HMR；主进程/preload 重启后重连 MCP。

## 阶段 B 游戏加速 UI 验证（B0）

1. 启动：`$env:REMOTE_DEBUGGING_PORT="9222"; pnpm dev`；用 `browser_tabs` 选 `Clash Party`，忽略 DevTools。
2. 入口：侧边栏新增 `游戏加速` 后，先 `browser_snapshot` 找 ref，再 `browser_click`；用 `browser_evaluate` 断言 `location.hash === '#/game-accel'`。
3. 页面：`browser_snapshot` 检查总开关、模式、三组选择、平台开关、游戏列表；结构不清楚时用 Chrome DevTools `take_snapshot`。
4. 交互：关键控件加 `data-testid`（`game-enable`、`game-mode`、`game-group`、`platform-group`、`download-group`、`platform-steam`、`platform-epic`、`game-add-path`、`game-save`）；表单用 `browser_fill_form`，下拉用 `browser_select_option`。
5. 断言：每次操作后 `browser_evaluate` 调 `gameAccelGetState`/`gameAccelGetConfig`，显式检查 `invokeError`；保存后读取 `%APPDATA%\mihomo-party-dev\game-accel.yaml` 和 `work\config.yaml`，再跑 `mihomo -t`。
6. Console：交互后 `browser_console_messages { level: "error" }`；当前基线 1 条 React `<script>` 错误，只报告新增错误。
7. 清理：删除测试用 `game-accel.yaml`，确认 `work/config.yaml` 无 `🎮 游戏加速` 组；不要用退出/重启做清理。
8. 高风险边界：不要在测试中切换系统代理/TUN、节点或关闭连接；启用游戏加速会热重载并影响真实流量，先验证 `enable=false` 的页面，再单独验证启用。

详细步骤与断言见 [reference/scenarios.md](reference/scenarios.md)。

## 故障排查

| 症状                           | 处理                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| 找不到 `localhost:5173` target | dev 未启动、启动失败，或 Vite 换了端口；核对终端与 `/json`                                    |
| 工具操作到 DevTools/悬浮窗     | 按 URL 重新选主窗口                                                                           |
| 主进程改动后工具失灵           | Electron 已重启，重连 MCP 并重新选页                                                          |
| 窗口突然消失                   | 触发了 `Escape`/关窗；IPC `showMainWindow`                                                    |
| 界面被模态框挡住               | `modeSelected=false` 的操作模式选择，或 driver.js 引导                                        |
| 内核相关 IPC 报错              | 首次启动未选模式，或内核启动失败；看 `logs/clash-party-*.log`                                 |
| IPC 返回 `{ invokeError }`     | handler 失败；按错误信息排查，不要当成功                                                      |
| 悬浮窗点不到/截图透明          | 用 `FLOATING_SAFE_MODE=true` 重启                                                             |
| 启动报单实例                   | 旧 dev 进程未退出                                                                             |
| `prepare` 下载 sidecar 失败    | Node fetch 不读系统代理；用镜像或已有产物，不要手改 `extra/sidecar/` 与 `node_modules/.temp/` |

## 参考

- [reference/ipc-channels.md](reference/ipc-channels.md)：白名单 channel、只读/可写分类、监听与探测配方。
- [reference/scenarios.md](reference/scenarios.md)：只读冒烟、配置断言、悬浮窗、游戏加速、日志与编辑后验证的具体步骤。
- 通用流程：用户级 `electron-ui-debug`。
