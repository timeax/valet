// src/color/tailwind-support.ts
import sass from "sass";
import { getString } from "./get-string";
import { transformCssColorFormat } from "../utils/color-format";
import { Fs } from "@timeax/utilities";

export async function writeTailwindThemes(
   _outFile: string,            // kept for signature compatibility; unused
   scssContent: string,
   _backupPath?: string
): Promise<string> {
   let rawIncoming = "";
   try {
      rawIncoming = (await compile(scssContent, (global as any).__themeKeys || [])).themeCss;
   } catch (error) {
      console.error("Error compiling SCSS:", error);
      return Fs.content(_outFile); // return original content on error
   }
   const colorFmt = (global as any).__colorFormat as "hex" | "rgb" | "rgba" | "oklch" | undefined;
   const incoming = colorFmt ? transformCssColorFormat(rawIncoming, colorFmt) : rawIncoming;

   return incoming; // <-- just return the generated CSS
}

// keep compile if other callers use it
export async function compile(content: string, themeKeys: string[] = []) {
   const program = getString(content, "$colors", themeKeys);
   const res = await sass.compileStringAsync(program, { sourceMap: false });
   const css = res.css || "";
   return { themeCss: css };
}