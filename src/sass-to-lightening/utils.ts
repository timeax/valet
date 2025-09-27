// scss/utils.ts

import fs from 'fs';
import path from 'path';
import picomatch from 'picomatch';
import browserslist from 'browserslist';
import { pathToFileURL } from 'url';
import type { BuildResult, Config, Glob } from './types';

export let lightningCss: any = null;
export let DEFAULT_TARGETS: Record<string, number> = {};

export const toPosix = (p: string) => p.split(path.sep).join('/');
export const asArray = <T>(x?: T | T[]) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

/** Glob match helper (relative path). */
export const isMatch = (relPath: string, globs?: Glob) =>
   globs ? picomatch(asArray(globs))(relPath) : false;

/** Normalise config defaults that depend on other fields. */
export function normaliseConfig(config: Config): void {
   config.root ??= config.source;
   config.beaconPrefix ??= '&';
   config.reorder ??= 'on';
}

/** Replace &<...> beacons with path from current file’s dir to config.root */
export function resolveBeaconPaths(config: Config, scss: string, fileDir: string): string {
   const rootAbs = path.resolve(config.root!);
   let relToRoot = path.relative(fileDir, rootAbs) || '.';
   relToRoot = toPosix(relToRoot);

   const prefix = config.beaconPrefix!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
   const re = new RegExp(`(?<!\\\\)${prefix}<([^>]+)>`, 'g');

   const replaced = scss.replace(re, (_m, subpath: string) => {
      const cleaned = subpath.replace(/^\/+/, '');
      return `${relToRoot}/${cleaned}`.replace(/\/{2,}/g, '/');
   });

   // unescape any \&<...> we deliberately skipped
   return replaced.replace(new RegExp(`\\\\${prefix}<`, 'g'), `${config.beaconPrefix}<`);
}

export function containsTailwindDirectives(css: string): boolean {
  return /@tailwind\b|@apply\b|@layer\b|@variants\b|@responsive\b/.test(css);
}

export function reorderScssBlocks(config: Config, scss: string): string {
   if (config.reorder === 'off') return scss;

   // We only touch TOP-LEVEL @forward/@use/@import.
   // Everything else (including @layer blocks, selectors, nested rules) is kept exactly as-is.

   const forwards: string[] = [];
   const uses: string[] = [];
   const imports: string[] = [];

   let i = 0;
   const n = scss.length;
   let depth = 0;           // { } depth
   let chunkStart = 0;      // start of current chunk (for "rest")
   const outPieces: string[] = []; // temporary pieces for "rest" we glue later

   // Utility: capture a range into "rest"
   const pushRest = (start: number, end: number) => {
      if (end > start) outPieces.push(scss.slice(start, end));
   };

   // Utility: from position "pos", if we can read a top-level
   // @forward/@use/@import ending in ';', return [endIndexExclusive, type, text]
   const readTopLevelLoad = (pos: number): [number, 'forward' | 'use' | 'import', string] | null => {
      if (depth !== 0) return null;
      if (scss.charCodeAt(pos) !== 64 /* @ */) return null;

      // quick checks
      if (scss.startsWith('@forward', pos)) {
         const semi = scss.indexOf(';', pos);
         if (semi !== -1) return [semi + 1, 'forward', scss.slice(pos, semi + 1)];
      } else if (scss.startsWith('@use', pos)) {
         const semi = scss.indexOf(';', pos);
         if (semi !== -1) return [semi + 1, 'use', scss.slice(pos, semi + 1)];
      } else if (scss.startsWith('@import', pos)) {
         const semi = scss.indexOf(';', pos);
         if (semi !== -1) return [semi + 1, 'import', scss.slice(pos, semi + 1)];
      }
      return null;
   };

   while (i < n) {
      const ch = scss[i];

      // Track strings/comments so braces inside them don't affect depth.
      if (ch === '"' || ch === `'`) {
         const quote = ch;
         let j = i + 1;
         while (j < n) {
            if (scss[j] === '\\') { j += 2; continue; }
            if (scss[j] === quote) { j++; break; }
            j++;
         }
         i = j;
         continue;
      }
      if (ch === '/' && i + 1 < n) {
         const next = scss[i + 1];
         if (next === '/') {
            // line comment
            let j = i + 2;
            while (j < n && scss[j] !== '\n') j++;
            i = j;
            continue;
         } else if (next === '*') {
            // block comment
            let j = i + 2;
            while (j + 1 < n && !(scss[j] === '*' && scss[j + 1] === '/')) j++;
            i = Math.min(n, j + 2);
            continue;
         }
      }

      // Only consider @use/@forward/@import at top-level (depth == 0)
      if (depth === 0 && scss[i] === '@') {
         const found = readTopLevelLoad(i);
         if (found) {
            const [end, kind, text] = found;

            // First, push everything before this at-rule into "rest"
            pushRest(chunkStart, i);
            chunkStart = end; // start next rest chunk after this at-rule

            // Bucket the at-rule
            if (kind === 'forward') forwards.push(text);
            else if (kind === 'use') uses.push(text);
            else imports.push(text);

            i = end;
            continue;
         }
      }

      // Track braces for depth
      if (ch === '{') depth++;
      else if (ch === '}') depth = Math.max(0, depth - 1);

      i++;
   }

   // Push final trailing rest
   pushRest(chunkStart, n);

   // Stitch rest back exactly as it was
   const restJoined = outPieces.join('');

   // Compose with our ordered top-level loads at the top
   const header = [
      forwards.join('\n'),
      uses.join('\n'),
      imports.join('\n'),
   ].filter(Boolean).join('\n');

   return header ? `${header}\n${restJoined}` : restJoined;
}

