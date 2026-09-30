# Bilibili Transcript

通过 yt-dlp + Chrome CDP 双重策略获取 B 站视频字幕。既可以作为 **AI 技能（Skill）** 安装给 agent 使用，也可以作为 **命令行工具** 直接运行。

## 功能

- 输入 B 站视频链接或 BVID，输出带时间戳的字幕文本
- 支持视频的**中文字幕 / 英文字幕 / AI 字幕**（按 `zh-Hans → zh-CN → zh → zh-TW → ai-zh → en` 优先级取一条）
- 优先使用 yt-dlp（可读取浏览器登录态），失败时自动切换 Chrome CDP 兜底
- 失败时会给出**明确原因**（未安装 yt-dlp / 412 风控 / Cookie 读取失败 / 无匹配字幕 / 未登录），不再笼统报错

### ⚠️ 前提

**视频本身必须有字幕**，且 B 站的字幕接口通常需要登录态（未登录的元数据请求会被 412 风控拦截）。

- 判断方法：播放视频时播放器控制栏有「字幕」按钮；或 `yt-dlp --list-subs <url>` 能看到语言列表
- 没有字幕的视频（纯音乐、纯画面、部分短视频）无法提取文字内容

## 工作原理

```
1. yt-dlp（优先）    ← 读取浏览器 Cookie，快速，不需要浏览器自动化
   ↓ 失败（412 风控 / 无匹配字幕 / Cookie 读取失败 …）
2. Chrome CDP（兜底） ← 连接调试模式的 Chrome，直接在页面里抓取字幕
```

| 方法           | 优点                           | 缺点                         | 需要的依赖              |
| -------------- | ------------------------------ | ---------------------------- | ----------------------- |
| **yt-dlp**     | 快速、简单、不需要浏览器自动化 | 可能遇到 412 反爬            | yt-dlp                  |
| **Chrome CDP** | 几乎不会被拦截                 | 需要调试模式 Chrome 且已登录 | puppeteer-core + Chrome |

## 快速开始

### 第 1 步：准备前置环境

