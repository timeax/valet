#!/usr/bin/env ts-node

import sass from 'sass';
import { Fs } from '@timeax/utilities';
import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { Command } from 'commander';
import browserslist from 'browserslist';
import { pathToFileURL } from 'url';

// —————————————————————————————————————————————————————
// Lightning CSS (optional) + default targets via Browserslist
let lightningCss: any = null;
let defaultTargets: Record<string, number> = {}; // filled after init

const log = (message: string) => `${message}`;

// —————————————————————————————————————————————————————
// Config
interface Config {
   source: string;
   out: string;
   additionalData: string;
   targets: { [browser: string]: number } | undefined;
   minify: boolean;
   lightningCss: boolean;
   ignore: string[]; // files/folders/patterns to ignore

   // extras (optional)
   root?: string;              // defaults to source
   beaconPrefix?: string;      // defaults to '&'
   reorder?: 'on' | 'off';     // import/order normalization
}

const config: Config = {
   //@ts-ignore
   $schema: 'https://gist.githubusercontent.com/timeax/f37af1fbe0de58a5a165d6f527e4ebc2/raw/c6f6422e5e9934a707c376820ba16b03d5d61760/scss-to-lightening.json',
   source: './scss',
   out: './dist',
   additionalData: `
    $primary: #3498db;
    $secondary: #2ecc71;
  `,
   targets: undefined, // will be filled from browserslist if undefined
   minify: false,
   lightningCss: true,
   ignore: ['_*.scss', 'ignore.scss', 'ignored-folder/'],

   // extras defaults (filled below)
   root: undefined,
   beaconPrefix: undefined,
   reorder: undefined,
};

// Ensure output folder exists
if (!fs.existsSync(config.out)) fs.mkdirSync(config.out, { recursive: true });

// —————————————————————————————————————————————————————
// Lightning CSS init
const initializeLightningCss = async () => {
   try {
      lightningCss = await import('lightningcss');
      const { browserslistToTargets } = lightningCss;

      // Build sensible defaults (>= 0.25% market share)
      defaultTargets = browserslistToTargets(browserslist('>= 0.25%'));

      // If user didn’t provide targets, adopt defaults
      if (!config.targets || Object.keys(config.targets).length === 0) {
         config.targets = defaultTargets;
      }
   } catch (error: any) {
      console.error(log(`❌ Error initializing Lightning CSS: ${error.message}`));
      console.warn(log('⚠️ Lightning CSS not found. Skipping optimization...'));
   }
};

// —————————————————————————————————————————————————————
// Helpers
const toPosix = (p: string) => p.split(path.sep).join('/');

// Wildcard-aware ignore check
const isIgnored = (file: string): boolean => {
   const fullPath = path.join(config.source, file);

   return config.ignore.some((pattern) => {
      if (pattern.endsWith('/')) {
         // folder match
         return fullPath.startsWith(path.join(config.source, pattern));
      }
      if (pattern.includes('*')) {
         // Convert wildcard to regex
         const regexPattern = '^' + pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
         const re = new RegExp(regexPattern);
         return re.test(file) || re.test(fullPath);
      }
      // direct file match
      return file === pattern || fullPath.endsWith(pattern);
   });
};

// —————————————————————————————————————————————————————
// Beacon + order utilities

// Defaults for extras
config.root ??= config.source;
config.beaconPrefix ??= '&';
config.reorder ??= 'on';

/**
 * Replace &<...> beacons with a path relative to config.root from the current file dir.
 * Examples (file: scss/components/button/_base.scss, root: scss)
 *   @use "&<tokens/colors>"      → @use "../../tokens/colors"
 *   url("&<assets/icon.svg>")    → url("../../assets/icon.svg")
 *   \&<tokens/colors>            → &<tokens/colors>   (escaped)
 */
