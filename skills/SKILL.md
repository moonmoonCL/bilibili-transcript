---
name: bilibili-transcript
description: Fetch transcripts from Bilibili videos via yt-dlp (primary, using browser cookies) or Chrome DevTools Protocol (fallback). Supports Chinese/English/AI subtitle tracks; the video must have subtitles. Use when you need to get subtitles/transcripts from Bilibili videos.
---

# Bilibili Transcript

Fetch Bilibili video transcripts with dual strategy: yt-dlp (primary, reads browser cookies) → Chrome CDP (fallback).

## Setup

The primary strategy (yt-dlp) needs no Node dependencies. Install the script
dependencies once **only if** you need the Chrome CDP fallback:

```bash
cd {baseDir} && npm install
```

## Prerequisites

- **Node.js 22+**
- **yt-dlp**: `brew install yt-dlp` (for the primary method)
- **A browser logged into bilibili.com** — yt-dlp reads cookies with
  `--cookies-from-browser`. If cookie reading fails, **quit the browser first**
  (a running Chrome locks / encrypts its cookie database).
- **Chrome** with remote debugging and a B站 login (fallback method only)

## Usage

```bash
{baseDir}/transcript.js <bvid-or-url>
```

Accepts BVID or full URL:

- `BV13nwdzPEoR`
- `https://www.bilibili.com/video/BV13nwdzPEoR/`

## Strategy

```
1. Try yt-dlp (reads browser cookies; picks a zh / en / AI subtitle track)
   ↓ on failure
2. Fall back to Chrome CDP (requires Chrome on :9222)
```

On failure the script prints the **real** cause instead of a generic error:
yt-dlp not installed, HTTP 412 (anti-scraping / not logged in), cookie read
failure, no matching subtitle language, or the video needs a login.

## Configuration (environment variables)

- `BILIBILI_COOKIES_FROM_BROWSER` — default `chrome` (e.g. `firefox`, `edge`)
- `BILIBILI_SUBTITLE_LANGS` — default `zh-Hans,zh-CN,zh,zh-TW,ai-zh,en`
- `BILIBILI_CDP_URL` — default `http://localhost:9222`
- `BILIBILI_YTDLP_TIMEOUT_MS` — default `60000`

## Output

Timestamped transcript entries:

```
# Video Title

[0:00] 字幕文本第一行
[0:15] 字幕文本第二行
[1:23] 字幕文本第三行
```

## Limitations

- The video must actually have subtitles. Human Chinese/English subtitles and
  AI (`ai-zh`) subtitles are all supported; choose tracks with
  `BILIBILI_SUBTITLE_LANGS`.
- Bilibili's subtitle API usually requires a login, so unauthenticated runs may
  hit HTTP 412.
- Check availability: `yt-dlp --list-subs <url>`.

## Chrome CDP Fallback (optional)

Triggered automatically when yt-dlp fails. Requires:

1. `puppeteer-core` installed in the skill directory:
   `cd {baseDir} && npm install`
2. Chrome running with remote debugging on port 9222 **and a dedicated
   `--user-data-dir`** — Chrome 136+ ignores `--remote-debugging-port` when the
   default profile is used.
3. That same Chrome logged into bilibili.com (some subtitles need a login and the
   API returns `need_login_subtitle`).

Start Chrome:

```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-cdp"
# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-cdp"
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\.chrome-cdp"
```

Verify the port is open: `curl -s http://localhost:9222/json/version`

Keep that Chrome window open and logged into bilibili.com, then run the skill
again. See README.md for detailed setup and troubleshooting.
