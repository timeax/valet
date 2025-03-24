"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.colorConfig = colorConfig;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const sass_1 = require("./sass");
const url_1 = require("url");
async function loadColorsFromSource(source) {
    const filePath = path_1.default.resolve(source);
    if (source.endsWith('.scss')) {
        const content = await promises_1.default.readFile(filePath, 'utf-8');
        return await (0, sass_1.compile)(content);
    }
    if (source.endsWith('.json')) {
        const content = await promises_1.default.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    }
    if (source.endsWith('.js') || source.endsWith('.mjs')) {
        const module = await import((0, url_1.pathToFileURL)(filePath).href);
        return module.default;
    }
    if (source.endsWith('.mjs')) {
        const module = await import((0, url_1.pathToFileURL)(filePath).href);
        return module.default;
    }
    throw new Error("Unsupported color source format. Must be SCSS, JSON, or JS.");
}
async function colorConfig(config) {
    if (!config.colors?.source) {
        throw new Error("No color source provided in the config.");
    }
    try {
        const colors = await loadColorsFromSource(config.colors.source);
        const { scss, css, figma, type = "tailwind" } = config.colors;
        const useTailwind = type === "tailwind";
        const useRoots = type === "variables";
        // Process colors and save them based on the config
        const saveTasks = [];
        if (useRoots || useTailwind)
            saveTasks.push((0, sass_1.save)(config.outFile, colors, "entry", useTailwind, useRoots));
        if (scss) {
            saveTasks.push((0, sass_1.save)(scss, colors, "scss", useTailwind, useRoots));
        }
        if (css) {
            saveTasks.push((0, sass_1.save)(css, colors, "css", useTailwind, useRoots));
        }
        if (figma) {
            saveTasks.push(Promise.resolve((0, sass_1.toFigma)(colors))); // Direct call for Figma output
        }
        await Promise.all(saveTasks);
        return colors;
    }
    catch (error) {
        console.error("Error processing colors:", error);
        return {};
    }
}
