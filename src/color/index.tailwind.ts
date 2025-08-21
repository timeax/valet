// src/color/index.tailwind.ts  (or add to src/color/index.ts and export it)

import fs from "fs/promises";
import path from "path";
import { writeTailwindThemes } from "./tailwind-support";
import { compile, extractColors, save } from "./sass";

/**
 * Tailwind-focused config runner:
 * - Merges fresh theme CSS into outFile via writeTailwindThemes (uses your exact signature)
 * - Then regenerates the SCSS variables file (legacy writer) from the compiled theme (@theme → --color-*)
 *
 * Leaves the original `colorConfig` untouched.
 */
export async function colorConfigWithTailwindMerge(config: Config) {
   if (!config.colors?.source) {
      throw new Error("No color source provided in the config.");
   }
   if (!config.outFile) {
      throw new Error("No outFile specified. Tailwind merge needs a target CSS file.");
   }

   const source = config.colors.source;
   const scssOut = config.colors.scss;

   // We only support SCSS sources for Tailwind theming (getString rules live in SCSS).
   if (!/\.scss$/i.test(source)) {
      console.warn("[colorConfigWithTailwindMerge] Non-SCSS source; falling back to SCSS writer only.");
      return {};
   }

   try {
      // 1) Read the SCSS content
      const scssContent = await fs.readFile(path.resolve(source), "utf-8");

      // 2) (Optional) expose theme keys for your writeTailwindThemes implementation
      //    Your writeTailwindThemes reads (global as any).__themeKeys internally.
      const prev = (global as any).__themeKeys;
      (global as any).__themeKeys = (config.colors as any).themeKeys ?? [];

      try {
         // 3) Merge @theme/:root/.<theme> blocks into outFile (safe, property-level)
         await writeTailwindThemes(config.outFile, scssContent);
      } finally {
         (global as any).__themeKeys = prev;
      }

      // 4) Recompile to get the fresh @theme CSS and extract the color map for SCSS variables
      //    (Yes, this compiles again; simplest way without changing your writeTailwindThemes signature.)
      const { themeCss } = await compile(scssContent);
      const colors = extractColors(themeCss) || {};

      // 5) Keep the SCSS output (legacy writer). Pass `true` so it writes var(--color-...) references.
      if (scssOut) {
         await (save as any)(scssOut, colors, "scss", /*useTailwind*/ true, /*useRoots*/ true);
      }

      return colors;
   } catch (error) {
      console.error("Error processing colors (Tailwind merge):", error);
      return {};
   }
}