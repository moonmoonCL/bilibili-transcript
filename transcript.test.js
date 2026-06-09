import { describe, it, expect } from "vitest";
import { extractBvid, formatTimestamp, parseSrt } from "./transcript.js";

describe("extractBvid", () => {
  it("should extract BVID from URL", () => {
    const url = "https://www.bilibili.com/video/BV13nwdzPEoR/";
    expect(extractBvid(url)).toBe("BV13nwdzPEoR");
  });

  it("should extract BVID from raw BVID string", () => {
    expect(extractBvid("BV13nwdzPEoR")).toBe("BV13nwdzPEoR");
  });

  it("should extract BVID with lowercase", () => {
    expect(extractBvid("bv13nwdzpeor")).toBe("bv13nwdzpeor");
  });

  it("should return null for invalid input", () => {
    expect(extractBvid("hello world")).toBeNull();
    expect(extractBvid("12345")).toBeNull();
    expect(extractBvid("")).toBeNull();
  });
});

describe("formatTimestamp", () => {
  it("should format seconds to M:SS", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(5)).toBe("0:05");
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(599)).toBe("9:59");
  });

  it("should format seconds to H:MM:SS", () => {
    expect(formatTimestamp(3600)).toBe("1:00:00");
    expect(formatTimestamp(3661)).toBe("1:01:01");
    expect(formatTimestamp(7200)).toBe("2:00:00");
  });

  it("should pad minutes and seconds with zeros", () => {
    expect(formatTimestamp(61)).toBe("1:01");
    expect(formatTimestamp(3601)).toBe("1:00:01");
  });
});

describe("parseSrt", () => {
  it("should parse SRT content correctly", () => {
    const srt = `1
00:00:01,440 --> 00:00:03,580
Hello World

2
00:00:05,000 --> 00:00:07,000
This is a test`;

    const entries = parseSrt(srt);
    expect(entries).toHaveLength(2);
    expect(entries[0].content).toBe("Hello World");
    expect(entries[0].from).toBeCloseTo(1.44, 2);
    expect(entries[1].content).toBe("This is a test");
    expect(entries[1].from).toBeCloseTo(5.0, 2);
  });

  it("should handle multi-line subtitles", () => {
    const srt = `1
00:00:01,000 --> 00:00:03,000
Line 1
Line 2
Line 3`;

    const entries = parseSrt(srt);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe("Line 1\nLine 2\nLine 3");
  });

  it("should return empty array for invalid SRT", () => {
    expect(parseSrt("")).toHaveLength(0);
    expect(parseSrt("invalid content")).toHaveLength(0);
  });

  it("should skip malformed blocks", () => {
    const srt = `1
00:00:01,000 --> 00:00:03,000
Valid entry

2
Invalid timestamp
Another line`;

    const entries = parseSrt(srt);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe("Valid entry");
  });
});
