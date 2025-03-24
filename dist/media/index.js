"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TAB = void 0;
exports.generateMediaQueries = generateMediaQueries;
exports.defaultBreakpoints = defaultBreakpoints;
const utilities_1 = require("@timeax/utilities");
const theme_1 = require("../utils/theme");
exports.TAB = '   ';
const PLACEHOLDER = 'INCLUDE_BREAKPOINTS_HERE';
const QUERY = utilities_1.Fs.content(utilities_1.Fs.join(__dirname, './query.txt'));
/**
 * Generate Media Queries
 * @param config Configuration options
 */
async function generateMediaQueries(config) {
    const { breakpoints = defaultBreakpoints(), outDir = process.cwd(), filename = "_mediaQuery.scss", type = "tailwind", useSass = false, } = config.media;
    const filePath = utilities_1.Fs.join(outDir, filename.startsWith("_") ? filename : `_${filename}`);
    const breakpointsPath = utilities_1.Fs.join(outDir, "_breakpoints.scss");
    // Generate SCSS breakpoints
    const breakpointsContent = generateBreakpoints(breakpoints);
    await utilities_1.Fs.createPath(breakpointsPath, { content: breakpointsContent });
    if (type === "tailwind" || type == 'variables') {
        const path = config.outFile;
        //---
        const themeContent = convertBreakpointsToTheme(breakpoints);
        await utilities_1.Fs.createPath(path);
        const content = (0, theme_1.updateThemeBlock)(utilities_1.Fs.content(path) || "", {
            prefix: "--breakpoint-",
            newPrefixContent: themeContent,
            type: type == 'tailwind' ? "theme" : 'root',
        });
        await utilities_1.Fs.writeSync(path, content);
    }
    let content = `@use './breakpoints.scss';\n`;
    if (useSass) {
        content += generateSassFunctions();
        await utilities_1.Fs.createPath(filePath, { content });
    }
}
/**
 * Generate SCSS Breakpoints
 */
function generateBreakpoints(breakpoints) {
    return `$breakpoints: (\n${Object.entries(breakpoints)
        .map(([name, size]) => `   "${name}": ${size},\n`)
        .join("")}) !default;`;
}
/**
 * Convert SCSS breakpoints to Tailwind theme
 */
function convertBreakpointsToTheme(breakpoints) {
    return Object.entries(breakpoints)
        .map(([name, size]) => `  --breakpoint-${name}: ${size};\n`)
        .join("");
}
/**
 * Generate SCSS Functions for Media Queries
 */
function generateSassFunctions() {
    return QUERY?.replace(PLACEHOLDER, "@use './breakpoints.scss';\n");
    ;
}
/**
 * Default Breakpoints
 */
function defaultBreakpoints() {
    return {
        "i3.2": '320px',
        "13.6": '360px',
        "13.75": '375px',
        "i4.14": '414px',
        "i4": '400px',
        "i5.76": '576px',
        "i7.68": '768px',
        "i6": '600px',
        "i6.2": '620px',
        "i8": '800px',
        "i9.92": '992px',
        "i9.2": '920px',
        "i10.24": '1024px',
        "i10.8": '1080px',
        "i12.8": '1280px',
        "i13.66": '1366px',
        "i15.36": '1536px',
        "i19.2": '1920px',
    };
}
