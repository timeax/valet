// src/csr/run-config.ts
import fs from "fs/promises";
import path from "path";
import postcss, { Root } from "postcss";
import { generateMediaQueries } from "../media";
import { mergeThemeCss } from "../utils/theme-merge";
import { writeTailwindThemes } from "./tailwind-support";
import { prettyCss } from "../utils/pretty";

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
      const mod = await import(path.isAbsolute(extra) ? extra : path.resolve(process.cwd(), extra));
      return (mod.default ?? mod) as any;
   }
   return extra as any;
}

/**
 * Build CSS blocks for "extra" theme tokens (fonts, radius, etc.)
 * Rules:
 *  - key "default" => omit suffix (e.g., --radius, --font)
 *  - "#suffix"     => promote to :root and @theme uses var(--...)
 *  - "--<theme>-suffix" (known theme) => .<theme> override; also @theme uses var(--...)
 *  - unknown theme prefixes keep the raw name (no stripping) and are literals in @theme
 */
function buildExtrasCss(
   extra: Record<string, Record<string, string>>,
   themeKeys: string[] = []
): string {
   const root: string[] = [];
   const themes: Record<string, string[]> = {};
   const atTheme: string[] = [];
   const themeSet = new Set(themeKeys);

   for (const group of Object.keys(extra)) {
      const entries = extra[group]; // e.g. { default: '...', lg: '...', '#sm': '...', '--dark-lg': '...' }

      for (const rawKey of Object.keys(entries)) {
         const val = entries[rawKey];

         // Themed override like --dark-lg
         if (rawKey.startsWith("--") && rawKey.includes("-")) {
            const after = rawKey.slice(2); // "dark-lg"
            const dash = after.indexOf("-");
            if (dash > 0) {
               const theme = after.slice(0, dash);
               const suffix = after.slice(dash + 1); // "lg" or "default"
               const name = suffix === "default" ? `--${group}` : `--${group}-${suffix}`;
               if (themeSet.has(theme)) {
                  (themes[theme] ||= []).push(`${name}: ${val};`);
                  // ensure alias present (var-backed)
                  atTheme.push(`--${group}${suffix === "default" ? "" : `-${suffix}`}: var(${name});`);
               } else {
                  // unknown theme → keep raw in name (no stripping)
                  const kept = `--${group}-${rawKey}`;
                  atTheme.push(`${kept}: ${val};`);
               }
               continue;
            }
         }

         // non-themed
         const isRootFlag = rawKey.startsWith("#");
         const key = isRootFlag ? rawKey.slice(1) : rawKey;
         const name = key === "default" ? `--${group}` : `--${group}-${key}`;

         if (isRootFlag) root.push(`${name}: ${val};`);

         // @theme alias: var(...) if promoted, else literal
         const themeName = `--${group}${key === "default" ? "" : `-${key}`}`;
         if (isRootFlag) {
            atTheme.push(`${themeName}: var(${name});`);
         } else {
            atTheme.push(`${themeName}: ${val};`);
         }
      }
   }

   const blocks: string[] = [];
   if (root.length) blocks.push(`:root {\n  ${root.join("\n  ")}\n}`);
   for (const t of Object.keys(themes)) {
      blocks.push(`.${t} {\n  ${themes[t].join("\n  ")}\n}`);
   }
   if (atTheme.length) blocks.push(`@theme {\n  ${atTheme.join("\n  ")}\n}`);
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