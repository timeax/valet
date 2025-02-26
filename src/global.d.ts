interface Config {
   watch?: boolean
   colors: ColorConfig;
   mediaQuery: MediaQueryConfig
}


interface ColorConfig {
   cssRoots?: string;
   tailwind?: string;
   scss?: string,
   css?: string,
   types?: string;
   source: string;
   figma?: boolean
}

interface MediaQueryConfig {
   breakpoints: {
      [x: string]: any;
   }

   tailwind?: string;
   name?: string;
   outDir?: string;
}