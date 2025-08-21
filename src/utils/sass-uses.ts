
// src/utils/sass-uses.ts

// Always include these (no duplicates will be produced)
const DEFAULT_USES = [
   `@use "sass:string";`,
   `@use "sass:list";`,
   `@use "sass:map";`,
   `@use "sass:meta";`,
];

/**
 * Extract all @use statements from a Sass/SCSS string and return:
 *  - uses: a Set of normalized @use lines (includes DEFAULT_USES)
 *  - code: the original code with all @use lines removed (and extra blank lines collapsed)
 */
export function extractUsesAndClean(code: string): { uses: Set<string>; code: string } {
   const src = code ?? "";

   // Match whole @use lines (with optional trailing comment), multi-line safe
   // Examples matched:
   //   @use "sass:map";
   //   @use "sass:string" as s;
   //   @use "x" with ($a: 1); // comment
   const useLineRe = /^[ \t]*@use\s+["'][^"']+["'][^;\n]*;?[^\n]*$/gim;

   // Collect matches
   const matches = src.match(useLineRe) || [];

   // Normalize to single-line, trailing semicolon
   const normalize = (s: string) =>
      s
         .trim()
         // keep everything before inline comment, but preserve it if present
         // (remove trailing spaces before ;, ensure exactly one ;)
         .replace(/[ \t]*;?[ \t]*$/, ";");

   const uses = new Set<string>(DEFAULT_USES.map(normalize));
   for (const m of matches) uses.add(normalize(m));

   // Remove all matched lines from code
   const cleaned = src
      .replace(useLineRe, "")            // drop @use lines
      .replace(/[ \t]+\n/g, "\n")        // trim trailing spaces on now-empty lines
      .replace(/\n{3,}/g, "\n\n")        // collapse multiple blank lines
      .trimStart();                      // avoid leading blank

   return { uses, code: cleaned };
}

/** Render a set/array of @use statements as a single block (deduped & normalized). */
export function renderUseStatements(uses: Iterable<string>): string {
   const out = new Set<string>();
   for (const u of uses) {
      const line = String(u).trim();
      if (!line) continue;
      if (!/^@use\b/i.test(line)) continue;
      out.add(line.replace(/[ \t]*;?[ \t]*$/, ";"));
   }
   return Array.from(out).join("\n");
}
