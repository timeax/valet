import chokidar from 'chokidar';
import { Fs } from "@timeax/utilities";
import { Command } from "commander";
import { defaultBreakpoints, generateMediaQueries } from "../media";
import { colorConfigWithTailwindMerge } from "./index.tailwind";
import { runConfig } from './run-config';

const defaultConfig: Config = {
   outFile: "./app.css",
   colors: {
      scss: "./styles/_colors.scss",
      css: "./styles/colors.css",
      source: "./colors.scss",
      type: "tailwind",
   },
   media: {
      breakpoints: defaultBreakpoints(),
      outDir: "./styles",
      filename: "_mediaQuery.scss",
      type: "tailwind",
      useSass: true,
   },
   extra: {
      fonts: {
         primary: "Inter, sans-serif",
         secondary: "Roboto, sans-serif",
      },
   },
};

/**
 * Generate a default config object and save it as `csr.json` inside the given directory.
 * @param dirPath The directory where the `csr.json` file should be saved.
 */
export async function generateConfig(dirPath: string) {
   try {
      await Fs.createPath(dirPath); // Ensure the directory exists
      const filePath = Fs.join(dirPath, "csr.json"); // Define full file path
      await Fs.writeSync(filePath, JSON.stringify(defaultConfig, null, 3));
      console.log(`Config file saved at: ${filePath}`);
   } catch (error) {
      console.error("Failed to save config file:", error);
   }
}

/**
 * Fixes all relative paths in the given config, making them absolute.
 * @param config The configuration object to fix paths in.
 * @param baseDir The base directory to resolve relative paths from.
 * @returns A new config object with fixed paths.
 */
export function fixConfigPaths(config: Config, baseDir: string): Config {
   if (!config) return config;

   // Ensure base directory exists
   if (!Fs.exists(baseDir) || !Fs.isDir(baseDir)) {
      throw new Error(`Invalid base directory: ${baseDir}`);
   }

   // Helper function to resolve a path if it is relative
   const resolvePath = (path?: string) =>
      path && Fs.isRelative(path) ? Fs.fPath(path, baseDir) : path;

   return {
      ...config,
      outFile: resolvePath(config.outFile),
      colors: config.colors
         ? {
            ...config.colors,
            scss: resolvePath(config.colors.scss),
            css: resolvePath(config.colors.css),
            source: resolvePath(config.colors.source),
            figma: resolvePath(config.colors.figma),
         }
         : config.colors ?? undefined,
      media: config.media
         ? {
            ...config.media,
            outDir: resolvePath(config.media.outDir),
         }
         : config.media ?? undefined,
   };
}



/**
 * Retrieve the configuration from `csr.json`.
 * @param sourceDir Optional relative directory to load config from (default: current directory).
 * @returns Parsed Config object or `null` if the file doesn't exist.
 */
export async function getConfig(sourceDir?: string): Promise<Config | null> {
   try {
      const dirPath = Fs.isRelative(sourceDir) ? Fs.join(process.cwd(), sourceDir || "") : sourceDir; // Resolve absolute path
      const filePath = Fs.join(dirPath, "csr.json");

      if (!(await Fs.exists(filePath))) {
         console.warn(`Config file not found at: ${filePath}`);
         return null;
      }

      const content = Fs.content(filePath);

      const config = fixConfigPaths(JSON.parse(content), sourceDir ?? process.cwd());
      config.configPath = filePath; // Store the path of the config file
      return config;
   } catch (error) {
      console.error("Failed to retrieve config:", error);
      return null;
   }
}



// wherever you run config

// function runConfig(config: Config) {
//    if (config.colors) {
//       // Use the new Tailwind-safe merge runner
//       void colorConfigWithTailwindMerge(config);
//    }
//    if (config.media) generateMediaQueries(config);
// }

export default function csr(program: Command) {
   program
      .command("csr [source]")
      .option("-w, --watch", "Watch for changes in config and source files")
      .option("-y, --init", "Watch for changes in config and source files")
      .action(async (source = process.cwd(), options) => {
         if (options.init) {
            return generateConfig(source)
         }
         const config = await getConfig(source);

         if (!config) {
            console.error("No valid configuration found.");
            return;
         }

         // Run initial config processing
         runConfig(config);

         if (options.watch) {
            console.log("Watching for changes...");
            watchConfig(source || process.cwd(), config);
         } else {
            console.info('Operation successful')
         }
      });

}

/**
 * Watch `csr.json` and its referenced files for changes.
 * - Always watches: csr.json (or config.configPath)
 * - Also watches: colors.source (if present) and extra (when it's a string path)
 *
 * On any change, reloads config and re-runs runConfig(newConfig).
 * If referenced paths change, the watcher set is updated (added/removed) live.
 */
function watchConfig(sourceDir: string, config: Config) {
   // Normalize/resolve a path relative to sourceDir (guard against falsy)
   const resolveIfExists = (p?: string) => {
      if (!p) return null;
      const full = Fs.fPath(p, sourceDir);
      return Fs.exists(full) ? full : null;
   };

   // Build a unique list of files to watch from a config object
   const computeWatchList = (cfg: Config): string[] => {
      const base = resolveIfExists(cfg.configPath ?? 'csr.json');
      const colors = resolveIfExists(cfg.colors?.source);
      const extra =
         typeof cfg.extra === 'string'
            ? resolveIfExists(cfg.extra)
            : null;

      return Array.from(new Set([base, colors, extra].filter(Boolean) as string[]));
   };

   // Initial watch set
   let filesToWatch = computeWatchList(config);
   if (filesToWatch.length === 0) {
      console.warn('No valid files to watch.');
      return;
   }

   const watcher = chokidar.watch(filesToWatch, { ignoreInitial: true });

   const rebalanceWatchSet = (nextCfg: Config) => {
      const next = computeWatchList(nextCfg);

      // Add new files
      for (const f of next) {
         if (!filesToWatch.includes(f)) {
            watcher.add(f);
            console.log(`🧩 Now watching: ${f}`);
         }
      }

      // Unwatch removed files
      for (const f of filesToWatch) {
         if (!next.includes(f)) {
            watcher.unwatch(f);
            console.log(`🗑️ Stopped watching: ${f}`);
         }
      }

      filesToWatch = next;
   };

   watcher.on('change', async (filePath) => {
      console.log(`♻️  File changed: ${filePath}`);
      try {
         const newConfig = await getConfig(sourceDir);
         if (newConfig) {
            await runConfig(newConfig);
            rebalanceWatchSet(newConfig);
         }
      } catch (e: any) {
         console.error('❌ Failed to reload config after change:', e?.message ?? e);
      }
   });

   watcher.on('add', async (filePath) => {
      // If new extra/colors file appears after being missing, re-run to pick it up
      console.log(`➕ File added: ${filePath}`);
      try {
         const newConfig = await getConfig(sourceDir);
         if (newConfig) {
            await runConfig(newConfig);
            rebalanceWatchSet(newConfig);
         }
      } catch (e: any) {
         console.error('❌ Failed to apply config after add:', e?.message ?? e);
      }
   });

   watcher.on('unlink', async (filePath) => {
      console.warn(`⚠️ File removed: ${filePath}`);
      try {
         const newConfig = await getConfig(sourceDir);
         if (newConfig) {
            await runConfig(newConfig);
            rebalanceWatchSet(newConfig);
         }
      } catch (e: any) {
         console.error('❌ Failed to apply config after unlink:', e?.message ?? e);
      }
   });

   watcher.on('error', (error) => {
      console.error('Watcher error:', error);
   });

   console.log('👀 Watching:', filesToWatch.join(', '));
}