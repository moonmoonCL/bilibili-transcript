---
name: bilibili-transcript
description: Fetch transcripts from Bilibili videos via yt-dlp (primary) or Chrome DevTools Protocol (fallback). Only works for videos with AI subtitles enabled. Use when you need to get subtitles/transcripts from Bilibili videos.
---

# Bilibili Transcript

Fetch Bilibili video transcripts with dual strategy: yt-dlp (primary) → Chrome CDP (fallback).

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

## Notes

- yt-dlp may hit 412 errors (Bilibili anti-scraping); CDP fallback handles this
- CDP fallback requires Chrome running with `--remote-debugging-port=9222`
- Start Chrome manually with `--remote-debugging-port=9222` and login to bilibili.com
- See README.md for detailed documentation
