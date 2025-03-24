import chokidar from 'chokidar';
import { Fs } from "@timeax/utilities";
import { Command } from "commander";
import { colorConfig } from "../color";
import { defaultBreakpoints, generateMediaQueries } from "../media";

const defaultConfig: Config = {
   outFile: "./app.css",
   colors: {
      scss: "./styles/_colors.scss",
      css: "./styles/colors.css",
      source: "./colors.scss",
      figma: "",
      type: "tailwind",
   },
   media: {
      breakpoints: defaultBreakpoints(),
      outDir: "./styles",
      filename: "_mediaQuery.scss",
      type: "tailwind",
      useSass: false,
   },
   fonts: {
      primary: "Inter, sans-serif",
      secondary: "Roboto, sans-serif",
   },
   watch: false,
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

      return fixConfigPaths(JSON.parse(content), sourceDir ?? process.cwd());
   } catch (error) {
      console.error("Failed to retrieve config:", error);
      return null;
   }
}



function runConfig(config: Config) {
   if (config.colors) colorConfig(config);
   if (config.media) generateMediaQueries(config);
   if (config.fonts) { }
}

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
 * @param sourceDir Directory containing csr.json.
 * @param config The loaded configuration object.
 */
function watchConfig(sourceDir: string, config: Config) {
   const configPath = Fs.fPath("csr.json", sourceDir);

   // Collect files to watch
   const filesToWatch: string[] = [
      configPath,
      config.colors?.source,
   ].filter((file) => file && Fs.exists(file)) as string[];

   if (filesToWatch.length === 0) {
      console.warn("No valid files to watch.");
      return;
   }

   const watcher = chokidar.watch(filesToWatch, { ignoreInitial: true });

   watcher.on("change", async (filePath) => {
      console.log(`File changed: ${filePath}`);
      const newConfig = await getConfig(sourceDir);

      if (newConfig) {
         runConfig(newConfig);
      }
   });

   watcher.on("unlink", (filePath) => {
      console.warn(`File removed: ${filePath}`);
   });

   watcher.on("error", (error) => {
      console.error("Watcher error:", error);
   });
}