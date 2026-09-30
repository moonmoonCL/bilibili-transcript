---
name: bilibili-transcript
description: Fetch transcripts from Bilibili videos via yt-dlp (primary) or Chrome DevTools Protocol (fallback). Only works for videos with AI subtitles enabled. Use when you need to get subtitles/transcripts from Bilibili videos.
---

# Bilibili Transcript

Fetch Bilibili video transcripts with dual strategy: yt-dlp (primary) → Chrome CDP (fallback).

## Setup

The primary strategy (yt-dlp) needs no Node dependencies. Install the script
dependencies once **only if** you need the Chrome CDP fallback:

```bash
cd {baseDir} && npm install
```

## Prerequisites

- **Node.js 20+**
- **yt-dlp**: `brew install yt-dlp` (for primary method)
- **Chrome** with bilibili login (for fallback method)

## Usage

```bash
{baseDir}/transcript.js <bvid-or-url>
```

Accepts BVID or full URL:

- `BV13nwdzPEoR`
- `https://www.bilibili.com/video/BV13nwdzPEoR/`

## Strategy

```
1. Try yt-dlp (fast, no browser needed)
   ↓ if 412 error
2. Fall back to Chrome CDP (requires Chrome on :9222)
```

## Output

Timestamped transcript entries:

```
# Video Title

[0:00] 字幕文本第一行
[0:15] 字幕文本第二行
[1:23] 字幕文本第三行
```

## Limitations

- **Only works for videos with AI subtitles enabled** (language code `ai-zh`)
- Videos without AI subtitles will fail with a clear error message
- Check availability: `yt-dlp --list-subs <url>` should show `ai-zh`

## Chrome CDP Fallback (optional)

Triggered automatically when yt-dlp hits a 412 anti-scraping error. It connects
to a Chrome instance with remote debugging enabled and captures the subtitle
request directly. Requires:

1. `puppeteer-core` installed in the skill directory:
   `cd {baseDir} && npm install`
2. Chrome running with remote debugging on port 9222, logged into bilibili.com

Start Chrome (quit it completely first, otherwise the flag is ignored):

```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222
# Linux
google-chrome --remote-debugging-port=9222
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

Verify the port is open: `curl -s http://localhost:9222/json/version`

Keep that Chrome window open and logged into bilibili.com, then run the skill
again. See README.md for detailed setup and troubleshooting.
