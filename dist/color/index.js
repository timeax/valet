"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utilities_1 = require("@timeax/utilities");
const chokidar_1 = __importDefault(require("chokidar"));
const sass_1 = __importDefault(require("sass"));
const sass_2 = require("./sass");
function default_1(program) {
    program
        .command("colors <source>")
        .description("Create color variables from tailwind, sass and css")
        .option("-w --watch <boolean>")
        .action(run);
    program
        .command("cc [source]")
        .description("Create color variables from tailwind, sass and css")
        .option("-s, --start")
        .action(run);
}
exports.default = default_1;
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
                if (!useRoot && key === "cssVars")
                    if (!hasRun &&
                        (value.startsWith("./") ||
                            value.startsWith("/") ||
                            value.startsWith("../"))) {
                        modal[key] = utilities_1.Fs.join(process.cwd(), value);
                    }
                (0, sass_2.save)(modal[key], colors, key, !!useTailwind, useRoot);
            }
        }
    }
    return (0, sass_2.toFigma)(colors || {});
}
async function fromConfig(source, params) {
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
        await start(source, modal);
        if (props.watch || props.w) {
            const watcher = chokidar_1.default.watch(source, {
                persistent: true,
            });
            watcher.on("change", () => {
                console.log("File change detected...");
                start(source, modal, true);
            });
        }
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
