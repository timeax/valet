import sass from 'sass';
import { Fs } from '@timeax/utilities';
// import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import { Command } from "commander";
import browserslist from 'browserslist';

let lightningCss: any = null;
let defaultTargets: Record<string, number> = {}; // Store default targets

// Log function with timestamps
const log = (message: string) => `${message}`;

/**
 * Initialize Lightning CSS (if available)
 */
const initializeLightningCss = async () => {
   try {
      lightningCss = await import("lightningcss");
      const { browserslistToTargets } = lightningCss;
      defaultTargets = browserslistToTargets(browserslist('>= 0.25%')); // Fetch default browserlist
   } catch (error) {
      console.error(log(`❌ Error initializing Lightning CSS: ${error.message}`));
      console.warn(log("⚠️ Lightning CSS not found. Skipping optimization..."));
   }
};

// Config Interface
interface Config {
   source: string;
   out: string;
   additionalData: string;
   targets: { [browser: string]: number };
   minify: boolean;
   lightningCss: boolean;
   ignore: string[]; // List of files/folders to ignore
}

// Configuration
const config: Config = {
   //@ts-ignore
   $schema: "https://gist.githubusercontent.com/timeax/f37af1fbe0de58a5a165d6f527e4ebc2/raw/41ad8489466368d67586c15c530e34c8786a805f/scss-to-lightening.json",
   source: "./scss", // Source SCSS folder
   out: "./dist", // Output CSS folder
   additionalData: `
    $primary: #3498db;
    $secondary: #2ecc71;
  `,
   targets: defaultTargets, // Use Lightning CSS default targets
   minify: false,
   lightningCss: true,
   ignore: ["_*.scss", "ignore.scss", "ignored-folder/"], // Add ignored files/folders here
};

// Ensure output folder exists
if (!fs.existsSync(config.out)) fs.mkdirSync(config.out, { recursive: true });

/**
 * Check if a file should be ignored
 * @param file - Filename or folder path
 * @returns boolean
 */
const isIgnored = (file: string): boolean => {
   const fullPath = path.join(config.source, file);

   return config.ignore.some((pattern) => {
      if (pattern.endsWith("/")) {
         // Ensure full folder match
         return fullPath.startsWith(path.join(config.source, pattern));
      }
      if (pattern.includes("*")) {
         // Convert wildcard to regex
         const regexPattern = pattern.replace(/\*/g, ".*");
         const regex = new RegExp(regexPattern);
         return regex.test(file) || regex.test(fullPath);
      }
      // Direct file match
      return file === pattern;
   });
};


/**
 * Process a single SCSS file
 * @param file - SCSS filename
 */
const processFile = async (file: string): Promise<void> => {
   if (isIgnored(file)) {
      console.log(log(`🚫 Ignoring ${file}`));
      return;
   }

   const scssPath = path.join(config.source, file);
   const outputCssPath = path.join(config.out, file.replace(".scss", ".css"));

   console.log(log(`🔄 Processing ${file}...`));

   try {
      // Read SCSS content & inject additionalData
      const scssContent = config.additionalData + fs.readFileSync(scssPath, "utf-8");

      // Compile SCSS (using --stdin for max speed)
      // const compiledCss = execSync(`npx sass --stdin  --load-path=${scssPath} --load-path=${config.source}`, {
      //    input: scssContent,
      //    encoding: "utf-8",
      // });

      const compiled = await sass.compileStringAsync(scssContent, {
         loadPaths: [scssPath, config.source], // Resolve imports properly
         sourceMap: false, // Enable source maps for debugging
         silenceDeprecations: ['call-string']
      });

      let finalCss = compiled.css;
      // let finalCss = compiledCss;

      // Optimize CSS with Lightning CSS if enabled and available
      if (config.lightningCss && lightningCss) {
         const { transform } = lightningCss;
         const result = transform({
            code: Buffer.from(compiled.css),
            minify: config.minify,
            targets: config.targets,
         });
         finalCss = Buffer.from(result.code).toString(); // Ensure string format
      }

      // Save processed CSS
      Fs.createPath(outputCssPath, { content: finalCss });
      console.log(log(`✅ Processed: ${outputCssPath} (Minify: ${config.minify}, Lightning CSS: ${config.lightningCss})`));
   } catch (error: any) {
      console.error(log(`❌ Error processing ${file}: ${error.message}\n${error.stderr?.toString() || ""}`));
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
         results = results.concat(getAllScssFiles(fullPath)); // Recursively read subdirectories
      } else if (file.endsWith(".scss")) {
         results.push(path.relative(config.source, fullPath)); // Store relative path
      }
   }

   return results;
};

