#!/usr/bin/env node

/**
 * Bilibili Transcript - Fetch subtitles via yt-dlp (primary) or Chrome CDP (fallback).
 *
 * Strategy:
 *   1. Try yt-dlp with browser cookies (fast, no Chrome automation needed)
 *   2. If yt-dlp fails, fall back to Chrome CDP
 *
 * Requires for yt-dlp:
 *   - yt-dlp installed (brew install yt-dlp)
 *   - A browser logged into bilibili.com (cookies are read via
 *     `--cookies-from-browser`; quit the browser first if cookie decryption fails)
 *
 * Requires for CDP fallback:
 *   - puppeteer-core (cd <skill-dir> && npm install)
 *   - Chrome started with BOTH `--remote-debugging-port=9222` and a dedicated
 *     `--user-data-dir` (Chrome 136+ ignores remote debugging on the default profile)
 *   - That same Chrome logged into bilibili.com
 *
 * Environment variables:
 *   BILIBILI_COOKIES_FROM_BROWSER  Browser for yt-dlp cookies (default: chrome)
 *   BILIBILI_SUBTITLE_LANGS        Comma-separated subtitle languages (default: zh+en)
 *   BILIBILI_CDP_URL               Chrome DevTools endpoint (default: http://localhost:9222)
 *   BILIBILI_YTDLP_TIMEOUT_MS      yt-dlp timeout in ms (default: 60000)
 */

import { spawnSync } from "child_process";
import {
  readFileSync,
  readdirSync,
  unlinkSync,
  rmdirSync,
  mkdirSync,
  realpathSync,
} from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";
import { pathToFileURL } from "url";
import { randomBytes } from "crypto";

const BVID_RE = /[Bb][Vv][a-zA-Z0-9]{10}/;
const CDP_URL = process.env.BILIBILI_CDP_URL || "http://localhost:9222";
const COOKIES_FROM_BROWSER =
  process.env.BILIBILI_COOKIES_FROM_BROWSER || "chrome";
const SUBTITLE_LANGS =
  process.env.BILIBILI_SUBTITLE_LANGS || "zh-Hans,zh-CN,zh,zh-TW,ai-zh,en";
const YTDLP_TIMEOUT_MS = Number(process.env.BILIBILI_YTDLP_TIMEOUT_MS) || 60000;
const PLATFORM = process.platform;

// Preferred subtitle languages, most wanted first. Used both to pick the
// downloaded file and to choose a track on the CDP fallback path.
const LANG_PRIORITY = [
  "zh-Hans",
  "zh-CN",
  "zh",
  "zh-TW",
  "ai-zh",
  "en",
  "en-US",
];