| 依赖                     | 是否必须 | 说明                                                                  | 安装                                                    |
| ------------------------ | -------- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| **Node.js 22+**          | 必须     | 运行脚本                                                              | [nodejs.org](https://nodejs.org) 或 `brew install node` |
| **yt-dlp**               | 必须     | 主方案，抓取字幕                                                      | `brew install yt-dlp`                                   |
| **浏览器 + 已登录 B 站** | 必须     | yt-dlp 通过 `--cookies-from-browser` 读取登录态                       | 用日常浏览器登录 <https://www.bilibili.com>             |
| **Chrome 调试模式**      | 可选     | 仅 CDP 兜底需要，详见 [Chrome CDP 兜底方案](#chrome-cdp-兜底方案可选) | —                                                       |

> 读取 Cookie 如果报错，请**完全退出浏览器**后重试（运行中的 Chrome 会占用 / 加密 Cookie 库）。
> `yt-dlp` 其他平台的安装方式见 <https://github.com/yt-dlp/yt-dlp#installation>。

### 第 2 步：安装

**方式 A：作为 AI 技能（给 agent 用）**

- **Pi Packages**

  ```bash
  pi install npm:bilibili-transcript
  ```

- **skills.sh**

  ```bash
  npx skills add https://github.com/moonmoonCL/bilibili-transcript
  ```

> 技能自带 `transcript.js`，yt-dlp 主方案**零 Node 依赖**，装完即可用。
> 只有需要使用 **Chrome CDP 兜底** 时，才需要额外装一次依赖：
>
> ```bash
> cd ~/.agents/skills/bilibili-transcript && npm install
> ```

**方式 B：作为命令行工具**

```bash
npm install -g bilibili-transcript
```

> 会连同 Node 依赖一起装好，并注册全局命令 `bilibili-transcript`。

### 第 3 步：使用

- **技能方式**：直接对 agent 说「获取这个 B 站视频的字幕」即可；手动调用为：

  ```bash
  node ~/.agents/skills/bilibili-transcript/transcript.js <BVID或URL>
  ```

- **命令行方式**：

  ```bash
  bilibili-transcript <BVID或URL>
  ```

输入支持 BVID 或完整 URL：

```bash
bilibili-transcript BV13nwdzPEoR
bilibili-transcript https://www.bilibili.com/video/BV13nwdzPEoR/
```

输出：

```
# 视频标题

[0:00] 字幕文本第一行
[0:15] 字幕文本第二行
[1:23] 字幕文本第三行
```

## 可配置项（环境变量）

| 变量                            | 默认值                            | 说明                                                                    |
| ------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `BILIBILI_COOKIES_FROM_BROWSER` | `chrome`                          | yt-dlp 读取 Cookie 的浏览器，如 `firefox`、`edge`、`"chrome:Profile 1"` |
| `BILIBILI_SUBTITLE_LANGS`       | `zh-Hans,zh-CN,zh,zh-TW,ai-zh,en` | 请求的字幕语言（逗号分隔）                                              |
| `BILIBILI_CDP_URL`              | `http://localhost:9222`           | Chrome DevTools 调试端点                                                |
| `BILIBILI_YTDLP_TIMEOUT_MS`     | `60000`                           | yt-dlp 超时时间（毫秒）                                                 |

示例：

```bash
BILIBILI_COOKIES_FROM_BROWSER=firefox bilibili-transcript BV13nwdzPEoR
BILIBILI_SUBTITLE_LANGS=en bilibili-transcript BV13nwdzPEoR
```

## Chrome CDP 兜底方案（可选）

当 yt-dlp 失败时，脚本会自动切换到 Chrome CDP：连接一个开着远程调试端口的 Chrome，直接从浏览器里抓取字幕，几乎不会被拦截。

### 前置条件

1. 已安装 Node 依赖 `puppeteer-core`（仅 skills.sh 安装方式需要手动执行一次）：

   ```bash
   cd ~/.agents/skills/bilibili-transcript && npm install
   ```

2. Chrome 以远程调试模式运行在 **9222** 端口，并且使用了**独立的 `--user-data-dir`**
3. 该 Chrome 已登录 bilibili.com（部分视频字幕需要登录，接口会返回 `need_login_subtitle`）

### 第 1 步：以远程调试模式启动 Chrome

> ⚠️ **Chrome 136 起，使用默认用户配置目录时会直接忽略 `--remote-debugging-port`。**
> 因此必须搭配一个独立的 `--user-data-dir`（下面示例用 `~/.chrome-cdp`）。
> 这是一个全新的配置目录，需要**重新登录一次 B 站**；好处是不影响你日常使用的 Chrome，也不用退出它。

**macOS**

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-cdp"
```

**Windows**

```bat
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\.chrome-cdp"
```

**Linux**

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-cdp"
```

### 第 2 步：确认调试端口已开启

浏览器访问 <http://localhost:9222/json/version>，能看到 JSON（含 `webSocketDebuggerUrl`）即成功；或在终端执行：

```bash
curl -s http://localhost:9222/json/version
```

### 第 3 步：登录 B 站并提取字幕

在这个 Chrome 里打开 <https://www.bilibili.com> 并登录账号，保持窗口开着，然后运行提取命令即可。

### 故障排查

| 现象                                               | 原因 / 解决                                                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `[yt-dlp] 未找到 yt-dlp`                           | 没装 yt-dlp。`brew install yt-dlp`                                                                                |
| `[yt-dlp] 请求被 B 站拒绝：HTTP 412`               | 缺登录态。确认浏览器已登录 B 站；读取 Cookie 前**完全退出 Chrome**；或用 `BILIBILI_COOKIES_FROM_BROWSER` 换浏览器 |
| `[yt-dlp] 读取浏览器 Cookie 失败`                  | 完全退出 Chrome 后重试（运行中的 Chrome 会占用 / 加密 Cookie 库）                                                 |
| `[yt-dlp] 未找到匹配的字幕`                        | 视频没字幕，或语言不在请求列表。用 `yt-dlp --list-subs <url>` 查看，再用 `BILIBILI_SUBTITLE_LANGS` 指定           |
| `[CDP] 无法连接 http://localhost:9222 上的 Chrome` | Chrome 没开调试端口，或**没加 `--user-data-dir`**（Chrome 136+ 必须）。按第 1 步重启                              |
| `[CDP] 未能捕获字幕数据`                           | 调试用 Chrome 未登录 B 站（`need_login_subtitle`），或该视频本身没有字幕                                          |
| `[CDP] 缺少依赖 puppeteer-core`                    | 执行 `cd <技能目录> && npm install`                                                                               |
| 端口被占用 / 启动后无反应                          | 结束占用 9222 的进程，或用 `BILIBILI_CDP_URL` 换端口                                                              |

## 许可证

本项目采用 [MIT 许可证](LICENSE) 开源。
