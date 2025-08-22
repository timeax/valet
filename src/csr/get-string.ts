// src/csr/get-string.ts
import { Fs } from "@timeax/utilities";
import { extractUsesAndClean, renderUseStatements } from "../utils/sass-uses";

/**
 * Generates a string of Sass code that includes the provided raw code,
 * injects helper functions, and sets up theme keys.
 *
 * @param {string} rawCode - The raw Sass code to be processed.
 * @param {string} [colorsVar="$colors"] - The variable name for colors.
 * @param {string[]} [themeKeys=[]] - An array of theme keys to be included.
 * @returns {string} The complete Sass code as a string.
 */

export function getString(
  rawCode: string,
  colorsVar: string = "$colors",
  themeKeys: string[] = []
) {
  const themeList = `(${themeKeys.map(k => `'${k}'`).join(", ")})`;
  const { code, uses } = extractUsesAndClean(rawCode);
  const template = Fs.content(Fs.join(__dirname, "../../stubs/theme.scss"));
  return `
// ===== injected helpers (module API; no global built-ins) =====
${renderUseStatements(uses)}

$s_theme_keys: ${themeList} !default;
// template
${template}
// ===== user content =====
${code}

// ===== emit blocks =====
@include s_walk_colors(${colorsVar});
`;

}