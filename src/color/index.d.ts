// src/types/config.ts (or your existing config typings)
export type ThemeOutputType = 'tailwind' | 'variables';
export type ColorFormat = 'hex' | 'rgb' | 'rgba' | 'oklch';

export interface ColorsConfig {
  source: string;              // .scss | .json | .js/.mjs
  scss?: string;               // optional SCSS variables file
  css?: string;                // optional utility classes file
  figma?: string | boolean;
  type?: ThemeOutputType;      // keep for compatibility
  themeKeys?: string[];        // e.g. ["dark","my-theme"]
  colorFormat?: ColorFormat;   // 'hex' | 'rgb' | 'rgba' | 'oklch'
}

export interface Config {
  outFile?: string;      // the “entry” file: we’ll write the compiled theme CSS here
  colors?: ColorsConfig;
  // ... (media, fonts, watch) unchanged
}