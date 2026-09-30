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

| 方法           | 优点                           | 缺点              | 需要的依赖                       |
| -------------- | ------------------------------ | ----------------- | -------------------------------- |
| **yt-dlp**     | 快速、简单、不需要 Chrome 运行 | 可能遇到 412 反爬 | 只需 yt-dlp                      |
| **Chrome CDP** | 几乎不会被拦截                 | 需要 Chrome 运行  | yt-dlp + puppeteer-core + Chrome |

> 主方案 yt-dlp **不需要任何 Node 依赖**；只有走 CDP 兜底时才需要 `puppeteer-core`（见下文）。

## 快速开始

### 安装

**方式 1：Pi Packages（推荐）**

```bash
pi install npm:bilibili-transcript
```

> 会自动安装 Node 依赖（`puppeteer-core`），装完即可使用。

**方式 2：skills.sh**

```bash
npx skills add https://github.com/moonmoonCL/bilibili-transcript
```

> skills CLI 只复制技能文件，**不会安装 Node 依赖**。
> 只用 yt-dlp 主方案的话可以直接用；如果要使用 **Chrome CDP 兜底**，需要执行一次：
>
> ```bash
> cd ~/.agents/skills/bilibili-transcript && npm install
> ```

**方式 3：npm 全局安装**

```bash
npm install -g bilibili-transcript
```

> 会自动安装 Node 依赖，并提供全局命令 `bilibili-transcript`。

### 1. 安装 yt-dlp（主方案）

```bash
# macOS
brew install yt-dlp
```

其他平台见 <https://github.com/yt-dlp/yt-dlp#installation>。

### 2. 在 Chrome 中登录 B 站账号

yt-dlp 会通过 `--cookies-from-browser chrome` 读取你**日常使用的 Chrome** 里的 B 站 Cookie，所以请确保：

1. 在 Chrome 浏览器中登录 bilibili.com 账号
2. 保持浏览器处于登录状态

> 注意：这里用的是普通 Chrome；CDP 兜底用的是「远程调试模式的 Chrome」，两者相互独立，详见下方章节。

### 3. 提取字幕

- 通过 **npm 全局安装**的，直接使用全局命令：

  ```bash
  bilibili-transcript <BVID或URL>
  ```

- 通过 **Pi Package / skills.sh** 安装的，由 agent 按 `SKILL.md` 里的 `{baseDir}/transcript.js` 调用；手动调用则为：

  ```bash
  # skills.sh 全局安装后的路径示例
  node ~/.agents/skills/bilibili-transcript/transcript.js <BVID或URL>
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

## Chrome CDP 兜底方案（可选）

当 yt-dlp 遇到 `412` 反爬错误时，脚本会自动切换到 Chrome CDP：连接一个开着远程调试端口的 Chrome，直接从浏览器里抓取字幕，几乎不会被拦截。

### 前置条件

1. 已安装 Node 依赖 `puppeteer-core`（仅 skills.sh 安装方式需要手动执行一次）：

   ```bash
   cd ~/.agents/skills/bilibili-transcript && npm install
   ```

2. Chrome 以远程调试模式运行在 **9222** 端口
3. 该 Chrome 已登录 bilibili.com

### 第 1 步：以远程调试模式启动 Chrome

> ⚠️ 需要**先完全退出 Chrome**（macOS 用 `Cmd + Q`，或结束所有 Chrome 进程），否则新的启动参数不会生效。

**macOS**

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222
```

**Windows**

```bat
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

**Linux**

```bash
google-chrome --remote-debugging-port=9222
```

> 如果不想影响你日常使用的 Chrome，可以用一个单独的配置目录（需要在该实例里重新登录 B 站）：
>
> ```bash
> "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
>   --remote-debugging-port=9222 \
>   --user-data-dir="$HOME/.chrome-cdp"
> ```

### 第 2 步：确认调试端口已开启

浏览器访问 <http://localhost:9222/json/version>，能看到 JSON（含 `webSocketDebuggerUrl`）即成功；或在终端执行：

```bash
curl -s http://localhost:9222/json/version
```

### 第 3 步：登录 B 站并提取字幕

用这个 Chrome 打开 <https://www.bilibili.com> 并登录账号，保持窗口开着，然后运行提取命令即可。

### 故障排查

| 现象                                                      | 原因 / 解决                                                |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| `[CDP] Cannot connect to Chrome on http://localhost:9222` | Chrome 没开调试端口，或启动前没完全退出。按第 1 步重启     |
| `[CDP] Missing dependency: puppeteer-core`                | 没装 Node 依赖。执行 `cd <技能目录> && npm install`        |
| 端口被占用 / 启动后无反应                                 | 结束占用 9222 的进程，或换端口并同步修改脚本里的 `CDP_URL` |
| 抓不到字幕                                                | 该视频没有 AI 字幕（`ai-zh`），或该 Chrome 未登录 B 站     |

## 许可证

本项目采用 [MIT 许可证](LICENSE) 开源。
