// scss/types.ts

export type Glob = string | string[];

export interface AdditionalRule {
   /** SCSS text to inject when this rule applies. */
   value: string;
   /** Glob(s) relative to 'source' that must match for the rule to apply (if omitted → applies to all). */
   includes?: Glob;
   /** Glob(s) relative to 'source' that, if matched, exclude the rule. */
   excludes?: Glob;
   /** Explicit file paths (relative to 'source') that FORCE the rule to apply, even if excluded. */
   files?: string[];
}

export interface Config {
   /** Absolute or relative path to the SCSS source directory. */
   source: string;
   /** Output directory for compiled CSS. Will be created if missing. */
   out: string;

   /** Either a global string or an ordered array of conditional rules. */
   additionalData: string | AdditionalRule[];

   /** Lightning CSS targets map (auto-filled from Browserslist if absent). */
   targets?: Record<string, number>;
   /** Minify with Lightning CSS. */
   minify: boolean;
   /** Use Lightning CSS at all (transform & minify). */
   lightningCss: boolean;

   /** Ignore entries. Supports direct filenames, folder paths ending with '/', and simple '*' wildcards. */
   ignore: string[];

   // Extras
   /** Root path for resolving the &<...> beacon. Defaults to 'source'. */
   root?: string;
   /** Beacon prefix (default '&'). */
   beaconPrefix?: string;
   /** Reorder @forward → @use → @import → others (default 'on'). */
   reorder?: 'on' | 'off';
}

export interface BuildResult {
   code: string;
   url: URL;
   loadPaths: string[];
}