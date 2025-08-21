// src/color/tailwind-support.ts
import fs from 'fs/promises';
import { mergeThemeCss } from '../utils/theme-merge';
import sass from "sass";
import { getString } from "./get-string";

export async function writeTailwindThemes(outFile: string, scssContent: string, backupPath?: string) {
   const { themeCss: incoming } = await compile(scssContent, /* themeKeys */(global as any).__themeKeys ?? []);
   const current = await fs.readFile(outFile).then(b => b.toString()).catch(() => "");
   const backupFile = backupPath || `${outFile}.theme.backup.css`;
   const backup = await fs.readFile(backupFile).then(b => b.toString()).catch(() => "");

   const { mergedCss, report } = mergeThemeCss(current, backup, incoming, {
      preferIncomingOnConflict: true, // or false to keep user changes on conflicts
      annotate: true
   });

   await fs.writeFile(outFile, mergedCss, 'utf-8');
   await fs.writeFile(backupFile, incoming, 'utf-8'); // new snapshot

   // optional: log a concise report
   const sum = (k: keyof typeof report) => (report[k] as any[]).length;
   console.log(
      `[theme-merge] +${sum('added')} ~${sum('updated')} -${sum('removed')}` +
      (sum('conflicts') ? ` ⚠ conflicts:${sum('conflicts')}` : '') +
      (sum('keptModified') ? ` ✋ kept:${sum('keptModified')}` : '')
   );
}

// src/color/sass.ts


export async function compile(content: string, themeKeys: string[] = []) {
   const program = getString(content, "$colors", themeKeys);
   const res = await sass.compileStringAsync(program, { sourceMap: false });
   const css = res.css || "";
   return { themeCss: css }; // you can still keep extractColors if you need it elsewhere
}