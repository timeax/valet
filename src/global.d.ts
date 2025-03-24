

interface ColorConfig {
   scss?: string;    // Path to SCSS color variables
   css?: string;     // Path to a CSS file containing color variables
   source?: string;  // Source for color palette (e.g., JSON, API)
   figma?: string;   // Figma design system link or exported file for colors
   type: 'variables' | 'tailwind' | 'none' // defaults to tailwind
}

interface MediaQueryConfig {
   breakpoints?: {
      [x: string]: string; // Custom breakpoints for responsive design (e.g., mobile, tablet, desktop)
   };
   outDir?: string; // Directory where the output files should be saved
   filename?: string; // Name of the output file (optional)
   type: 'variables' | 'tailwind' | 'none' // defaults to tailwind
   useSass?: boolean; // should load and write predfined methods for scss 
}

interface FontConfig {
   [x: string]: string
} 

// config-schema.ts
interface Config {
   outFile?: string; // Path to the Tailwind CSS configuration file
   colors?: ColorConfig
   media?: MediaQueryConfig;
   fonts?: FontConfig;
   watch?: boolean
}