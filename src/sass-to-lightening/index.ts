// scss/index.ts

import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import sass from 'sass';
import { Command } from 'commander';
import { Fs } from '@timeax/utilities';

import type { Config } from './types';
import {
  buildScssForFile,
  containsTailwindDirectives,
  getAllScssFiles,
  initializeLightningCss,
  isIgnored,
  lightningCss,
  normaliseConfig,
} from './utils';

const log = (m: string) => m;

// —— Default config (example) ——
const config: Config = {
  //@ts-ignore
  $schema: 'https://gist.githubusercontent.com/timeax/f37af1fbe0de58a5a165d6f527e4ebc2/raw/7faddcaf7429180cdd6b950a047834b75fde42f1/scss-to-lightening.json',
  source: './scss',
  out: './dist',
  additionalData: [
    {
      value: `$primary: #3498db; $secondary: #2ecc71;`,
      includes: '**/*.scss'
    }
  ],
  targets: undefined,
  minify: false,
  lightningCss: true,
  ignore: ['_*.scss', 'ignore.scss', 'ignored-folder/'],
  root: undefined,
  beaconPrefix: undefined,
  reorder: undefined,
};

// Ensure output dir
if (!fs.existsSync(config.out)) fs.mkdirSync(config.out, { recursive: true });

// —————————————————————————————————————————————————————
// Core pipeline
const processFile = async (relFile: string): Promise<void> => {
  if (isIgnored(config, relFile)) {
    console.log(log(`🚫 Ignoring ${relFile}`));
    return;
  }

  const scssPath = path.join(config.source, relFile);
  const outputCssPath = path.join(config.out, relFile.replace(/\.scss$/, '.css'));

  console.log(log(`🔄 Processing ${relFile}...`));

  try {
    const raw = fs.readFileSync(scssPath, 'utf-8');
    const { code, url, loadPaths } = buildScssForFile(config, scssPath, raw);

    const compiled = await sass.compileStringAsync(code, {
      url,
      loadPaths,
      sourceMap: false,
      silenceDeprecations: ['call-string'],
    });

    let finalCss = compiled.css;

    if (config.lightningCss && lightningCss && !containsTailwindDirectives(finalCss)) {
      const { transform } = lightningCss;
      const result = transform({
        code: Buffer.from(finalCss),
        minify: config.minify,
        targets: config.targets!,
      });
      finalCss = Buffer.from(result.code).toString();
    } else if (config.lightningCss && lightningCss) {
      console.log('ℹ️ Skipping Lightning CSS (Tailwind directives detected).');
    }
    
    Fs.createPath(outputCssPath, { content: finalCss });
    console.log(log(`✅ Processed: ${outputCssPath} (Minify: ${config.minify}, Lightning CSS: ${config.lightningCss})`));
  } catch (error: any) {
    console.error(log(`❌ Error processing ${relFile}: ${error.message}\n${error.stderr?.toString() || ''}`));
  }
};

const processAllFiles = async (init = true): Promise<void> => {
  console.log(log('🔄 Processing all SCSS files...'));

  if (!fs.existsSync(config.source)) {
    console.error(log(`❌ SCSS source folder "${config.source}" does not exist.`));
    return;
  }

  const scssFiles = getAllScssFiles(config, config.source).filter((f) => !isIgnored(config, f));
  await Promise.all(scssFiles.map(processFile));

  console.log(log(init ? '🎉 Initial compilation complete!' : '🎉 Recompilation complete!'));
};