const processAllFiles = async (init = true): Promise<void> => {
   console.log(log("🔄 Processing all SCSS files..."));

   if (!fs.existsSync(config.source)) {
      console.error(log(`❌ SCSS source folder "${config.source}" does not exist.`));
      return;
   }

   const scssFiles = getAllScssFiles(config.source).filter((file) => !isIgnored(file)); // Get all SCSS files

   await Promise.all(scssFiles.map(processFile));
   if (init) console.log(log("🎉 Initial compilation complete!"));
   else console.log(log("🎉 Recompilation complete!"));

};

let processingQueue = new Set<string>();
let debounceTimeout = null;

/**
 * Watch for SCSS changes and recompile on the fly
 */
const watchFiles = () => {
   if (!config?.source) {
      console.error("❌ Error: config.source is undefined or invalid.");
      return;
   }

   const watcher = chokidar.watch(config.source, { ignoreInitial: true });

   watcher.on("all", (event, filePath) => {
      const file = path.relative(config.source, filePath);

      if (file.endsWith(".scss") && !isIgnored(file)) {
         if (event === "add" || event === "change") {
            const fileName = path.basename(file);

            if (fileName.startsWith("_")) {
               console.log(`⚠️ Skipping partial SCSS file: ${file}`);
               processAllFiles(false);
               return; // Skip SCSS partials (files starting with "_")
            }
            processingQueue.add(file);

            // Debounce processing to avoid excessive re-runs
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
               processingQueue.forEach((f) => processFile(f));
               processingQueue.clear();
            }, 200); // Adjust debounce time as needed
         } else if (event === "unlink") {
            console.log(`🗑️ File removed: ${file}`);
            processAllFiles(false);
         }
      }
   });

   watcher.on("error", (error) => {
      console.error(`Watcher error: ${error.message}`);
   });

   console.log(log("👀 Watching for SCSS changes..."));
};



/**
 * Load configuration from a file
 */
const loadConfig = (configPath: string): boolean => {
   if (fs.existsSync(configPath)) {
      try {
         const rawData = fs.readFileSync(configPath, "utf-8");
         const loadedConfig = JSON.parse(rawData);

         // Resolve paths relative to the config file's directory
         const configDir = path.dirname(Fs.isRelative(configPath) ? Fs.fPath(configPath, process.cwd()) : configPath);
         if (loadedConfig.source) loadedConfig.source = path.resolve(configDir, loadedConfig.source);
         if (loadedConfig.out) loadedConfig.out = path.resolve(configDir, loadedConfig.out);

         Object.assign(config, loadedConfig);
         console.log(log(`✅ Loaded config from ${configPath}`));
         return true;
      } catch (error) {
         console.error(log(`❌ Failed to parse ${configPath}: ${error.message}`));
      }
   }
   return false;
};

/**
 * Start compilation process
 */
const start = async (configPath: string | undefined, options: { watch?: boolean }) => {
   if (configPath) {
      loadConfig(configPath);
   } else {
      loadConfig(path.join(process.cwd(), "scss.config.json"));
   }

   await initializeLightningCss();
   await processAllFiles();

   if (options.watch) {
      watchFiles();
   }
};

/**
 * Create a default config file
 */
const createConfig = () => {
   const configFilePath = path.join(process.cwd(), "scss.config.json");

   if (fs.existsSync(configFilePath)) {
      console.log(log("⚠️ config.json already exists. Overwrite? (y/N)"));
      process.stdin.once("data", (data) => {
         if (data.toString().trim().toLowerCase() === "y") {
            fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
            console.log(log(`✅ Overwritten config file at ${configFilePath}`));
         } else {
            console.log(log("🚫 Aborted. Existing config preserved."));
         }
         process.exit();
      });
   } else {
      fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
      console.log(log(`✅ Created default config file at ${configFilePath}`));
   }
};

/**
 * Register CLI Commands
 */
export function createSassCompilerCommand(program: Command) {
   program
      .command("scss")
      .argument("[config]", "Path to config file (optional)")
      .description("Compile SCSS to CSS or optimize using Lightning CSS")
      .option("-w, --watch", "Watch for changes and recompile automatically")
      .action(start);

   program
      .command("scss-init")
      .description("Create a config.json file")
      .action(createConfig);
}

