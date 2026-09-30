import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = "src";

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(p);
    return p.endsWith(".tsx") && !p.includes(".test.") ? [p] : [];
  });
}

/**
 * Read a JSX opening tag without being fooled by ">" inside quoted attributes
 * or JSX expressions such as onClick={() => ...}.
 */
function openingTags(src: string, name: string): Array<{ tag: string; offset: number }> {
  const out: Array<{ tag: string; offset: number }> = [];
  const needle = `<${name}`;
  let from = 0;
  while (true) {
    const start = src.indexOf(needle, from);
    if (start < 0) break;
    const boundary = src[start + needle.length] ?? "";
    if (/[A-Za-z0-9_.:-]/.test(boundary)) {
      from = start + needle.length;
      continue;
    }
    let quote = "";
    let braceDepth = 0;
    let escaped = false;
    let end = -1;
    for (let i = start + needle.length; i < src.length; i++) {
      const ch = src[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }
      if (ch === "{") {
        braceDepth++;
        continue;
      }
      if (ch === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
        continue;
      }
      if (ch === ">" && braceDepth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0) break;
    out.push({ tag: src.slice(start, end + 1), offset: start });
    from = end + 1;
  }
  return out;
}

function lineOf(src: string, offset: number): number {
  return src.slice(0, offset).split("\n").length;
}

describe("JSX markup safety", () => {
  const files = walk(ROOT);

  it("raw button elements always declare type", () => {
    const bad: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      for (const { tag, offset } of openingTags(src, "button")) {
        if (!/\btype\s*=/.test(tag)) bad.push(`${file}:${lineOf(src, offset)}`);
      }
    }
    expect(bad, 'Use type="button" for actions or type="submit" intentionally.').toEqual([]);
  });

  it("raw img elements always declare alt", () => {
    const bad: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      for (const { tag, offset } of openingTags(src, "img")) {
        if (!/\balt\s*=/.test(tag)) bad.push(`${file}:${lineOf(src, offset)}`);
      }
    }
    expect(bad, 'Every image needs meaningful alt text or alt="" when decorative.').toEqual([]);
  });

  it("target blank links declare rel and placeholder links are absent", () => {
    const badBlank: string[] = [];
    const placeholders: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      for (const { tag, offset } of openingTags(src, "a")) {
        if (/\btarget\s*=\s*["']_blank["']/.test(tag) && !/\brel\s*=/.test(tag)) {
          badBlank.push(`${file}:${lineOf(src, offset)}`);
        }
        if (/\bhref\s*=\s*["']#["']/.test(tag)) placeholders.push(`${file}:${lineOf(src, offset)}`);
      }
      for (const { tag, offset } of openingTags(src, "Link")) {
        if (/\bto\s*=\s*["']#["']/.test(tag)) placeholders.push(`${file}:${lineOf(src, offset)}`);
      }
    }
    expect(badBlank, "target=_blank requires rel to prevent opener access.").toEqual([]);
    expect(placeholders, "Do not ship placeholder # links.").toEqual([]);
  });

  it("does not ship obviously empty click handlers", () => {
    const bad: string[] = [];
    const re = /onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/g;
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      for (const match of src.matchAll(re)) bad.push(`${file}:${lineOf(src, match.index ?? 0)}`);
    }
    expect(bad).toEqual([]);
  });
});