function getChromeStartCommand() {
  // Chrome 136+ ignores --remote-debugging-port when the default profile is used,
  // so a dedicated --user-data-dir is mandatory. The account must log in there.
  const profileDir = join(homedir(), ".chrome-cdp");
  const flags = `--remote-debugging-port=9222 --user-data-dir="${profileDir}"`;

  if (PLATFORM === "darwin") {
    const path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    return { path, profileDir, example: `"${path}" ${flags}` };
  }
  if (PLATFORM === "win32") {
    return {
      path: "chrome.exe",
      profileDir,
      example: `chrome.exe ${flags}`,
    };
  }
  // linux / others
  return {
    path: "google-chrome",
    profileDir,
    example: `google-chrome ${flags}`,
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

/**
 * Pick the most preferred subtitle file among the downloaded `.srt` files.
 * yt-dlp writes them as `<title>.<lang>.srt`.
 */
function pickSubtitleFile(files) {
  for (const lang of LANG_PRIORITY) {
    const match = files.find(name => name.endsWith(`.${lang}.srt`));
    if (match) return { file: match, lang };
  }
  const fallback = files[0];
  if (!fallback) return { file: null, lang: null };
  const guessed = fallback.match(/\.([A-Za-z0-9-]+)\.srt$/);
  return { file: fallback, lang: guessed ? guessed[1] : null };
}

/** Print the interesting lines of yt-dlp output so failures are not swallowed. */
function printYtDlpOutput(output, heading = "yt-dlp 输出") {
  const lines = (output || "")
    .split("\n")
    .map(line => line.trimEnd())
    .filter(Boolean);
  if (lines.length === 0) return;

  const interesting = lines.filter(line =>
    /error|warning|412|subtitle|caption|cookie|login|forbidden|denied|unavailable/i.test(
      line
    )
  );
  const shown = (interesting.length > 0 ? interesting : lines).slice(-12);

  console.error(`[yt-dlp] ${heading}:`);
  for (const line of shown) console.error(`[yt-dlp]   ${line}`);
}

/** Explain a yt-dlp failure using its real output, instead of hiding it. */
function explainYtDlpFailure(output) {
  const text = output || "";

  if (/412|precondition failed/i.test(text)) {
    console.error("[yt-dlp] 请求被 B 站拒绝：HTTP 412（反爬 / 风控）。");
    console.error("[yt-dlp] 通常是缺少登录态，请确认：");
    console.error(
      `[yt-dlp]   1) 浏览器已登录 bilibili.com（当前浏览器：${COOKIES_FROM_BROWSER}）`
    );
    console.error(
      "[yt-dlp]   2) 读取 Cookie 时建议完全退出 Chrome（运行中的 Chrome 会占用 Cookie 库）"
    );
    console.error(
      "[yt-dlp]   可用 BILIBILI_COOKIES_FROM_BROWSER=firefox 指定其他浏览器"
    );
  } else if (
    /cookie|decrypt|keyring|keychain|permission denied|could not.*(chrome|browser)/i.test(
      text
    )
  ) {
    console.error("[yt-dlp] 读取浏览器 Cookie 失败。");
    console.error(
      "[yt-dlp] 请完全退出 Chrome 后重试（运行中的 Chrome 会占用/加密 Cookie 库）。"
    );
  } else if (/sign in|login required|need_login/i.test(text)) {
    console.error("[yt-dlp] 该视频需要登录后才能获取字幕。");
    console.error("[yt-dlp] 请先在浏览器登录 bilibili.com，再重试。");
  } else if (/no subtitles|there are no subtitles|does not have/i.test(text)) {
    console.error("[yt-dlp] 该视频没有可用字幕。");
    console.error(
      "[yt-dlp] 可用 `yt-dlp --list-subs <url>` 查看该视频支持的字幕语言。"
    );
  } else {
    console.error("[yt-dlp] 执行失败，下面是 yt-dlp 的原始输出。");
  }

  printYtDlpOutput(output);
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

    console.error(
      `[yt-dlp] 正在获取字幕（读取浏览器 Cookie：${COOKIES_FROM_BROWSER}）...`
    );

    const args = [
      "--cookies-from-browser",
      COOKIES_FROM_BROWSER,
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      SUBTITLE_LANGS,
      "--sub-format",
      "srt",
      "--skip-download",
      "-o",
      join(tmpDir, "%(title)s.%(ext)s"),
      videoUrl,
    ];

    const res = spawnSync("yt-dlp", args, {
      encoding: "utf-8",
      timeout: YTDLP_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    });
    const output = `${res.stdout || ""}\n${res.stderr || ""}`;

    if (res.error?.code === "ENOENT") {
      console.error(
        "[yt-dlp] 未找到 yt-dlp。请先安装：brew install yt-dlp（其他平台见 README）。"
      );
      return null;
    }
    if (res.error?.code === "ETIMEDOUT" || res.signal === "SIGTERM") {
      console.error(`[yt-dlp] 执行超时（> ${YTDLP_TIMEOUT_MS} ms），已放弃。`);
      printYtDlpOutput(output, "超时前的输出");
      return null;
    }

    const files = readdirSync(tmpDir).filter(f => f.endsWith(".srt"));

    if (res.status !== 0) {
      explainYtDlpFailure(output);
      return null;
    }

    if (files.length === 0) {
      // yt-dlp exited 0 but wrote no subtitle: usually the video has no
      // subtitles, or none in the requested languages.
      console.error(
        `[yt-dlp] 未找到匹配的字幕（请求语言：${SUBTITLE_LANGS}）。`
      );
      console.error("[yt-dlp] 该视频可能没有字幕，或字幕语言不在请求列表内。");
      console.error(
        "[yt-dlp] 可用 `yt-dlp --list-subs <url>` 查看支持的语言，"
      );
      console.error(
        "[yt-dlp] 或用 BILIBILI_SUBTITLE_LANGS=zh-Hans,en 自定义。"
      );
      printYtDlpOutput(output);
      return null;
    }

    const { file, lang } = pickSubtitleFile(files);
    const srtContent = readFileSync(join(tmpDir, file), "utf-8");
    const entries = parseSrt(srtContent);

    const suffix = lang ? `.${lang}.srt` : ".srt";
    const title = file.endsWith(suffix)
      ? file.slice(0, -suffix.length).trim()
      : file.replace(/\.srt$/, "");

    console.error(
      `[yt-dlp] 成功：${entries.length} 条字幕${lang ? `（语言 ${lang}）` : ""}`
    );

    return { title, entries };
  } finally {
    // Cleanup temp files
    try {
      for (const f of readdirSync(tmpDir)) {
        unlinkSync(join(tmpDir, f));
      }
      rmdirSync(tmpDir);
    } catch {
      /* ignore cleanup errors */
    }
  }
}

// ============================================================
// Method 2: Chrome CDP (fallback)
// ============================================================
async function fetchViaCdp(bvid) {
  const videoUrl = `https://www.bilibili.com/video/${bvid}/`;

  // puppeteer-core is only needed for the CDP fallback. Import it lazily so the
  // primary yt-dlp strategy keeps working without installing any Node dependency.
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer-core")).default;
  } catch {
    console.error("[CDP] 缺少依赖 puppeteer-core。");
    console.error("[CDP] 请先安装技能依赖：");
    console.error("[CDP]   cd <skill-dir> && npm install");
    console.error("[CDP] （或全局安装：npm install -g bilibili-transcript）");
    return null;
  }

  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: CDP_URL,
      defaultViewport: null,
    });
  } catch {
    const { path: chromePath, profileDir, example } = getChromeStartCommand();
    console.error(`[CDP] 无法连接 ${CDP_URL} 上的 Chrome。`);
    console.error(
      "[CDP] Chrome 必须以远程调试模式启动；Chrome 136+ 还必须指定独立的 --user-data-dir："
    );
    console.error(`[CDP]   ${example}`);
    console.error(
      `[CDP] 然后在该 Chrome 里登录 bilibili.com（配置目录：${profileDir}）。`
    );
    console.error(`[CDP] （Chrome 路径：${chromePath}）`);
    return null;
  }

  console.error("[CDP] 已连接 Chrome，开始抓取...");

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
        } catch {
          // Not JSON or parse error, skip
        }
      }
    }
  });

  await cdp.send("Network.enable");

  // Navigate to video page
  console.error(`[CDP] 打开 ${videoUrl} ...`);
  await page.goto(videoUrl, { waitUntil: "networkidle2", timeout: 30000 });
  console.error("[CDP] 页面加载完成。");

  // Get the video title
  const title = await page.evaluate(() => {
    return document.title.replace(/_哔哩哔哩_bilibili$/, "").trim();
  });

  // Click the subtitle button to trigger subtitle load
  console.error("[CDP] 尝试开启字幕...");
  const subtitleClicked = await page.evaluate(langs => {
    for (const lang of langs) {
      const option = document.querySelector(`[data-lan="${lang}"]`);
      if (option) {
        option.click();
        return lang;
      }
    }

    const subtitleBtn = document.querySelector(".bpx-player-ctrl-subtitle");
    if (subtitleBtn) {
      subtitleBtn.click();
      return "menu-opened";
    }

    return false;
  }, LANG_PRIORITY);

  if (subtitleClicked === "menu-opened") {
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(langs => {
      for (const lang of langs) {
        const option = document.querySelector(`[data-lan="${lang}"]`);
        if (option) {
          option.click();
          return;
        }
      }
    }, LANG_PRIORITY);
  }

  // Wait for subtitle data
  console.error("[CDP] 等待字幕数据...");
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (subtitleData && subtitleData.body && subtitleData.body.length > 0) {
      break;
    }
  }

  if (!subtitleData || !subtitleData.body || subtitleData.body.length === 0) {
    console.error("[CDP] 未能捕获字幕数据。可能原因：");
    console.error("[CDP]   1) 该视频没有字幕");
    console.error(
      "[CDP]   2) 用于调试的 Chrome 未登录 B 站（部分字幕需要登录，接口会返回 need_login_subtitle）"
    );
    await page.close();
    browser.disconnect();
    return null;
  }

  const entries = subtitleData.body.map(e => ({
    from: e.from,
    content: e.content,
  }));

  console.error(`[CDP] 成功：${entries.length} 条字幕`);

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
    console.error("[fallback] 切换到 Chrome CDP 兜底...");
    result = await fetchViaCdp(bvid);
  }

  if (!result || !result.entries || result.entries.length === 0) {
    console.error("");
    console.error("两种方式都未能获取字幕。");
    console.error(
      "常见原因：视频没有字幕，或浏览器 / 调试用 Chrome 未登录 B 站。"
    );
    process.exit(1);
  }

  // Output the transcript
  console.log(`# ${result.title}`);
  console.log();

  for (const entry of result.entries) {
    const timestamp = formatTimestamp(entry.from);
    console.log(`[${timestamp}] ${entry.content}`);
  }

  console.error(`\n完成，共 ${result.entries.length} 条字幕。`);
}

// Export functions for testing
export {
  extractBvid,
  formatTimestamp,
  parseSrt,
  pickSubtitleFile,
  getChromeStartCommand,
};

// Only run main when executed directly (not imported). Resolve symlinks so this
// also works when invoked through the npm bin symlink (`bilibili-transcript`).
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return (
      import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
    );
  } catch {
    return false;
  }
}

if (isMainModule()) {
  if (!videoInput) {
    console.error("用法: node transcript.js <bvid-or-url>");
    console.error("示例: node transcript.js BV13nwdzPEoR");
    console.error(
      "示例: node transcript.js https://www.bilibili.com/video/BV13nwdzPEoR"
    );
    console.error("");
    console.error("策略: yt-dlp（优先，带浏览器 Cookie） → Chrome CDP（兜底）");
    process.exit(1);
  }

  try {
    await main();
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}
