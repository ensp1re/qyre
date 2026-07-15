#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const stylesPath = resolve(root, "apps/web/src/app/styles/index.css");
const sourceRoots = [resolve(root, "apps/web/src"), resolve(root, "packages/ui/src")];
const solidSurfaces = [
  "background",
  "card",
  "popover",
  "secondary",
  "muted",
  "accent",
  "sidebar",
  "sidebar-accent"
];
const minimumContrast = 4.5;
const foregroundTokens = ["muted-foreground", "quiet-foreground"];
const accentTokens = ["c-green", "c-amber", "c-purple", "c-blue", "c-red"];
const errors = [];

for (const sourceRoot of sourceRoots) {
  for (const path of filesUnder(sourceRoot)) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/(?:[\w-]+:)*text-muted-foreground\/\d+/g)) {
      const line = source.slice(0, match.index).split("\n").length;
      errors.push(
        `${relative(root, path)}:${line}: use text-quiet-foreground instead of opacity-modified muted text.`
      );
    }
  }
}

const styles = readFileSync(stylesPath, "utf8");
for (const [theme, block] of [
  ["light", cssBlock(styles, ":root")],
  ["dark", cssBlock(styles, ".dark")]
]) {
  for (const token of foregroundTokens) {
    const foreground = rgbVariable(block, token, theme);
    validateTokenContrast(theme, token, foreground, block);
  }
  for (const token of accentTokens) {
    const foreground = hexVariable(block, token, theme);
    validateTokenContrast(theme, token, foreground, block);
  }

  function validateTokenContrast(themeName, token, foreground, themeBlock) {
    for (const surface of solidSurfaces) {
      const background = rgbVariable(themeBlock, surface, themeName);
      const ratio = contrastRatio(foreground, background);
      if (ratio < minimumContrast) {
        errors.push(
          `${themeName} ${token} contrast on ${surface} is ${ratio.toFixed(2)}:1; expected at least ${minimumContrast}:1.`
        );
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Color contrast validation failed:\n");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log("Color contrast OK: semantic foregrounds are WCAG AA on every documented surface.");

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Missing ${selector} token block in ${relative(root, stylesPath)}.`);
  return match[1];
}

function rgbVariable(block, name, theme) {
  const match = block.match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+);`));
  if (!match) throw new Error(`Missing --${name} RGB triplet in the ${theme} token block.`);
  return match.slice(1).map(Number);
}

function hexVariable(block, name, theme) {
  const match = block.match(new RegExp(`--${name}:\\s*#([0-9a-f]{6});`, "i"));
  if (!match) throw new Error(`Missing --${name} hex color in the ${theme} token block.`);
  return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16));
}

function contrastRatio(first, second) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (left, right) => right - left
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(rgb) {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return [".ts", ".tsx"].includes(extname(path)) ? [path] : [];
  });
}
