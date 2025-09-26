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
let processingQueue = new Set<string>();
let debounceTimeout: NodeJS.Timeout | null = null;

const watchFiles = () => {
  if (!config?.source) {
    console.error('❌ Error: config.source is undefined or invalid.');
    return;
  }

  const watcher = chokidar.watch(config.source, { ignoreInitial: true });

  watcher.on('all', (event, filePath) => {
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
          Promise.all(queue.map(processFile)).catch(() => {});
        }, 200);
      } else if (event === 'unlink') {
        console.log(`🗑️ File removed: ${rel}`);
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
const start = async (configPath: string | undefined, options: { watch?: boolean }) => {
  if (configPath) loadConfig(configPath);
  else loadConfig(path.join(process.cwd(), 'scss.config.json'));

  await initializeLightningCss(config);
  await processAllFiles();

  if (options.watch) watchFiles();
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