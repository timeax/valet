// src/utils/theme-merge.ts
import postcss, { AtRule, Declaration, Root, Rule } from "postcss";
import { converter, formatCss } from "culori";

export type MergeReport = {
   added: Array<{ scope: string; prop: string }>;
   updated: Array<{ scope: string; prop: string; from: string; to: string }>;
   removed: Array<{ scope: string; prop: string }>;
   keptModified: Array<{ scope: string; prop: string; current: string; incoming?: string }>;
   conflicts: Array<{ scope: string; prop: string; current: string; backup: string; incoming: string }>;
};

export type MergeOptions = {
   /** prefer new generator value when current diverged from backup (default: true) */
   preferIncomingOnConflict?: boolean;
   /** annotate “keptModified” or conflicts with comments (default: true) */
   annotate?: boolean;
   /** restrict to these scopes; by default we’ll use scopes from backup ∪ incoming */
   allowedScopes?: Set<string>;
   /** if true, remove stale props even if user modified them (default: false) */
   strictStaleRemoval?: boolean;
};

type ScopeMap = Map<string, Map<string, string>>; // scope => (prop => value)

const SCOPE_THEME = "@theme";
const SCOPE_ROOT = ":root";

/** Parse CSS to AST */
function parse(css: string): Root {
   return postcss.parse(css || "");
}