function resolveBeaconPaths(scss: string, fileDir: string): string {
   const rootAbs = path.resolve(config.root!);
   let relToRoot = path.relative(fileDir, rootAbs) || '.';
   relToRoot = toPosix(relToRoot);

   const prefix = config.beaconPrefix!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape for regex
   const re = new RegExp(`(?<!\\\\)${prefix}<([^>]+)>`, 'g'); // unescaped &<...>

   const replaced = scss.replace(re, (_m, subpath: string) => {
      const cleaned = subpath.replace(/^\/+/, '');
      return `${relToRoot}/${cleaned}`.replace(/\/{2,}/g, '/');
   });

   // unescape \&<...> that we intentionally skipped
   return replaced.replace(new RegExp(`\\\\${prefix}<`, 'g'), `${config.beaconPrefix}<`);
}

/**
 * Reorder blocks pragmatically so Sass rules are respected even with injected globals.
 * Order: @forward → @use → @import → others
 */
function reorderScssBlocks(scss: string): string {
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

   return [forwards, uses, imports, others]
      .map(blocks => blocks.join('\n'))
      .filter(Boolean)
      .join('\n');
}

/**
 * Build source for a given file:
 * - prepend additionalData
 * - resolve &<...> beacons
 * - reorder blocks
 * - return compile options (url + loadPaths)
 */
async function buildScssForFile(
   scssPath: string,
   raw: string
): Promise<{ code: string; url: URL; loadPaths: string[] }> {
   const fileDir = path.dirname(scssPath);

   let merged = (config.additionalData ?? '') + '\n' + raw;
   merged = resolveBeaconPaths(merged, fileDir);
   merged = reorderScssBlocks(merged);

   const url = pathToFileURL(scssPath);
   const loadPaths = [
      fileDir,                     // current file’s folder (enables relative @use/@import)
      path.resolve(config.source), // project scss root
      path.resolve('node_modules') // optional: package-style loads
   ];

   return { code: merged, url, loadPaths };
}

// —————————————————————————————————————————————————————
// Core pipeline
const processFile = async (file: string): Promise<void> => {
   if (isIgnored(file)) {
      console.log(log(`🚫 Ignoring ${file}`));
      return;
   }

   const scssPath = path.join(config.source, file);
   const outputCssPath = path.join(config.out, file.replace(/\.scss$/, '.css'));

   console.log(log(`🔄 Processing ${file}...`));

   try {
      const raw = fs.readFileSync(scssPath, 'utf-8');
      const { code, url, loadPaths } = await buildScssForFile(scssPath, raw);

      const compiled = await sass.compileStringAsync(code, {
         url,
         loadPaths,
         sourceMap: false,
         silenceDeprecations: ['call-string'],
      });

      let finalCss = compiled.css;

      if (config.lightningCss && lightningCss) {
         const { transform } = lightningCss;
         const result = transform({
            code: Buffer.from(finalCss),
            minify: config.minify,
            targets: config.targets!,
         });
         finalCss = Buffer.from(result.code).toString();
      }

      Fs.createPath(outputCssPath, { content: finalCss });
      console.log(
         log(
            `✅ Processed: ${outputCssPath} (Minify: ${config.minify}, Lightning CSS: ${config.lightningCss})`
         )
      );
   } catch (error: any) {
      console.error(log(`❌ Error processing ${file}: ${error.message}\n${error.stderr?.toString() || ''}`));
   }
};

const getAllScssFiles = (dir: string): string[] => {
   let results: string[] = [];

   if (!fs.existsSync(dir)) return results;

   const list = fs.readdirSync(dir);
   for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
         results = results.concat(getAllScssFiles(fullPath)); // recurse
      } else if (file.endsWith('.scss')) {
         results.push(path.relative(config.source, fullPath)); // store relative
      }
   }

   return results;
};

const processAllFiles = async (init = true): Promise<void> => {
   console.log(log('🔄 Processing all SCSS files...'));

   if (!fs.existsSync(config.source)) {
      console.error(log(`❌ SCSS source folder "${config.source}" does not exist.`));
      return;
   }

   const scssFiles = getAllScssFiles(config.source).filter((file) => !isIgnored(file));
   await Promise.all(scssFiles.map(processFile));

   console.log(log(init ? '🎉 Initial compilation complete!' : '🎉 Recompilation complete!'));
};

