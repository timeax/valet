// src/csr/run-config.ts
import fs from "fs/promises";
import path from "path";
import postcss, { Root } from "postcss";
import { generateMediaQueries } from "../media";
import { mergeThemeCss } from "../utils/theme-merge";
import { writeTailwindThemes } from "./tailwind-support";
import { prettyCss } from "../utils/pretty";
import { pathToFileURL } from "url";

// ---- types & helpers you already had ----
type ScopeMap = Map<string, Map<string, string>>; // scope -> (prop -> value)
const SCOPE_THEME = "@theme";
const SCOPE_ROOT = ":root";

function collect(css: string): ScopeMap {
   const root: Root = postcss.parse(css || "");
   const out: ScopeMap = new Map();

   // @theme
   root.walkAtRules("theme", (at) => {
      const map = out.get(SCOPE_THEME) ?? new Map();
      at.walkDecls((d) => {
         if (d.prop?.startsWith("--")) map.set(d.prop.trim(), (d.value ?? "").trim());
      });
      out.set(SCOPE_THEME, map);
   });

   // :root and simple single selectors (e.g., ".dark")
   root.walkRules((rule) => {
      const sel = rule.selector?.trim();
      if (!sel || (sel !== SCOPE_ROOT && !/^[.#\[\]:][^,]+$/.test(sel))) return;
      const map = out.get(sel) ?? new Map();
      rule.walkDecls((d) => {
         if (d.prop?.startsWith("--")) map.set(d.prop.trim(), (d.value ?? "").trim());
      });
      out.set(sel, map);
   });

   return out;
}

function emit(scopes: ScopeMap): string {
   const chunks: string[] = [];

   // :root first
   const rootMap = scopes.get(SCOPE_ROOT);
   if (rootMap && rootMap.size) {
      chunks.push(`:root {\n  ${[...rootMap].map(([p, v]) => `${p}: ${v};`).join("\n  ")}\n}`);
   }

   // theme classes (anything that isn't :root or @theme)
   for (const [scope, map] of scopes) {
      if (scope === SCOPE_ROOT || scope === SCOPE_THEME) continue;
      if (!map.size) continue;
      chunks.push(`${scope} {\n  ${[...map].map(([p, v]) => `${p}: ${v};`).join("\n  ")}\n}`);
   }

   // @theme (single consolidated block)
   const themeMap = scopes.get(SCOPE_THEME);
   if (themeMap && themeMap.size) {
      chunks.push(`@theme {\n  ${[...themeMap].map(([p, v]) => `${p}: ${v};`).join("\n  ")}\n}`);
   }

   return chunks.join("\n\n");
}

/** extras override colors (last-wins) */
export function combineIncomingSnapshots(colorsCss: string, extrasCss: string): string {
   if (!colorsCss && !extrasCss) return "";
   if (!colorsCss) return extrasCss;
   if (!extrasCss) return colorsCss;

   const a = collect(colorsCss);
   const b = collect(extrasCss);

   // merge: start with colors, overlay extras (last-wins)
   const scopes = new Map<string, Map<string, string>>();
   const allScopes = new Set<string>([...a.keys(), ...b.keys()]);
   for (const s of allScopes) {
      const merged = new Map<string, string>();
      const aMap = a.get(s);
      const bMap = b.get(s);
      if (aMap) for (const [k, v] of aMap) merged.set(k, v);
      if (bMap) for (const [k, v] of bMap) merged.set(k, v); // extras override
      scopes.set(s, merged);
   }

   return emit(scopes); // => single :root, single @theme, etc.
}

// --- helpers ----------------------------------------------------

async function loadExtra(extra: Config["extra"]): Promise<Record<string, Record<string, string>> | null> {
   if (!extra) return null;

   if (typeof extra === "string") {
      // Resolve to absolute filesystem path
      const abs = path.isAbsolute(extra) ? extra : path.resolve(process.cwd(), extra);

      // Convert to file:// URL for ESM import (Windows-safe)
      const url = pathToFileURL(abs).href;

      const mod = await import(url);
      return (mod as any).default ?? (mod as any);
   }

   return extra as any;
}

function normalizeCssValue(input: unknown): string {
   if (input == null) return "";
   let s = String(input).trim();

   // Force raw: leading '@' means "do not keep wrapper quotes"
   let forceRaw = false;
   if (s.startsWith("@")) {
      forceRaw = true;
      s = s.slice(1).trim();
   }

   const isWrapped = (q: '"' | "'") => s.length >= 2 && s.startsWith(q) && s.endsWith(q);
   const stripOuterQuotes = () => s.slice(1, -1);

   // If forced raw, drop one pair of outer quotes if present
   if (forceRaw) {
      if (isWrapped('"') || isWrapped("'")) s = stripOuterQuotes();
      return s;
   }

   // Heuristic: if the whole value is unnecessarily quoted around a CSS token, unquote it
   const unquoted = (isWrapped('"') || isWrapped("'")) ? stripOuterQuotes() : s;
   const looksRawToken = /^-?(\d+(\.\d+)?([a-z%]+)?|var\(|oklch\(|rgba?\(|hsl[a]?\(|lab\(|lch\(|calc\(|clamp\(|min\(|max\()/i.test(unquoted);

   if ((isWrapped('"') || isWrapped("'")) && looksRawToken) {
      s = unquoted;
   }

   return s;
}

// Deep-nesting aware extras builder
// - Keys can be nested arbitrarily: { group: { a: { b: value } } }
// - "#segment" promotes that branch to :root
// - "--<theme>-suffix" (leaf) writes a .<theme> override for known themes
// - "default" suffix is omitted from the var name
// - Unknown theme keys keep their raw name in @theme to avoid collisions
// - At the end, if a var has a known themed override OR was promoted, @theme maps it to var(--name), else literal
//
export function buildExtrasCss(
   extra: Record<string, any>,
   themeKeys: string[] = []
): string {
   const themeSet = new Set(themeKeys);

   // State we collect
   const rootVars = new Map<string, string>();                   // --name -> value
   const baseVars = new Map<string, string>();                   // --name -> value (for @theme)
   const themedOverrides: Record<string, Map<string, string>> = {}; // theme -> (--name -> value)
   const hasKnownThemeOverride = new Set<string>();              // --name set
   const promotedNames = new Set<string>();                      // --name set

   // helpers
   const join = (parts: string[]) => parts.filter(Boolean).join("-");
   const varName = (group: string, segs: string[]) =>
      `--${group}${segs.length ? `-${join(segs)}` : ""}`;

   const isPlainObject = (v: any) =>
      v && typeof v === "object" && !Array.isArray(v);

   // record themed override (known themes only)
   function addThemeOverride(theme: string, name: string, value: string) {
      (themedOverrides[theme] ||= new Map()).set(name, value);
      hasKnownThemeOverride.add(name);
   }

   // recursive walker per top-level group
   function walk(
      group: string,
      node: any,
      path: string[] = [],
      promoted: boolean = false
   ) {
      if (!isPlainObject(node)) {
         // leaf at group root (rare): treat as default
         const v = normalizeCssValue(String(node));
         const name = varName(group, []);
         baseVars.set(name, v);
         if (promoted) {
            rootVars.set(name, v);
            promotedNames.add(name);
         }
         return;
      }

      for (const rawKey of Object.keys(node)) {
         const val = node[rawKey];

         // Handle themed override keys at ANY depth: "--dark-<suffix>"
         if (typeof val !== "object" && rawKey.startsWith("--") && rawKey.includes("-")) {
            const after = rawKey.slice(2); // "dark-lg" | "dark-default"
            const dash = after.indexOf("-");
            if (dash > 0) {
               const theme = after.slice(0, dash);
               const suffix = after.slice(dash + 1); // "lg" | "default"
               const finalSegs = [...path, ...(suffix === "default" ? [] : [suffix])];
               const name = varName(group, finalSegs);
               const css = normalizeCssValue(String(val));

               if (themeSet.has(theme)) {
                  addThemeOverride(theme, name, css);
               } else {
                  // Unknown theme → keep raw themed key in the name to avoid collisions
                  const keptName = varName(group, [...path, rawKey]); // rawKey still includes "--theme-..."
                  baseVars.set(keptName, css);
               }
               continue;
            }
         }

         // Check segment promotion with "#"
         let seg = rawKey;
         let segPromote = false;
         if (seg.startsWith("#")) {
            segPromote = true;
            seg = seg.slice(1);
         }

         // Omit "default" from the path
         const nextPath = seg === "default" ? path : [...path, seg];

         if (isPlainObject(val)) {
            // Recurse
            walk(group, val, nextPath, promoted || segPromote);
         } else {
            // Leaf
            const css = normalizeCssValue(String(val));
            const name = varName(group, nextPath);

            // Record base literal
            baseVars.set(name, css);

            // Promotion → :root
            if (promoted || segPromote) {
               rootVars.set(name, css);
               promotedNames.add(name);
            }
         }
      }
   }

   // Traverse each top-level group
   for (const group of Object.keys(extra || {})) {
      walk(group, extra[group], [], false);
   }

   // Decide @theme aliasing vs literal:
   // If a name is promoted OR it has a known themed override → use var(--name)
   const atThemeLines: string[] = [];
   for (const [name, css] of baseVars) {
      if (promotedNames.has(name) || hasKnownThemeOverride.has(name)) {
         atThemeLines.push(`${name}: var(${name});`);
      } else {
         atThemeLines.push(`${name}: ${css};`);
      }
   }

   // Emit blocks
   const blocks: string[] = [];

   // :root
   if (rootVars.size) {
      const lines = Array.from(rootVars.entries()).map(([n, v]) => `${n}: ${v};`);
      blocks.push(`:root {\n  ${lines.join("\n  ")}\n}`);
   }

   // themed overrides
   for (const theme of Object.keys(themedOverrides)) {
      const lines = Array.from(themedOverrides[theme].entries()).map(([n, v]) => `${n}: ${v};`);
      if (lines.length) {
         blocks.push(`.${theme} {\n  ${lines.join("\n  ")}\n}`);
      }
   }

   // @theme
   if (atThemeLines.length) {
      blocks.push(`@theme {\n  ${atThemeLines.join("\n  ")}\n}`);
   }

   return blocks.join("\n\n");
}

// --- main runner ------------------------------------------------

export async function runConfig(config: Config) {
   const outFile = config.outFile;
   if (!outFile) {
      console.warn("[runConfig] No outFile provided; skipping Tailwind theme write.");
      if (config.media) generateMediaQueries(config);
      return;
   }

   // 1) Build colors incoming (pure, no IO)
   let colorsIncomingCss = "";
   if (config.colors?.source) {
      // 1.1) (Optional) expose theme keys for your writeTailwindThemes implementation
      //    Your writeTailwindThemes reads (global as any).__themeKeys internally.
      const prevKeys = (global as any).__themeKeys;
      const prevFmt = (global as any).__colorFormat;
      (global as any).__themeKeys = config.colors?.themeKeys ?? [];
      (global as any).__colorFormat = config.colors?.colorFormat; // 'oklch' | 'rgb' | 'rgba' | 'hex'
      //----
      const scssPath = path.resolve(config.colors.source);
      const scssContent = await fs.readFile(scssPath, "utf-8");

      try {
         colorsIncomingCss = await writeTailwindThemes(outFile, scssContent);
      } finally {
         (global as any).__themeKeys = prevKeys;
         (global as any).__colorFormat = prevFmt;
      }
   }

   // 2) Build extras incoming (pure)
   let extrasIncomingCss = "";
   const extraObj = await loadExtra(config.extra);
   if (extraObj) {
      const themeKeys = config.colors?.themeKeys ?? [];
      extrasIncomingCss = buildExtrasCss(extraObj, themeKeys);
   }

   // 3) Consolidate to a single incoming snapshot (one :root, one @theme, etc.)
   const unifiedIncoming = combineIncomingSnapshots(colorsIncomingCss, extrasIncomingCss);

   // 4) One three-way merge against current & backup
   const backupFile = `${outFile}.theme.backup.css`;
   const [current, backup] = await Promise.all([
      fs.readFile(outFile).then((b) => b.toString()).catch(() => ""),
      fs.readFile(backupFile).then((b) => b.toString()).catch(() => ""),
   ]);

   const { mergedCss, report } = mergeThemeCss(current, backup, unifiedIncoming, {
      preferIncomingOnConflict: false, // keep user edits when they differ from backup
      annotate: false,
      // You can set strictStaleRemoval: true here if desired,
      // now that "incoming" is unified (no risk of extras being missing).
      strictStaleRemoval: true,
   } as any);

   // 5) Pretty + write final and backup snapshot
   const [prettyOut, prettyBackup] = await Promise.all([
      prettyCss(mergedCss, { parser: "css", filepathHint: outFile }),
      prettyCss(unifiedIncoming, { parser: "css", filepathHint: backupFile }),
   ]);

   await fs.writeFile(outFile, prettyOut, "utf-8");
   await fs.writeFile(backupFile, prettyBackup, "utf-8");

   // optional log
   const sum = (k: keyof typeof report) => (report[k] as any[]).length;
   console.log(`[theme-merge] +${sum("added")} ~${sum("updated")} -${sum("removed")} kept:${sum("keptModified")}`);
}