/** Collect scopes (only simple forms we generate): @theme, :root, and 1‑selector Rules (e.g. ".dark") */
function collectScopes(root: Root): ScopeMap {
   const out: ScopeMap = new Map();

   root.walk((node) => {
      if (node.type === "atrule") {
         const at = node as AtRule;
         if (at.name === "theme") {
            const scope = SCOPE_THEME;
            const map = out.get(scope) ?? new Map();
            at.walkDecls((d) => {
               if (d.prop?.startsWith("--")) map.set(d.prop.trim(), (d.value ?? "").trim());
            });
            out.set(scope, map);
         }
      }
      if (node.type === "rule") {
         const rule = node as Rule;
         const sel = rule.selector?.trim();
         if (!sel) return;
         // manage exact :root, or single simple selector (e.g. ".dark")
         if (sel === SCOPE_ROOT || /^[.#\[\]:][^,]+$/.test(sel)) {
            const scope = sel;
            const map = out.get(scope) ?? new Map();
            rule.walkDecls((d) => {
               if (d.prop?.startsWith("--")) map.set(d.prop.trim(), (d.value ?? "").trim());
            });
            out.set(scope, map);
         }
      }
   });

   return out;
}

/** Find nodes for a scope in current AST; create if needed */
function ensureScopeNodes(root: Root, scope: string): (AtRule | Rule)[] {
   const nodes: (AtRule | Rule)[] = [];
   if (scope === SCOPE_THEME) {
      root.walkAtRules("theme", (at) => nodes.push(at) as any);
      if (!nodes.length) {
         const at = new AtRule({ name: "theme" });
         root.append(at);
         nodes.push(at);
      }
      return nodes;
   }
   if (scope === SCOPE_ROOT) {
      root.walkRules(SCOPE_ROOT, (r) => nodes.push(r) as any);
      if (!nodes.length) {
         const r = new Rule({ selector: SCOPE_ROOT });
         root.append(r);
         nodes.push(r);
      }
      return nodes;
   }
   // selector rule like ".dark"
   root.walkRules(scope, (r) => nodes.push(r) as any);
   if (!nodes.length) {
      const r = new Rule({ selector: scope });
      root.append(r);
      nodes.push(r);
   }
   return nodes;
}

/** Get the first declaration node by prop within a set of nodes (scope) */
function findDecl(nodes: (AtRule | Rule)[], prop: string): Declaration | undefined {
   for (const n of nodes) {
      let found: Declaration | undefined;
      n.walkDecls(prop, (d) => {
         if (!found) found = d;
      });
      if (found) return found;
   }
}

/** Insert (or set) a declaration in the first node; create if needed */
function upsertDecl(nodes: (AtRule | Rule)[], prop: string, value: string) {
   const d = findDecl(nodes, prop);
   if (d) {
      d.value = value;
      return;
   }
   const first = nodes[0];
   const decl = new Declaration({ prop, value });
   if (first.type === "atrule") (first as AtRule).append(decl);
   else (first as Rule).append(decl);
}

/* -------------------- semantic value comparison helpers -------------------- */

const toRgbConv = converter("rgb");

/** Normalize value strings to a canonical rgb/rgba string (or collapsed whitespace) for stable comparison */
function normalizeValue(v: string): string {
   const val = (v ?? "").trim();
   if (!val) return "";
   // leave variables/calcs intact; just whitespace-normalize
   if (/var\(/i.test(val) || /calc\(/i.test(val)) return val.replace(/\s+/g, " ");

   try {
      const c = toRgbConv(val); // parse hex, rgb/rgba, hsl, oklch, color(space …), etc.
      if (c) {
         // culori emits rgb()/rgba() depending on alpha; normalize spaces
         return formatCss(c).replace(/\s+/g, " ").trim();
      }
   } catch {
      // ignore parse failures; fall through to whitespace collapse
   }
   return val.replace(/\s+/g, " ");
}

/** Remove decls whose current value matches backup (semantically), or unconditionally in strict mode */
function removeDeclIfValueMatches(
   nodes: (AtRule | Rule)[],
   prop: string,
   backupValue: string,
   opts: MergeOptions
): { removed: number; foundModified?: Declaration } {
   let count = 0;
   let modified: Declaration | undefined;

   const normBackup = normalizeValue(backupValue);

   for (const n of nodes) {
      n.walkDecls(prop, (d) => {
         const curr = (d.value ?? "").trim();
         const normCurr = normalizeValue(curr);

         if (opts.strictStaleRemoval || normCurr === normBackup) {
            d.remove();
            count++;
         } else {
            modified = d; // present but changed vs backup → treat as user-modified
         }
      });
   }
   return { removed: count, foundModified: modified };
}

/* ------------------------------ merge logic -------------------------------- */

/** Property-level three-way merge for one scope */
function mergeScope(
   scope: string,
   currentRoot: Root,
   backupProps: Map<string, string>,
   incomingProps: Map<string, string>,
   report: MergeReport,
   opts: MergeOptions
) {
   const preferIncoming = opts.preferIncomingOnConflict ?? true;
   const nodes = ensureScopeNodes(currentRoot, scope);

   const backupKeys = new Set(backupProps.keys());
   const incomingKeys = new Set(incomingProps.keys());

   // 1) Remove stale props: in backup but not in incoming
   for (const prop of backupKeys) {
      if (!incomingKeys.has(prop)) {
         const backupVal = backupProps.get(prop)!;

         const { removed, foundModified } = removeDeclIfValueMatches(nodes, prop, backupVal, opts);

         if (removed > 0) {
            report.removed.push({ scope, prop });
         } else if (foundModified) {
            // keep if user changed it; optionally annotate as stale
            report.keptModified.push({ scope, prop, current: (foundModified.value ?? "").trim() });
            if (opts.annotate) {
               foundModified.raws.before =
                  (foundModified.raws.before ?? "") + "/* stale but kept (user-modified) */\n";
            }
         }
      }
   }

   // 2) Add new props: in incoming but not in backup
   for (const prop of incomingKeys) {
      if (!backupKeys.has(prop)) {
         const incomingVal = incomingProps.get(prop)!;
         const already = findDecl(nodes, prop);
         if (!already) {
            upsertDecl(nodes, prop, incomingVal);
            report.added.push({ scope, prop });
         } else {
            // exists but wasn’t our prop previously → treat as custom; leave as-is
         }
      }
   }

   // 3) Update existing props: in both
   for (const prop of incomingKeys) {
      if (!backupKeys.has(prop)) continue; // handled above
      const incomingVal = incomingProps.get(prop)!;
      const backupVal = backupProps.get(prop)!;

      const decl = findDecl(nodes, prop);
      if (!decl) {
         // It was previously ours but is missing now in current → re-add incoming
         upsertDecl(nodes, prop, incomingVal);
         report.added.push({ scope, prop });
         continue;
      }

      const currentVal = (decl.value ?? "").trim();

      // quick win: already the right value
      if (normalizeValue(currentVal) === normalizeValue(incomingVal)) continue;

      // user didn't touch it (≈ backup) → safe to update
      if (normalizeValue(currentVal) === normalizeValue(backupVal)) {
         decl.value = incomingVal;
         report.updated.push({ scope, prop, from: backupVal, to: incomingVal });
         continue;
      }

      // conflict: current diverged from backup, and incoming diverges from backup
      if (preferIncoming) {
         report.conflicts.push({ scope, prop, current: currentVal, backup: backupVal, incoming: incomingVal });
         decl.value = incomingVal;
         if (opts.annotate) {
            decl.raws.before = (decl.raws.before ?? "") + "/* overwritten (auto-generated) */\n";
         }
      } else {
         // keep user's change
         report.keptModified.push({ scope, prop, current: currentVal, incoming: incomingVal });
         if (opts.annotate) {
            decl.raws.after = (decl.raws.after ?? "") + " /* kept user change */";
         }
      }
   }
}

/** Main merge entry */
export function mergeThemeCss(
   currentCss: string,
   backupCss: string,
   incomingCss: string,
   options: MergeOptions = {}
): { mergedCss: string; report: MergeReport; scopes: string[] } {
   const report: MergeReport = { added: [], updated: [], removed: [], keptModified: [], conflicts: [] };

   const curRoot = parse(currentCss);
   const bkpRoot = parse(backupCss);
   const incRoot = parse(incomingCss);

   const bScopes = collectScopes(bkpRoot);
   const iScopes = collectScopes(incRoot);

   // which scopes to manage?
   const scopeKeys = new Set<string>([
      ...bScopes.keys(),
      ...iScopes.keys(),
      ...(options.allowedScopes ?? new Set<string>()),
   ]);

   for (const scope of scopeKeys) {
      const bProps = bScopes.get(scope) ?? new Map<string, string>();
      const iProps = iScopes.get(scope) ?? new Map<string, string>();

      // Skip empty scope if both are empty (nothing to manage)
      if (bProps.size === 0 && iProps.size === 0) continue;

      mergeScope(scope, curRoot, bProps, iProps, report, options);
   }

   const mergedCss = curRoot.toResult().css;
   return { mergedCss, report, scopes: Array.from(scopeKeys) };
}