"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
const utilities_1 = require("@timeax/utilities");
const chokidar_1 = __importDefault(require("chokidar"));
const find_package_json_1 = __importDefault(require("find-package-json"));
const sass_1 = __importDefault(require("sass"));
const sass_2 = require("./sass");
const media_1 = require("../media");
function default_1(program) {
    program
        .command("colors <source>")
        .description("Create color variables from tailwind, sass and css")
        .option("-w --watch <boolean>")
        .action(run);
    program
        .command("cnf [source]")
        .description("Run valet cli functions from config file")
        .action(fromConfig);
}
async function start(source, modal, hasRun = false) {
    if (source.startsWith("../") ||
        source.startsWith("./") ||
        source.startsWith("/"))
        source = utilities_1.Fs.join(process.cwd(), source);
    // console.log(source);
    const colors = await compile(utilities_1.Fs.content(source));
    if (colors) {
        let useRoot = modal["useRoot"];
        let useTailwind = modal["tailwind"];
        //---------
        for (const key in modal) {
            if (Object.prototype.hasOwnProperty.call(modal, key)) {
                const value = modal[key];
                ///---
                if (key === "useRoot")
                    continue;
                if (!value)
                    continue;
                if (!useRoot && key === "cssVars")
                    if (!hasRun &&
                        (value.startsWith("./") ||
                            value.startsWith("/") ||
                            value.startsWith("../"))) {
                        modal[key] = utilities_1.Fs.join(process.cwd(), value);
                    }
                if (key == 'tailwind' && typeof useTailwind !== 'string')
                    continue;
                (0, sass_2.save)(modal[key], colors, key, !!useTailwind, useRoot);
            }
        }
    }
    if (modal.figma !== undefined && modal.figma)
        return (0, sass_2.toFigma)(colors || {});
}
function fromPackageJson(source) {
    if (!source.__path.includes('node_modules') && source.dweb)
        return true;
}
function isRelative(source) {
    source = utilities_1.Fs.format(source);
    return source.startsWith('/') || source.startsWith('./') || source.startsWith('../');
}
function getJson(source) {
    let config;
    if (!source) {
        const f = (0, find_package_json_1.default)(process.cwd());
        var json;
        //-------
        while (!((json = f.next().value) && fromPackageJson(json)))
            ;
        source = json?.__path;
        //--------
        if (json)
            config = json.dweb;
    }
    else {
        if (isRelative(source))
            source = utilities_1.Fs.join(process.cwd(), utilities_1.Fs.format(source));
        config = JSON.parse(utilities_1.Fs.content(source) || "{}");
    }
    if (!config)
        throw Error('Could not load config file in ' + process.cwd());
    return { config, configSource: source };
}
async function runColors(props, watch) {
    const path = props.source;
    const options = {
        css: props.css,
        root: props.cssRoots,
        scss: props.scss,
        tailwind: props.tailwind,
        //@ts-ignore
        cssVars: props.cssRoots,
        useRoot: props.cssRoots,
        figma: props.figma || false
    };
    const watcher = await lastRun(path, options, { w: watch });
    //@ts-ignore
    if (runColors.watcher)
        runColors.watcher.close();
    //@ts-ignore
    runColors.watcher = watcher;
}
function watchConfig(path, source) {
    //@ts-ignore
    if (watchConfig.watcher)
        return;
    const watcher = chokidar_1.default.watch(path, {
        persistent: true,
    });
    watcher.on("change", () => {
        console.log("A change occured....");
        console.log("Stopping watchers..");
        console.log("Recompiling..");
        fromConfig(source);
    });
    //@ts-ignore
    watchConfig.watcher = watcher;
}
async function fromConfig(source) {
    let { config, configSource } = getJson(source);
    watchConfig(configSource, source);
    const runners = {
        colors: (props) => runColors(props, config.watch),
        mediaQuery: (props) => {
            const points = props.breakpoints || {};
            const keys = Object.keys(points);
            if (keys.length < 1)
                return;
            let path = props.outDir;
            if (isRelative(path))
                path = utilities_1.Fs.join(process.cwd(), path);
            (0, media_1.run)(path, { b: [keys.map(item => `${item}:${points[item]}`).join(',')], ...props });
        },
        watch: undefined
    };
    for (const key in config) {
        if (Object.prototype.hasOwnProperty.call(config, key)) {
            const element = config[key];
            //---------
            const func = runners[key];
            if (func) {
                func(element);
            }
        }
    }
}
async function lastRun(source, modal, props) {
    await start(source, modal);
    if (props.watch || props.w) {
        const watcher = chokidar_1.default.watch(source, {
            persistent: true,
        });
        watcher.on("change", () => {
            console.log("File change detected...");
            start(source, modal, true);
        });
        return watcher;
    }
}
async function run(source, props) {
    const { default: { prompt }, } = await import("inquirer");
    // console.log(def, props);
    //-----------
    const selection = (await prompt(Select));
    if (selection.options) {
        selection.options.unshift("root", "vars");
        //--------
        const modal = await prompt(selection.options.map((item) => ({ ...Options[item] })));
        lastRun(source, modal, props);
    }
}
async function compile(content) {
    // console.log(content)
    const result = await sass_1.default.compileStringAsync((0, sass_2.getString)(content), {
        sourceMap: false,
    });
    // console.log(result.css);
    if (result.css) {
        return (0, sass_2.extractColors)(result.css);
    }
    return undefined;
}
const Select = [
    {
        name: "options",
        message: "Select the output environments you intend to use",
        choices: [
            {
                type: "choice",
                value: "tailwind",
                name: "Tailwind",
            },
            {
                type: "choice",
                value: "css",
                name: "Cascading stylesheet(.css)",
                checked: true,
            },
            {
                type: "choice",
                name: "Sass",
                value: "scss",
            },
        ],
        type: "checkbox",
    },
];
const Options = {
    tailwind: {
        name: "tailwind",
        message: "Enter relative or absolute path to tailwind output(.js | .ts)",
        default: "./tailwind/colors.js",
    },
    css: {
        name: "css",
        message: "Enter relative or absolute path to css output",
        default: "./styles/colors.css",
    },
    scss: {
        name: "scss",
        message: "Enter relative or absolute path to scss output",
        default: "./scss/_colors.scss",
    },
    root: {
        name: "useRoot",
        message: "Do you want to add colors as css variables?",
        type: "confirm",
    },
    vars: {
        name: "cssVars",
        message: "Enter path to insert css variables (please ensure file contains css :root {...} selector)",
        when(answers) {
            if (answers.useRoot)
                return true;
            return false;
        },
        default: "./styles/vars.css",
    },
};
