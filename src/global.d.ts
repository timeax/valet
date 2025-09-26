
// src/types/config.ts (or your existing config typings)
type ThemeOutputType = 'tailwind' | 'variables';
type ColorFormat = 'hex' | 'rgb' | 'rgba' | 'oklch';

interface ColorsConfig {
   source: string;              // .scss | .json | .js/.mjs
   scss?: string;               // optional SCSS variables file
   css?: string;                // optional utility classes file
   figma?: string | boolean;
   type?: ThemeOutputType;      // keep for compatibility
   themeKeys?: string[];        // e.g. ["dark","my-theme"]
   colorFormat?: ColorFormat;   // 'hex' | 'rgb' | 'rgba' | 'oklch'
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

interface ExtraConfig {
   [x: string]: {
      default?: string; // Default value for the extra configuration
      [x: string]: string; // Additional custom configurations
   }; // Additional custom configurations
}

// config-schema.ts
interface Config {
   configPath?: string;
   outFile?: string; // Path to the Tailwind CSS configuration file
   colors?: ColorConfig
   media?: MediaQueryConfig;
   extra?: ExtraConfig | string // path to js file whose default export implements this ExtraConfig; // Additional custom configurations
}