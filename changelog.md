# 2.1.0-rc.1

## 独立发行

- 版本线独立，自动更新指向 fork 仓库
- 更新检查、下载和校验使用 fork 的 `latest.yml` 与 Release 资产
- 更新弹窗、设置页 GitHub、崩溃页 Issue 指向 fork
- 发布流水线改为 `release.yml`，只构建 Windows x64 未签名版本

## 安装说明

- 首个独立版本需要手动安装一次，旧版自动更新不会迁移
- 当前只提供 Windows x64 自动更新，其他架构请手动安装
- 安装包未签名，Windows 可能提示 SmartScreen

## 修复

- 稳定化并发测试中的 vault 锁时序
