import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..", "..");

/**
 * One font face bundled with @situ/reports-ui. All faces are SIL OFL.
 */
export type ReportFontFace = {
  readonly family: string;
  readonly style: "normal" | "italic";
  readonly weightRange: string;
  readonly absolutePath: string;
};

const fontPath = (relativePath: string): string => join(packageRoot, "node_modules", relativePath);

/**
 * Bundled OFL font faces. The MDX compile pipeline reads these bytes at build time
 * and base64-embeds them as @font-face data URIs so the rendered report needs no
 * network access. Fonts: Source Serif 4 (Adobe, OFL), Inter (rsms, OFL),
 * JetBrains Mono (JetBrains, OFL).
 */
// fallow-ignore-next-line unused-dependencies -- loaded at runtime via readFileSync below.
export const reportFontFaces: readonly ReportFontFace[] = [
  {
    family: "Source Serif 4 Variable",
    style: "normal",
    weightRange: "200 900",
    // fallow-ignore-next-line unused-dependencies -- @fontsource-variable/source-serif-4 read at runtime.
    absolutePath: fontPath(
      "@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2",
    ),
  },
  {
    family: "Source Serif 4 Variable",
    style: "italic",
    weightRange: "200 900",
    // fallow-ignore-next-line unused-dependencies -- @fontsource-variable/source-serif-4 read at runtime.
    absolutePath: fontPath(
      "@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-italic.woff2",
    ),
  },
  {
    family: "Inter Variable",
    style: "normal",
    weightRange: "100 900",
    // fallow-ignore-next-line unused-dependencies -- @fontsource-variable/inter read at runtime.
    absolutePath: fontPath("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"),
  },
  {
    family: "JetBrains Mono Variable",
    style: "normal",
    weightRange: "100 800",
    // fallow-ignore-next-line unused-dependencies -- @fontsource-variable/jetbrains-mono read at runtime.
    absolutePath: fontPath(
      "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
    ),
  },
];

/**
 * Returns a CSS string with @font-face declarations for every bundled face,
 * each embedded as a base64 data URI so the rendered HTML has zero remote
 * font dependencies.
 */
export function buildEmbeddedFontFaceCss(): string {
  return reportFontFaces
    .map((face) => {
      const bytes = readFileSync(face.absolutePath);
      const base64 = bytes.toString("base64");
      return [
        "@font-face {",
        `  font-family: ${JSON.stringify(face.family)};`,
        `  font-style: ${face.style};`,
        `  font-weight: ${face.weightRange};`,
        `  font-display: swap;`,
        `  src: url(data:font/woff2;base64,${base64}) format("woff2-variations");`,
        "}",
      ].join("\n");
    })
    .join("\n\n");
}

/**
 * Returns a CSS string with non-embedded @font-face declarations that point at
 * the absolute paths of the bundled binaries. Useful for Storybook and other
 * local previews where we don't need the report to be self-contained.
 */
export function buildLocalFontFaceCss(): string {
  return reportFontFaces
    .map((face) => {
      return [
        "@font-face {",
        `  font-family: ${JSON.stringify(face.family)};`,
        `  font-style: ${face.style};`,
        `  font-weight: ${face.weightRange};`,
        `  font-display: swap;`,
        `  src: url(file://${face.absolutePath}) format("woff2-variations");`,
        "}",
      ].join("\n");
    })
    .join("\n\n");
}
