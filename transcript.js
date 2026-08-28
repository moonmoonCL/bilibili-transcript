#!/usr/bin/env node

/**
 * Bilibili Transcript - Fetch subtitles via yt-dlp (primary) or Chrome CDP (fallback).
 *
 * Strategy:
 *   1. Try yt-dlp (fast, no browser needed)
 *   2. If yt-dlp fails (412 error, etc.), fall back to Chrome CDP
 *
 * Requires for yt-dlp:
 *   - yt-dlp installed (brew install yt-dlp)
 *   - Chrome with bilibili cookies (for --cookies-from-browser)
 *
 * Requires for CDP fallback:
 *   - Chrome running with --remote-debugging-port=9222
 *   - User logged into bilibili.com in that Chrome instance
 */

import puppeteer from "puppeteer-core";
import { execSync } from "child_process";
import { readFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

const BVID_RE = /[Bb][Vv][a-zA-Z0-9]{10}/;
const CDP_URL = "http://localhost:9222";
const SUBTITLE_LANG = "ai-zh";
const PLATFORM = process.platform;

function getChromeStartCommand() {
  if (PLATFORM === "darwin") {
    const path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    return {
      path,
      example: `"${path}" --remote-debugging-port=9222`,
    };
  }
  if (PLATFORM === "win32") {
    return {
      path: "chrome.exe",
      example: "chrome.exe --remote-debugging-port=9222",
    };
  }
  // linux / others
  return {
    path: "google-chrome",
    example: "google-chrome --remote-debugging-port=9222",
  };
}

const videoInput = process.argv[2];

function extractBvid(input) {
  const match = input.match(BVID_RE);
  return match ? match[0] : null;
}

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseSrt(srtContent) {
  const entries = [];
  const blocks = srtContent.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;

    // Parse timestamp: 00:00:01,440 --> 00:00:03,580
    const timeMatch = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
    );
    if (!timeMatch) continue;

    const startSec =
      parseInt(timeMatch[1]) * 3600 +
      parseInt(timeMatch[2]) * 60 +
      parseInt(timeMatch[3]) +
      parseInt(timeMatch[4]) / 1000;

    const content = lines.slice(2).join("\n").trim();
    entries.push({ from: startSec, content });
  }

  return entries;
}

