# 场景手册

## 通用约定

- 先只读，后写；写操作必须记录初值、验证、还原。
- 不要按 `Escape`、`Ctrl+Q`，不要调用 `quitApp`/`relaunchApp`；关窗口只会隐藏。
- 每完成一步用 `browser_console_messages` 检查新增报错。
- 主进程或 preload 改动会重启 Electron；重连 MCP、重新选页后再继续。
- 失败时优先看 `%APPDATA%\mihomo-party-dev\logs\clash-party-*.log` 与 `core-*.log`。

## 0. 启动与目标确认

1. 确认没有旧 dev 实例；`$env:REMOTE_DEBUGGING_PORT="9222"; pnpm dev`。
2. `Invoke-RestMethod http://127.0.0.1:9222/json/version`，UA 含 `Electron/43.x`。
3. `GET /json` 找 target：主窗口 URL 含 `localhost:5173`（或实际 Vite 端口）且不含 `floating.html`；悬浮窗含 `floating.html`；忽略 `devtools://`。
4. 选主窗口后先 `getAppConfig(true)`：
   - `modeSelected === false`：主进程尚未启动内核，界面会弹操作模式选择。停止自动化，交给用户选择；不要用 `patchAppConfig` 伪造 `modeSelected`。
   - `modeSelected === true`：继续。
5. 若目标窗口被隐藏：IPC `showMainWindow`。

## 1. 只读 UI 冒烟（设置页）

1. 软导航：`location.hash = '#/settings'`。
2. `browser_snapshot` 确认设置页的 8 个分区都存在（顺序对应 GeneralConfig、SubStoreConfig、SiderConfig、WebdavConfig、MihomoConfig、ShortcutConfig、LocalBackupConfig、Actions；文案随语言变化）。
3. `getAppConfig(true)` 记录 `language`、`appTheme`、`useWindowFrame`、`disableHardwareAcceleration` 等，和界面显示对照。
4. 需要视觉确认时再 `browser_take_screenshot`；纯结构断言不要截图。
5. 不要点会重启应用或弹原生对话框的项：窗口边框、硬件加速、导入主题、托盘图标裁剪、备份恢复、Open DevTools。
6. 结束时 `browser_console_messages` 应为 0 个新增 error。

## 2. 订阅与代理只读核对

1. `#/profiles`：`getProfileConfig` + `getCurrentProfileItem`，断言当前订阅名与列表；不要点切换、更新、删除。
2. `#/proxies`：`mihomoGroups` 记录分组与当前选中项；`browser_snapshot` 看分组卡片；不要点节点或分组（会真实切换代理）。
3. `mihomoProxyDelay`/`mihomoGroupDelay` 是主动测速，会发请求；非必要不要触发。
4. 内核相关 IPC 返回 `{ invokeError }` 时，先 `mihomoVersion` 判断内核是否启动；未启动就回到场景 0。

## 3. 简单模式

1. `getAppConfig(true)` 读 `operationMode`。
2. `simple`：软导航 `#/simple`，用 `getSimpleConfig` 对照页面模块；不要点保存、发布、导入。
3. `standard`：只读检查即可。不要为了看简单模式调用 `setOperationMode`；它可能 `restartCore`，并改写订阅继承关系。
4. 如果用户明确要求切换模式：先记录 `operationMode`，说明会重启内核，执行后等 `appConfigUpdated`，断言新模式，结束后切回并再次确认。

## 4. 悬浮窗

1. 启动时加 `FLOATING_SAFE_MODE=true`，悬浮窗会变成带边框、可缩放、可关闭的普通窗口。
2. IPC `showFloatingWindow` 创建/显示；随后在 `list_pages`/`browser_tabs` 里选 `floating.html`（标题 `Clash Party Floating`）。
3. 做快照、截图或读取 `getAppConfig`/`getControledMihomoConfig` 对照显示状态。
4. 结束用 `closeFloatingWindow`。`showFloatingWindow` 不会持久化 `showFloatingWindow` 配置；不要用 `triggerFloatingWindow`（它会 toggle 并持久化）。
5. 默认悬浮窗透明、置顶、skipTaskbar；不要试图用截图坐标点击，优先 ref。

