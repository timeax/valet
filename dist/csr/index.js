"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateConfig = generateConfig;
exports.fixConfigPaths = fixConfigPaths;
exports.getConfig = getConfig;
exports.default = csr;
const chokidar_1 = __importDefault(require("chokidar"));
const utilities_1 = require("@timeax/utilities");
const color_1 = require("../color");
const media_1 = require("../media");
const defaultConfig = {
    outFile: "./app.css",
    colors: {
        scss: "./styles/_colors.scss",
        css: "./styles/colors.css",
        source: "./colors.scss",
        figma: "",
        type: "tailwind",
    },
    media: {
        breakpoints: {
            xs: "320px",
            sm: "360px",
            md: "768px",
            lg: "1024px",
            xl: "1280px",
            "2xl": "1536px",
            "4k": "1920px",
        },
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
async function generateConfig(dirPath) {
    try {
        await utilities_1.Fs.createPath(dirPath); // Ensure the directory exists
        const filePath = utilities_1.Fs.join(dirPath, "csr.json"); // Define full file path
        await utilities_1.Fs.writeSync(filePath, JSON.stringify(defaultConfig, null, 3));
        console.log(`Config file saved at: ${filePath}`);
    }
    catch (error) {
        console.error("Failed to save config file:", error);
    }
}
/**
 * Fixes all relative paths in the given config, making them absolute.
 * @param config The configuration object to fix paths in.
 * @param baseDir The base directory to resolve relative paths from.
 * @returns A new config object with fixed paths.
 */
function fixConfigPaths(config, baseDir) {
    if (!config)
        return config;
    // Ensure base directory exists
    if (!utilities_1.Fs.exists(baseDir) || !utilities_1.Fs.isDir(baseDir)) {
        throw new Error(`Invalid base directory: ${baseDir}`);
    }
    // Helper function to resolve a path if it is relative
    const resolvePath = (path) => path && utilities_1.Fs.isRelative(path) ? utilities_1.Fs.fPath(path, baseDir) : path;
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
async function getConfig(sourceDir) {
    try {
        const dirPath = utilities_1.Fs.isRelative(sourceDir) ? utilities_1.Fs.join(process.cwd(), sourceDir || "") : sourceDir; // Resolve absolute path
        const filePath = utilities_1.Fs.join(dirPath, "csr.json");
        if (!(await utilities_1.Fs.exists(filePath))) {
            console.warn(`Config file not found at: ${filePath}`);
            return null;
        }
        const content = utilities_1.Fs.content(filePath);
        return fixConfigPaths(JSON.parse(content), sourceDir ?? process.cwd());
    }
    catch (error) {
        console.error("Failed to retrieve config:", error);
        return null;
    }
}
function runConfig(config) {
    if (config.colors)
        (0, color_1.colorConfig)(config);
    if (config.media)
        (0, media_1.generateMediaQueries)(config);
    if (config.fonts) { }
}
function csr(program) {
    program
        .command("csr [source]")
        .option("-w, --watch", "Watch for changes in config and source files")
        .option("-y, --init", "Watch for changes in config and source files")
        .action(async (source = process.cwd(), options) => {
        if (options.init) {
            return generateConfig(source);
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
        }
        else {
            console.info('Operation successful');
        }
    });
}
/**
 * Watch `csr.json` and its referenced files for changes.
 * @param sourceDir Directory containing csr.json.
 * @param config The loaded configuration object.
 */
function watchConfig(sourceDir, config) {
    const configPath = utilities_1.Fs.fPath("csr.json", sourceDir);
    // Collect files to watch
    const filesToWatch = [
        configPath,
        config.colors?.source,
    ].filter((file) => file && utilities_1.Fs.exists(file));
    if (filesToWatch.length === 0) {
        console.warn("No valid files to watch.");
        return;
    }
    const watcher = chokidar_1.default.watch(filesToWatch, { ignoreInitial: true });
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
