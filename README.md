# Bilibili Transcript

通过 yt-dlp + Chrome CDP 双重策略获取 B 站视频字幕的工具。

## 功能

- 输入 B 站视频链接或 BVID，输出带时间戳的字幕文本
- **仅支持有 AI 字幕的视频**（语言代码 `ai-zh`）
- 没有 AI 字幕的视频会明确提示失败

### ⚠️ 限制

此工具**只能下载 B 站启用了 AI 字幕的视频**。判断方法：

- 播放视频时，播放器控制栏有「字幕」按钮
- 或通过命令查看：`yt-dlp --list-subs <url>`，看是否有 `ai-zh` 语言

没有 AI 字幕的视频（如纯音乐、纯画面、部分短视频）无法提取文字内容。

## 策略

```
1. yt-dlp（优先）    ← 快速，不需要浏览器
   ↓ 如果 412 错误
2. Chrome CDP（兜底） ← 需要 Chrome 运行，但更稳定
```

| 方法           | 优点                           | 缺点              |
| -------------- | ------------------------------ | ----------------- |
| **yt-dlp**     | 快速、简单、不需要 Chrome 运行 | 可能遇到 412 反爬 |
| **Chrome CDP** | 几乎不会被拦截                 | 需要 Chrome 运行  |

## 快速开始

### 安装方式

**方式 1：Pi Packages（推荐）**

```bash
pi install npm:bilibili-transcript
```

**方式 2：skills.sh**

```bash
npx skills add https://github.com/moonmoonCL/bilibili-transcript
```

**方式 3：npm 全局安装**

```bash
npm install -g bilibili-transcript
```

### 1. 安装系统依赖

```bash
# 安装 yt-dlp（主方案）
brew install yt-dlp
```

### 2. 在Chrome中登录账号

**重要**：需要使用浏览器中的 B 站 Cookie。请确保：

1. 在 Chrome 浏览器中登录 bilibili.com 账号
2. 保持浏览器处于登录状态
3. yt-dlp 会自动从浏览器读取 Cookie（使用 `--cookies-from-browser chrome` 参数）

### 3. 提取字幕

```bash
bilibili-transcript <BVID或URL>
```

示例：

```bash
bilibili-transcript BV13nwdXXXXX
bilibili-transcript https://www.bilibili.com/video/BV13nwdzPXXX/
```

### 输出

```
[0:00] XXXXX
[0:01] XXXXX
[0:03] XXXXX
[0:04] XXXXX
...
```

## 许可证

本项目采用 [MIT 许可证](LICENSE) 开源。