## 5. 游戏加速

### 5.1 阶段 A：只读后端

1. 阶段 A 没有 `/game-accel` 页面；`game-accel/07-ui-ux.md` 是设计稿，不要按它找路由。
2. 只读探测：`gameAccelGetState`、`gameAccelGetConfig`、`gameAccelGetPresets`、`gameAccelDiagnose`、`gameAccelPreview`。
3. 配置文件：`%APPDATA%\mihomo-party-dev\game-accel.yaml`；缓存与预设在同目录。
4. 不要调用 `gameAccelSetEnable`、`gameAccelPatchConfig`、`gameAccelUpsertGame`、`gameAccelRemoveGame`，除非用户明确要求，并按写操作模板还原。
5. 开启/关闭会触发配置热重载；断言时等待 `gameAccelUpdated` 或重新读 `gameAccelGetState`。

### 5.2 阶段 B：UI 验证（B0）

1. 入口：侧边栏新增“游戏加速”后，用 Playwright `browser_snapshot` 找 ref，`browser_click` 后断言 `location.hash === '#/game-accel'`。
2. 页面：`browser_snapshot` 检查总开关、模式、三组选择、平台开关、游戏列表；结构不清时用 Chrome DevTools `take_snapshot`。
3. 交互：关键控件用 `data-testid`（`game-enable`、`game-mode`、`game-group`、`platform-group`、`download-group`、`platform-steam`、`platform-epic`、`game-add-path`、`game-save`）；表单用 `browser_fill_form`，下拉用 `browser_select_option`。
4. 断言：`browser_evaluate` 调 `gameAccelGetState`/`gameAccelGetConfig`，检查 `invokeError`；保存后读取 `game-accel.yaml`、`work/config.yaml` 并运行 `mihomo -t`。
5. Console：`browser_console_messages { level: "error" }`；当前基线 1 条 React `<script>` 错误，只报告新增错误。
6. 清理：删除测试 `game-accel.yaml`，确认 `work/config.yaml` 无 `🎮 游戏加速` 组；UI 产物放 `out/mcp/`。
7. 高风险：不要在测试中切换系统代理/TUN、节点或关闭连接；先验证 `enable=false` 的页面，再单独验证启用。

## 6. 日志与主进程错误

1. UI `#/logs` 只显示 mihomo 日志，支持级别/关键字过滤；可用于内核连接、DNS、规则问题。
2. 主进程错误看 `%APPDATA%\mihomo-party-dev\logs\clash-party-YYYY-MM-DD.log`；内核启动与崩溃看 `core-YYYY-MM-DD.log`。
3. 主窗口白屏/消失但进程还在：查主日志是否有 `Main window render process gone`；60 秒内最多自动恢复 3 次。
4. 日志和配置里可能有订阅地址、token、节点信息；不要贴进回复或截图。

## 7. 修改代码后的验证

1. 只改 `src/renderer`：等 HMR，重新 `browser_snapshot`，检查 console。
2. 改 `src/main`/`src/preload`：electron-vite 会重启 Electron，CDP 端口短暂关闭再打开；重连 MCP，重新 `list_pages`/`browser_tabs` 选主窗口。
3. 重启后如果窗口隐藏：IPC `showMainWindow`。
4. 不要再次执行 `pnpm dev`（单实例会只唤醒旧实例，且可能丢失新参数）。

## 8. 用户明确要求写操作时

1. 读初值并记录（配置、内核状态、界面状态）。
2. 执行写通道，检查返回值是否含 `invokeError`。
3. 等待相关事件（`appConfigUpdated`、`groupsUpdated`、`gameAccelUpdated` 等）或 `sleep` 后重读。
4. 断言界面与 IPC 状态一致。
5. 还原初值并再次确认；在结论里说明改过什么、是否已还原。
