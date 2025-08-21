// src/utils/pretty.ts
import * as prettier from "prettier";

let cachedConfig: prettier.Config | null | undefined;

/** Load user's Prettier config once (respects .prettierrc / package.json / overrides). */
async function loadConfig(filePath?: string) {
  if (cachedConfig !== undefined) return cachedConfig;
  try {
    cachedConfig = await prettier.resolveConfig(filePath || process.cwd());
  } catch {
    cachedConfig = null; // fall back to defaults
  }
  return cachedConfig;
}

/** Safe formatter for CSS/SCSS strings. Parser: 'css' | 'scss' (default: 'css') */
export async function prettyCss(
  content: string,
  opts: { parser?: "css" | "scss"; filepathHint?: string } = {}
) {
  const parser = opts.parser ?? "css";
  try {
    const base = (await loadConfig(opts.filepathHint)) ?? {};
    return await prettier.format(content, { ...base, parser, tabWidth: 4, useTabs: true });
  } catch {
    // If Prettier throws (broken snippet etc.), return the original unformatted content
    return content;
  }
}