// —————————————————————————————————————————————————————
// Watcher
const watchFiles = (configPath?: string) => {
  if (!config?.source) {
    console.error('❌ Error: config.source is undefined or invalid.');
    return;
  }

  // ——— helper: (re)load config and apply side effects
  const reloadConfig = (why: string) => {
    try {
      if (configPath && fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const loaded = JSON.parse(raw);

        // resolve relative to config file dir
        const cfgDir = path.dirname(configPath);
        if (loaded.source) loaded.source = path.resolve(cfgDir, loaded.source);
        if (loaded.out) loaded.out = path.resolve(cfgDir, loaded.out);

        const prevSource = config.source;

        Object.assign(config, loaded);
        normaliseConfig(config);

        // ensure output dir exists
        if (!fs.existsSync(config.out)) fs.mkdirSync(config.out, { recursive: true });

        // re-init Lightning CSS defaults if targets missing
        if (!config.targets || Object.keys(config.targets).length === 0) {
          // best-effort; ignore failure
          initializeLightningCss(config).catch(() => { });
        }

        console.log(log(`🔁 Config reloaded (${why}).`));

        // if source changed, re-root scss watcher
        if (prevSource !== config.source) {
          console.log(log(`📂 SCSS source changed: "${prevSource}" → "${config.source}"`));
          scssWatcher?.close().catch(() => { });
          scssWatcher = chokidar.watch(config.source, { ignoreInitial: true });
          wireScssWatcher(); // reattach handlers to new watcher
        }

        // rebuild everything on config change
        processAllFiles(false).catch(() => { });
      } else {
        console.warn(log('⚠️ Config file missing; keeping previous config.'));
      }
    } catch (e: any) {
      console.error(log(`❌ Failed to reload config: ${e.message}`));
    }
  };

  // ——— SCSS watcher
  let scssWatcher = chokidar.watch(config.source, { ignoreInitial: true });
  let processingQueue = new Set<string>();
  let debounceTimeout: NodeJS.Timeout | null = null;

  const wireScssWatcher = () => {
    scssWatcher.on('all', (event, filePath) => {
      const rel = path.relative(config.source, filePath);

      if (rel.endsWith('.scss') && !isIgnored(config, rel)) {
        if (event === 'add' || event === 'change') {
          const fileName = path.basename(rel);

          if (fileName.startsWith('_')) {
            console.log(`⚠️ Partial changed: ${rel} → recompiling all (dependency unknown)`);
            processAllFiles(false);
            return;
          }

          processingQueue.add(rel);
          if (debounceTimeout) clearTimeout(debounceTimeout);
          debounceTimeout = setTimeout(() => {
            const queue = Array.from(processingQueue);
            processingQueue.clear();
            Promise.all(queue.map(processFile)).catch(() => { });
          }, 200);
        } else if (event === 'unlink') {
          console.log(`🗑️ File removed: ${rel}`);
          processAllFiles(false);
        }
      }
    });

    scssWatcher.on('error', (error) => {
      console.error(`Watcher error: ${error.message}`);
    });
  };

  wireScssWatcher();

  // ——— Config watcher (optional: only if path provided)
  let cfgWatcher: chokidar.FSWatcher | null = null;
  if (configPath) {
    cfgWatcher = chokidar.watch(configPath, { ignoreInitial: true });

    cfgWatcher.on('change', () => reloadConfig('file changed'));
    cfgWatcher.on('add', () => reloadConfig('file created'));
    cfgWatcher.on('unlink', () => {
      console.warn(log('⚠️ Config file deleted; keeping previous in-memory config.'));
    });

    cfgWatcher.on('error', (error) => {
      console.error(`Config watcher error: ${error.message}`);
    });
  }

  console.log(log('👀 Watching for SCSS changes...'));
  if (configPath) console.log(log(`👀 Watching config: ${configPath}`));
};
// —————————————————————————————————————————————————————
// Config loader
const loadConfig = (configPath: string): boolean => {
  if (fs.existsSync(configPath)) {
    try {
      const rawData = fs.readFileSync(configPath, 'utf-8');
      const loaded = JSON.parse(rawData);

      // Resolve relative to the config file directory
      const cfgDir = path.dirname(configPath);
      if (loaded.source) loaded.source = path.resolve(cfgDir, loaded.source);
      if (loaded.out) loaded.out = path.resolve(cfgDir, loaded.out);

      Object.assign(config, loaded);
      normaliseConfig(config);
      console.log(log(`✅ Loaded config from ${configPath}`));
      return true;
    } catch (e: any) {
      console.error(log(`❌ Failed to parse ${configPath}: ${e.message}`));
    }
  }
  return false;
};

// —————————————————————————————————————————————————————
// Entrypoints
const start = async (configArg: string | undefined, options: { watch?: boolean }) => {
  const resolvedCfg = configArg
    ? path.resolve(process.cwd(), configArg)
    : path.join(process.cwd(), 'scss.config.json');

  loadConfig(resolvedCfg);          // your existing loader
  await initializeLightningCss(config);
  await processAllFiles();

  if (options.watch) {
    watchFiles(resolvedCfg);        // ← pass the path so we can watch it
  }
};


const createConfig = () => {
  const configFilePath = path.join(process.cwd(), 'scss.config.json');

  const defaultConfig = {
    $schema: 'https://timeax.dev/schemas/scss-compiler.config.schema.json',
    ...config,
  };

  if (fs.existsSync(configFilePath)) {
    console.log(log('⚠️ scss.config.json already exists. Overwrite? (y/N)'));
    process.stdin.once('data', (data) => {
      if (data.toString().trim().toLowerCase() === 'y') {
        fs.writeFileSync(configFilePath, JSON.stringify(defaultConfig, null, 2));
        console.log(log(`✅ Overwritten config file at ${configFilePath}`));
      } else {
        console.log(log('🚫 Aborted. Existing config preserved.'));
      }
      process.exit();
    });
  } else {
    fs.writeFileSync(configFilePath, JSON.stringify(defaultConfig, null, 2));
    console.log(log(`✅ Created default config file at ${configFilePath}`));
  }
};

// Public API to register with your root CLI
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