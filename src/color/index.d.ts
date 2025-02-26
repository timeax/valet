interface Config {
   colors: ColorBase;
}

interface ColorBase {
   env: {
      tailwind?: string;
      css?: string;
      scss?: string;
      cssVars?: string;
   };

   sourceFile: string;
   type?: "module" | "script";
   watch?: boolean
}


interface CLIProps {
   w?: any;
   watch: any;
   sourceType?: 'module' | 'script'
}