// ============================================================
// Method 1: yt-dlp
// ============================================================
async function fetchViaYtDlp(bvid) {
  const videoUrl = `https://www.bilibili.com/video/${bvid}/`;
  const tmpId = randomBytes(8).toString("hex");
  const tmpDir = join(tmpdir(), `bilibili-${tmpId}`);

  try {
    mkdirSync(tmpDir, { recursive: true });

    console.error("[yt-dlp] Fetching subtitles...");

    const cmd = [
      "yt-dlp",
      "--cookies-from-browser",
      "chrome",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      SUBTITLE_LANG,
      "--sub-format",
      "srt",
      "--skip-download",
      "-o",
      join(tmpDir, "%(title)s.%(ext)s"),
      videoUrl,
    ]
      .map(a => `"${a}"`)
      .join(" ");

    execSync(cmd, {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Find the downloaded SRT file
    const files = await import("fs").then(fs =>
      fs.readdirSync(tmpDir).filter(f => f.endsWith(".srt"))
    );

    if (files.length === 0) {
      console.error("[yt-dlp] No subtitle file found");
      return null;
    }

    const srtPath = join(tmpDir, files[0]);
    const srtContent = readFileSync(srtPath, "utf-8");
    const entries = parseSrt(srtContent);

    // Extract title from filename
    const title = files[0].replace(`.${SUBTITLE_LANG}.srt`, "").trim();

    console.error(`[yt-dlp] Got ${entries.length} entries`);

    return { title, entries };
  } catch (error) {
    const is412 =
      error.message?.includes("412") || error.stderr?.includes("412");
    if (is412) {
      console.error("[yt-dlp] 412 Precondition Failed (anti-scraping)");
    } else {
      console.error(`[yt-dlp] Failed: ${error.message?.slice(0, 100)}`);
    }
    return null;
  } finally {
    // Cleanup temp files
    try {
      const files = await import("fs").then(fs => fs.readdirSync(tmpDir));
      for (const f of files) {
        unlinkSync(join(tmpDir, f));
      }
      await import("fs").then(fs => fs.rmdirSync(tmpDir));
    } catch (_) {
      /* ignore cleanup errors */
    }
  }
}

// ============================================================
// Method 2: Chrome CDP (fallback)
// ============================================================
async function fetchViaCdp(bvid) {
  const videoUrl = `https://www.bilibili.com/video/${bvid}/`;

  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: CDP_URL,
      defaultViewport: null,
    });
  } catch (e) {
    const { path: chromePath, example } = getChromeStartCommand();
    console.error(`[CDP] Cannot connect to Chrome on ${CDP_URL}`);
    console.error(
      "[CDP] Chrome must be running with remote debugging enabled."
    );
    console.error("[CDP] Start Chrome manually:");
    console.error(`[CDP]   ${example}`);
    console.error("[CDP] Then login to bilibili.com in that Chrome window.");
    console.error(`[CDP] (Default path: ${chromePath})`);
    return null;
  }

  console.error("[CDP] Connecting to Chrome...");

  const page = await browser.newPage();
  const cdp = await page.target().createCDPSession();

  // Set up subtitle response interception
  let subtitleData = null;

  cdp.on("Network.responseReceived", async event => {
    const url = event.response.url;
    if (
      url.includes("aisubtitle.hdslb.com") ||
      url.includes("subtitle.bilibili.com")
    ) {
      if (url.includes(".json") || url.includes("/bfs/")) {
        try {
          const body = await cdp.send("Network.getResponseBody", {
            requestId: event.requestId,
          });
          const parsed = JSON.parse(body.body);
          if (parsed.body && Array.isArray(parsed.body)) {
            subtitleData = parsed;
          }
        } catch (e) {
          // Not JSON or parse error, skip
        }
      }
    }
  });

  await cdp.send("Network.enable");

  // Navigate to video page
  console.error(`[CDP] Opening ${videoUrl} ...`);
  await page.goto(videoUrl, { waitUntil: "networkidle2", timeout: 30000 });
  console.error("[CDP] Page loaded.");

  // Get the video title
  const title = await page.evaluate(() => {
    return document.title.replace(/_哔哩哔哩_bilibili$/, "").trim();
  });

  // Click the subtitle button to trigger subtitle load
  console.error("[CDP] Enabling subtitles...");
  const subtitleClicked = await page.evaluate(lang => {
    const zhOption = document.querySelector(`[data-lan=${lang}]`);
    if (zhOption) {
      zhOption.click();
      return true;
    }

    const subtitleBtn = document.querySelector(".bpx-player-ctrl-subtitle");
    if (subtitleBtn) {
      subtitleBtn.click();
      return "menu-opened";
    }

    return false;
  }, SUBTITLE_LANG);

  if (subtitleClicked === "menu-opened") {
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(lang => {
      const zhOption = document.querySelector(`[data-lan=${lang}]`);
      if (zhOption) zhOption.click();
    }, SUBTITLE_LANG);
  }

  // Wait for subtitle data
  console.error("[CDP] Waiting for subtitle data...");
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (subtitleData && subtitleData.body && subtitleData.body.length > 0) {
      break;
    }
  }

  if (!subtitleData || !subtitleData.body || subtitleData.body.length === 0) {
    console.error("[CDP] Failed to capture subtitle data.");
    console.error("[CDP] This video may not have AI subtitles available.");
    await page.close();
    browser.disconnect();
    return null;
  }

  const entries = subtitleData.body.map(e => ({
    from: e.from,
    content: e.content,
  }));

  console.error(`[CDP] Got ${entries.length} entries`);

  await page.close();
  browser.disconnect();

  return { title, entries };
}

// ============================================================
// Main: yt-dlp → CDP fallback
// ============================================================
async function main() {
  const bvid = extractBvid(videoInput);
  if (!bvid) {
    console.error("Could not extract a valid BVID from:", videoInput);
    process.exit(1);
  }

  // Method 1: Try yt-dlp
  let result = await fetchViaYtDlp(bvid);

  // Method 2: Fallback to CDP if yt-dlp failed
  if (!result) {
    console.error("");
    console.error("[fallback] Switching to Chrome CDP...");
    result = await fetchViaCdp(bvid);
  }

  if (!result || !result.entries || result.entries.length === 0) {
    console.error("");
    console.error("Failed to fetch subtitles from both methods.");
    console.error("This video may not have AI subtitles available.");
    process.exit(1);
  }

  // Output the transcript
  console.log(`# ${result.title}`);
  console.log();

  for (const entry of result.entries) {
    const timestamp = formatTimestamp(entry.from);
    console.log(`[${timestamp}] ${entry.content}`);
  }

  console.error(`\nDone. ${result.entries.length} subtitle entries.`);
}

// Export functions for testing
export { extractBvid, formatTimestamp, parseSrt };

// Only run main when executed directly (not imported)
const isMainModule =
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url === `file://${process.argv[1]}.js` ||
    import.meta.url.endsWith(process.argv[1]));

if (isMainModule) {
  if (!videoInput) {
    console.error("Usage: node transcript.js <bvid-or-url>");
    console.error("Example: node transcript.js BV13nwdzPEoR");
    console.error(
      "Example: node transcript.js https://www.bilibili.com/video/BV13nwdzPEoR"
    );
    console.error("");
    console.error("Strategy: yt-dlp (primary) → Chrome CDP (fallback)");
    process.exit(1);
  }

  try {
    await main();
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}
