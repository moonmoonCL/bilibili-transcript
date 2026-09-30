# 更新日志

本项目遵循 [语义化版本控制](https://semver.org/lang/zh-CN/)。

## [1.0.8] - 2026-09-30

### 修复

- 🐛 修复 `npm install -g bilibili-transcript` 的全局命令经 bin 软链调用时静默不执行的问题（`isMainModule` 现在会解析软链）
- 🔧 `skills/transcript.js` 恢复可执行权限

## [1.0.7] - 2026-09-30

### 持续集成

- 🔐 改用 npm Trusted Publishing（OIDC）发布，不再依赖会过期的 `NPM_TOKEN`，并自动生成 provenance 证明
- 🚀 发布改由版本 tag（`v*`）触发，避免普通提交因版本未变更而发布失败
- ✨ 新增 `prettier --check` 格式校验

## [1.0.6] - 2026-09-30

### 改进

- ✨ `puppeteer-core` 改为按需加载：主方案 yt-dlp 不再需要任何 Node 依赖，仅 Chrome CDP 兜底时才需要
- 📝 `README.md` 补充 Chrome CDP 完整使用说明（如何以 `--remote-debugging-port=9222` 启动 Chrome、验证端口、登录 B 站、故障排查）
- 📝 `README.md` / `SKILL.md` 说明各安装方式的依赖差异（skills.sh 需手动 `npm install`）

## [1.0.5] - 2026-09-30

### 修复

- 🐛 将 `transcript.js` 及依赖声明移入 `skills/` 目录，使 skill 自包含（skills.sh 安装后可直接运行）
- 📝 `SKILL.md` 增加依赖安装步骤（`cd {baseDir} && npm install`）
- 🔧 同步更新 `main` / `bin` / `start` 脚本及测试引用路径

## [1.0.0] - 2024-06-09

### 新增

- 🎉 首次发布
- ✨ 支持通过 yt-dlp 获取 B 站视频字幕
- ✨ 支持 Chrome CDP 兜底方案（应对 412 反爬）
- ✨ 自动检测视频是否有 AI 字幕
- ✨ 输出带时间戳的字幕文本
- ✨ 支持 BVID 和完整 URL 输入
- ✨ 临时文件自动清理
- ✨ 详细的错误提示和故障排查指南

### 技术特性

- **双重策略**：yt-dlp 优先，Chrome CDP 兜底
- **AI 字幕**：仅支持语言代码 `ai-zh` 的字幕
- **反爬处理**：自动应对 B 站 412 错误
- **跨平台**：支持 macOS、Windows、Linux

### 依赖

- Node.js 18+
- yt-dlp（主方案）
- Chrome（兜底方案）
- puppeteer-core（兜底方案）

---

## 版本说明

### 版本号格式

```
主版本号.次版本号.修订号
```

- **主版本号**：不兼容的 API 变更
- **次版本号**：向后兼容的功能性新增
- **修订号**：向后兼容的问题修正

### 预发布版本

```
1.0.0-alpha.1
1.0.0-beta.1
1.0.0-rc.1
```

### 版本标签

- `latest` - 最新稳定版
- `next` - 下一版本预发布
