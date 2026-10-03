# Bilibili Transcript

通过 yt-dlp + Chrome CDP 双重策略获取 B 站视频字幕。既可以作为 **AI 技能（Skill）** 安装给 agent 使用，也可以作为 **命令行工具** 直接运行。

## 这是什么

- 输入 B 站视频链接或 BVID，输出带时间戳的字幕文本
- 支持中文 / 英文 / AI 字幕
- 优先 yt-dlp（读取浏览器登录态，快、无需浏览器自动化），失败自动切换 Chrome CDP 兜底（连调试模式的 Chrome 直接抓取，几乎不被拦截）
- 失败时给出**明确原因**（未安装 yt-dlp / 412 风控 / Cookie 读取失败 / 无匹配字幕 / 未登录），不再笼统报错

## 适用前提

不是所有视频都能提取文字：**视频本身必须有字幕**，且 B 站的字幕接口通常需要登录态（未登录的请求会被 412 风控拦截）。

- 判断有无字幕：播放视频时播放器控制栏有「字幕」按钮；或 `yt-dlp --list-subs <url>` 能看到语言列表
- 纯音乐、纯画面、部分短视频没有字幕，无法提取

## 快速开始

### 1. 准备依赖

- **Node.js 22+** — [nodejs.org](https://nodejs.org) 或 `brew install node`
- **yt-dlp** — `brew install yt-dlp`，其他平台见[官方安装说明](https://github.com/yt-dlp/yt-dlp#installation)
- **已登录 B 站的日常浏览器** — yt-dlp 通过 `--cookies-from-browser` 读取其登录态

### 2. 安装

**方式 A：作为 AI 技能（给 agent 用）**

```bash
pi install npm:bilibili-transcript
# 或
npx skills add https://github.com/moonmoonCL/bilibili-transcript
```

主方案零 Node 依赖，装完即可用；仅 Chrome CDP 兜底需要额外装一次依赖，见[下文](#进阶chrome-cdp-兜底可选)。

**方式 B：作为命令行工具**

```bash
npm install -g bilibili-transcript
```

### 3. 运行

对 agent 说「获取这个 B 站视频的字幕」即可；手动调用：

```bash
# 命令行方式
bilibili-transcript BV13nwdzPEoR
bilibili-transcript https://www.bilibili.com/video/BV13nwdzPEoR/

# 技能方式
node ~/.agents/skills/bilibili-transcript/transcript.js BV13nwdzPEoR
```

输出带时间戳的字幕文本：

```
# 视频标题

[0:00] 字幕文本第一行
[0:15] 字幕文本第二行
[1:23] 字幕文本第三行
```

## 配置（环境变量）

| 变量                            | 默认值                            | 说明                                                                    |
| ------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `BILIBILI_COOKIES_FROM_BROWSER` | `chrome`                          | yt-dlp 读取 Cookie 的浏览器，如 `firefox`、`edge`、`"chrome:Profile 1"` |
| `BILIBILI_SUBTITLE_LANGS`       | `zh-Hans,zh-CN,zh,zh-TW,ai-zh,en` | 请求的字幕语言（逗号分隔，按此优先级取一条）                            |
| `BILIBILI_CDP_URL`              | `http://localhost:9222`           | Chrome DevTools 调试端点                                                |
| `BILIBILI_YTDLP_TIMEOUT_MS`     | `60000`                           | yt-dlp 超时时间（毫秒）                                                 |

```bash
BILIBILI_COOKIES_FROM_BROWSER=firefox bilibili-transcript BV13nwdzPEoR
BILIBILI_SUBTITLE_LANGS=en bilibili-transcript BV13nwdzPEoR
```

## 进阶：Chrome CDP 兜底（可选）

yt-dlp 失败时脚本会自动切换 Chrome CDP：连接一个开着远程调试端口的 Chrome，直接从页面里抓取字幕，几乎不会被拦截。需要三件事：

### 1. 安装 Node 依赖

仅 skills.sh 安装方式需要手动执行一次：

```bash
cd ~/.agents/skills/bilibili-transcript && npm install
```

### 2. 以远程调试模式启动 Chrome

> ⚠️ **Chrome 136 起，使用默认用户配置目录时会直接忽略 `--remote-debugging-port`。**
> 因此必须搭配独立的 `--user-data-dir`（下例用 `~/.chrome-cdp`）。这是全新配置目录，需要重新登录一次 B 站；好处是不影响日常使用的 Chrome，也不用退出它。

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

确认端口已开启：浏览器访问 <http://localhost:9222/json/version> 能看到 JSON 即成功，或在终端执行：

```bash
curl -s http://localhost:9222/json/version
```

### 3. 登录 B 站

在这个 Chrome 里打开 <https://www.bilibili.com> 并登录账号（部分视频字幕需要登录），保持窗口开着，再运行提取命令即可。

## 故障排查

**yt-dlp（主方案）**

| 现象                                 | 解决                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `[yt-dlp] 未找到 yt-dlp`             | 没装 yt-dlp：`brew install yt-dlp`                                                                              |
| `[yt-dlp] 请求被 B 站拒绝：HTTP 412` | 缺登录态：确认浏览器已登录 B 站；读 Cookie 前**完全退出 Chrome**；或用 `BILIBILI_COOKIES_FROM_BROWSER` 换浏览器 |
| `[yt-dlp] 读取浏览器 Cookie 失败`    | **完全退出 Chrome** 后重试（运行中的 Chrome 会占用 / 加密 Cookie 库）                                           |
| `[yt-dlp] 未找到匹配的字幕`          | 视频没字幕，或语言不在请求列表：`yt-dlp --list-subs <url>` 查看，再用 `BILIBILI_SUBTITLE_LANGS` 指定            |

**Chrome CDP（兜底）**

| 现象                                               | 解决                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `[CDP] 无法连接 http://localhost:9222 上的 Chrome` | Chrome 没开调试端口，或**没加 `--user-data-dir`**（Chrome 136+ 必须）。按上文第 2 步重启 |
| `[CDP] 未能捕获字幕数据`                           | 调试用 Chrome 未登录 B 站，或该视频本身没有字幕                                          |
| `[CDP] 缺少依赖 puppeteer-core`                    | `cd <技能目录> && npm install`                                                           |
| 端口被占用 / 启动后无反应                          | 结束占用 9222 的进程，或用 `BILIBILI_CDP_URL` 换端口                                     |

## 许可证

本项目采用 [MIT 许可证](LICENSE) 开源。
