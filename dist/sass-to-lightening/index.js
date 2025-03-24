"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSassCompilerCommand = createSassCompilerCommand;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const chokidar_1 = __importDefault(require("chokidar"));
const browserslist_1 = __importDefault(require("browserslist"));
let lightningCss = null;
let defaultTargets = {}; // Store default targets
// Log function with timestamps
const log = (message) => `[${new Date().toLocaleTimeString()}] ${message}`;
/**
 * Initialize Lightning CSS (if available)
 */
const initializeLightningCss = async () => {
    try {
        lightningCss = await import("lightningcss");
        const { browserslistToTargets } = lightningCss;
        defaultTargets = browserslistToTargets((0, browserslist_1.default)('>= 0.25%')); // Fetch default browserlist
    }
    catch (error) {
        console.error(log(`❌ Error initializing Lightning CSS: ${error.message}`));
        console.warn(log("⚠️ Lightning CSS not found. Skipping optimization..."));
    }
};
// Configuration
const config = {
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
if (!fs_1.default.existsSync(config.out))
    fs_1.default.mkdirSync(config.out, { recursive: true });
/**
 * Check if a file should be ignored
 * @param file - Filename or folder path
 * @returns boolean
 */
const isIgnored = (file) => {
    const fullPath = path_1.default.join(config.source, file);
    return config.ignore.some((pattern) => {
        if (pattern.endsWith("/")) {
            // Ensure full folder match
            return fullPath.startsWith(path_1.default.join(config.source, pattern));
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
const processFile = async (file) => {
    if (isIgnored(file)) {
        console.log(log(`🚫 Ignoring ${file}`));
        return;
    }
    const scssPath = path_1.default.join(config.source, file);
    const outputCssPath = path_1.default.join(config.out, file.replace(".scss", ".css"));
    console.log(log(`🔄 Processing ${file}...`));
    try {
        // Read SCSS content & inject additionalData
        const scssContent = config.additionalData + fs_1.default.readFileSync(scssPath, "utf-8");
        // Compile SCSS (using --stdin for max speed)
        const compiledCss = (0, child_process_1.execSync)(`npx sass --stdin --load-path=${config.source}`, {
            input: scssContent,
            encoding: "utf-8",
        });
        let finalCss = compiledCss;
        // Optimize CSS with Lightning CSS if enabled and available
        if (config.lightningCss && lightningCss) {
            const { transform } = lightningCss;
            const result = transform({
                code: Buffer.from(compiledCss),
                minify: config.minify,
                targets: config.targets,
            });
            finalCss = Buffer.from(result.code).toString(); // Ensure string format
        }
        // Save processed CSS
        fs_1.default.writeFileSync(outputCssPath, finalCss);
        console.log(log(`✅ Processed: ${outputCssPath} (Minify: ${config.minify}, Lightning CSS: ${config.lightningCss})`));
    }
    catch (error) {
        console.error(log(`❌ Error processing ${file}: ${error.message}\n${error.stderr?.toString() || ""}`));
    }
};
/**
 * Process all SCSS files
 */
const processAllFiles = async () => {
    console.log(log("🔄 Processing all SCSS files..."));
    if (!fs_1.default.existsSync(config.source)) {
        console.error(log(`❌ SCSS source folder "${config.source}" does not exist.`));
        return;
    }
    const scssFiles = fs_1.default.readdirSync(config.source).filter((file) => file.endsWith(".scss"));
    await Promise.all(scssFiles.map(processFile));
    console.log(log("🎉 Initial compilation complete!"));
};
/**
 * Watch for changes & recompile on the fly
 */
const watchFiles = () => {
    chokidar_1.default.watch(config.source, { ignoreInitial: true }).on("all", (event, filePath) => {
        const file = path_1.default.relative(config.source, filePath);
        if (file.endsWith(".scss") && !isIgnored(file)) {
            if (event === "add" || event === "change") {
                processFile(file);
            }
        }
    });
    console.log(log("👀 Watching for SCSS changes..."));
};
/**
 * Load configuration from a file
 */
const loadConfig = (configPath) => {
    if (fs_1.default.existsSync(configPath)) {
        try {
            const rawData = fs_1.default.readFileSync(configPath, "utf-8");
            Object.assign(config, JSON.parse(rawData));
            console.log(log(`✅ Loaded config from ${configPath}`));
            return true;
        }
        catch (error) {
            console.error(log(`❌ Failed to parse ${configPath}: ${error.message}`));
        }
    }
    return false;
};
/**
 * Start compilation process
 */
const start = async (configPath, options) => {
    if (configPath) {
        loadConfig(configPath);
    }
    else {
        loadConfig(path_1.default.join(process.cwd(), "scss.config.json"));
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
    const configFilePath = path_1.default.join(process.cwd(), "scss.config.json");
    if (fs_1.default.existsSync(configFilePath)) {
        console.log(log("⚠️ config.json already exists. Overwrite? (y/N)"));
        process.stdin.once("data", (data) => {
            if (data.toString().trim().toLowerCase() === "y") {
                fs_1.default.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
                console.log(log(`✅ Overwritten config file at ${configFilePath}`));
            }
            else {
                console.log(log("🚫 Aborted. Existing config preserved."));
            }
            process.exit();
        });
    }
    else {
        fs_1.default.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
        console.log(log(`✅ Created default config file at ${configFilePath}`));
    }
};
/**
 * Register CLI Commands
 */
function createSassCompilerCommand(program) {
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