// —————————————————————————————————————————————————————
// Watcher
let processingQueue = new Set<string>();
let debounceTimeout: NodeJS.Timeout | null = null;

const watchFiles = () => {
   if (!config?.source) {
      console.error('❌ Error: config.source is undefined or invalid.');
      return;
   }

   const watcher = chokidar.watch(config.source, { ignoreInitial: true });

   watcher.on('all', (event, filePath) => {
      const file = path.relative(config.source, filePath);

      if (file.endsWith('.scss') && !isIgnored(file)) {
         if (event === 'add' || event === 'change') {
            const fileName = path.basename(file);

            if (fileName.startsWith('_')) {
               console.log(`⚠️ Partial changed: ${file} → recompiling all (dependency unknown)`);
               processAllFiles(false);
               return;
            }

            processingQueue.add(file);

            if (debounceTimeout) clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
               const queue = Array.from(processingQueue);
               processingQueue.clear();
               Promise.all(queue.map(processFile)).catch(() => { });
            }, 200);
         } else if (event === 'unlink') {
            console.log(`🗑️ File removed: ${file}`);
            processAllFiles(false);
         }
      }
   });

   watcher.on('error', (error) => {
      console.error(`Watcher error: ${error.message}`);
   });

   console.log(log('👀 Watching for SCSS changes...'));
};

// —————————————————————————————————————————————————————
// Config loader
const loadConfig = (configPath: string): boolean => {
   if (fs.existsSync(configPath)) {
      try {
         const rawData = fs.readFileSync(configPath, 'utf-8');
         const loadedConfig = JSON.parse(rawData);

         // Resolve paths relative to the config file's directory
         const configDir = path.dirname(
            // Fs.fPath resolves relative roots; fall back to raw path if not relative
            (Fs as any).isRelative?.(configPath) ? (Fs as any).fPath(configPath, process.cwd()) : configPath
         );

         if (loadedConfig.source) loadedConfig.source = path.resolve(configDir, loadedConfig.source);
         if (loadedConfig.out) loadedConfig.out = path.resolve(configDir, loadedConfig.out);

         Object.assign(config, loadedConfig);

         // Ensure extras defaults after merge
         config.root ??= config.source;
         config.beaconPrefix ??= '&';
         config.reorder ??= 'on';

         console.log(log(`✅ Loaded config from ${configPath}`));
         return true;
      } catch (error: any) {
         console.error(log(`❌ Failed to parse ${configPath}: ${error.message}`));
      }
   }
   return false;
};

// —————————————————————————————————————————————————————
// Entrypoints
const start = async (configPath: string | undefined, options: { watch?: boolean }) => {
   if (configPath) {
      loadConfig(configPath);
   } else {
      loadConfig(path.join(process.cwd(), 'scss.config.json'));
   }

   await initializeLightningCss();
   await processAllFiles();

   if (options.watch) {
      watchFiles();
   }
};

const createConfig = () => {
   const configFilePath = path.join(process.cwd(), 'scss.config.json');

   if (fs.existsSync(configFilePath)) {
      console.log(log('⚠️ scss.config.json already exists. Overwrite? (y/N)'));
      process.stdin.once('data', (data) => {
         if (data.toString().trim().toLowerCase() === 'y') {
            fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
            console.log(log(`✅ Overwritten config file at ${configFilePath}`));
         } else {
            console.log(log('🚫 Aborted. Existing config preserved.'));
         }
         process.exit();
      });
   } else {
      fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
      console.log(log(`✅ Created default config file at ${configFilePath}`));
   }
};

// —————————————————————————————————————————————————————
// CLI registration
export function createSassCompilerCommand(program: Command) {
   program
      .command('scss')
      .argument('[config]', 'Path to config file (optional)')
      .description('Compile SCSS to CSS (with optional Lightning CSS optimization)')
      .option('-w, --watch', 'Watch for changes and recompile automatically')
      .action(start);

   program
      .command('scss-init')
      .description('Create a scss.config.json file')
      .action(createConfig);
}