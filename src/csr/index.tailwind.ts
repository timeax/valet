// src/color/index.tailwind.ts  (or add to src/color/index.ts and export it)

import fs from "fs/promises";
import path from "path";
import { writeTailwindThemes } from "./tailwind-support";

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
      const prevKeys = (global as any).__themeKeys;
      const prevFmt = (global as any).__colorFormat;
      (global as any).__themeKeys = config.colors?.themeKeys ?? [];
      (global as any).__colorFormat = config.colors?.colorFormat; // 'oklch' | 'rgb' | 'rgba' | 'hex'
      try {
         const incoming = await writeTailwindThemes(config.outFile, scssContent);
         // ...
      } finally {
         (global as any).__themeKeys = prevKeys;
         (global as any).__colorFormat = prevFmt;
      }
      // return colors;
   } catch (error) {
      console.error("Error processing colors (Tailwind merge):", error);
      return {};
   }
}