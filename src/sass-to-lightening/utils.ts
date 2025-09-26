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

/** Pragmatic top-level block reorder: @forward → @use → @import → others */
export function reorderScssBlocks(config: Config, scss: string): string {
   if (config.reorder === 'off') return scss;

   const lines = scss.split(/\r?\n/);
   const forwards: string[] = [];
   const uses: string[] = [];
   const imports: string[] = [];
   const others: string[] = [];

   let buf: string[] = [];
   let inAt = false;
   let type: 'forward' | 'use' | 'import' | null = null;

   const flush = () => {
      if (!buf.length) return;
      const chunk = buf.join('\n');
      if (type === 'forward') forwards.push(chunk);
      else if (type === 'use') uses.push(chunk);
      else if (type === 'import') imports.push(chunk);
      else others.push(chunk);
      buf = [];
      inAt = false;
      type = null;
   };

   for (const line of lines) {
      const t = line.trim();
      const isForward = /^@forward\b/.test(t);
      const isUse = /^@use\b/.test(t);
      const isImport = /^@import\b/.test(t);

      if (!inAt && (isForward || isUse || isImport)) {
         flush();
         inAt = true;
         type = isForward ? 'forward' : isUse ? 'use' : 'import';
         buf.push(line);
         if (t.endsWith(';')) flush();
         continue;
      }
      if (inAt) {
         buf.push(line);
         if (t.endsWith(';')) flush();
      } else {
         others.push(line);
      }
   }
   flush();

   return [forwards, uses, imports, others].map(b => b.join('\n')).filter(Boolean).join('\n');
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