/** Compute additionalData for a given file by applying matching rules in order. */
export function getAdditionalForFile(config: Config, absFilePath: string): string {
   const rel = toPosix(path.relative(path.resolve(config.source), absFilePath));

   if (typeof config.additionalData === 'string') {
      return config.additionalData || '';
   }

   const rules = config.additionalData ?? [];
   let out: string[] = [];

   for (const rule of rules) {
      const force = rule.files?.some((f) => toPosix(f) === rel) ?? false;
      if (force) {
         out.push(rule.value);
         continue;
      }
      const included = rule.includes ? isMatch(rel, rule.includes) : true;
      if (!included) continue;

      const excluded = rule.excludes ? isMatch(rel, rule.excludes) : false;
      if (excluded) continue;

      out.push(rule.value);
   }

   return out.filter(Boolean).join('\n');
}

/** Ignore matcher (folders ending with '/', simple '*' wildcards, or direct file). */
export function isIgnored(config: Config, relFile: string): boolean {
   const fullPath = path.join(config.source, relFile);

   return config.ignore.some((pattern) => {
      if (pattern.endsWith('/')) {
         return fullPath.startsWith(path.join(config.source, pattern));
      }
      if (pattern.includes('*')) {
         const regexPattern =
            '^' + pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
         const re = new RegExp(regexPattern);
         return re.test(relFile) || re.test(fullPath);
      }
      return relFile === pattern || fullPath.endsWith(pattern);
   });
}

/** Recursive *.scss collector returning paths relative to config.source */
export function getAllScssFiles(config: Config, dir: string): string[] {
   let results: string[] = [];
   if (!fs.existsSync(dir)) return results;

   for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
         results = results.concat(getAllScssFiles(config, full));
      } else if (name.endsWith('.scss')) {
         results.push(path.relative(config.source, full));
      }
   }
   return results;
}

/** Compute compile inputs for a file */
export function buildScssForFile(config: Config, scssPath: string, raw: string): BuildResult {
   const fileDir = path.dirname(scssPath);

   const addl = getAdditionalForFile(config, scssPath);
   let merged = (addl ? addl + '\n' : '') + raw;

   merged = resolveBeaconPaths(config, merged, fileDir);
   merged = reorderScssBlocks(config, merged);

   const url = pathToFileURL(scssPath);
   const loadPaths = [
      fileDir,
      path.resolve(config.source),
      path.resolve('node_modules'),
   ];

   return { code: merged, url, loadPaths };
}

/** Optional Lightning CSS init + default targets */
export async function initializeLightningCss(config: Config): Promise<void> {
   try {
      lightningCss = await import('lightningcss');
      const { browserslistToTargets } = lightningCss;
      DEFAULT_TARGETS = browserslistToTargets(browserslist('>= 0.25%'));
      if (!config.targets || Object.keys(config.targets).length === 0) {
         config.targets = DEFAULT_TARGETS;
      }
   } catch (e: any) {
      console.error(`❌ Error initializing Lightning CSS: ${e.message}`);
      console.warn('⚠️ Lightning CSS not found. Skipping optimization...');
   }
}