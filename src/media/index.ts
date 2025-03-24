import { Fs } from "@timeax/utilities";
import { updateThemeBlock } from "../utils/theme";
export const TAB = '   ';
const PLACEHOLDER = 'INCLUDE_BREAKPOINTS_HERE';
const QUERY = Fs.content(Fs.join(__dirname, './query.txt')) as string;

/**
 * Generate Media Queries
 * @param config Configuration options
 */
export async function generateMediaQueries(config: Config) {
   const {
      breakpoints = defaultBreakpoints(),
      outDir = process.cwd(),
      filename = "_mediaQuery.scss",
      type = "tailwind",
      useSass = false,
   } = config.media;

   const filePath = Fs.join(outDir, filename.startsWith("_") ? filename : `_${filename}`);
   const breakpointsPath = Fs.join(outDir, "_breakpoints.scss");

   // Generate SCSS breakpoints
   const breakpointsContent = generateBreakpoints(breakpoints);
   await Fs.createPath(breakpointsPath, { content: breakpointsContent });

   if (type === "tailwind" || type == 'variables') {
      const path = config.outFile;
      //---
      const themeContent = convertBreakpointsToTheme(breakpoints);
      await Fs.createPath(path);

      const content = updateThemeBlock(Fs.content(path) || "", {
         prefix: "--breakpoint-",
         newPrefixContent: themeContent,
         type: type == 'tailwind' ? "theme" : 'root',
      });
      await Fs.writeSync(path, content);
   }

   let content = `@use './breakpoints.scss';\n`;


   if (useSass) {
      content += generateSassFunctions();
      await Fs.createPath(filePath, { content });
   }
}

/**
 * Generate SCSS Breakpoints
 */
function generateBreakpoints(breakpoints: { [x: string]: string }) {
   return `$breakpoints: (\n${Object.entries(breakpoints)
      .map(([name, size]) => `   "${name}": ${size},\n`)
      .join("")}) !default;`;
}


/**
 * Convert SCSS breakpoints to Tailwind theme
 */
function convertBreakpointsToTheme(breakpoints: { [x: string]: string }) {
   return Object.entries(breakpoints)
      .map(([name, size]) => `  --breakpoint-${name}: ${size};\n`)
      .join("");
}

/**
 * Generate SCSS Functions for Media Queries
 */
function generateSassFunctions() {
   return QUERY?.replace(PLACEHOLDER, "@use './breakpoints.scss';\n");;
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
