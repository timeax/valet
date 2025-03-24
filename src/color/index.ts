import fs from 'fs/promises';
import path from 'path';
import { compile, save, toFigma } from "./sass";
import { pathToFileURL } from "url";

async function loadColorsFromSource(source: string) {
   const filePath = path.resolve(source);

   if (source.endsWith('.scss')) {
      const content = await fs.readFile(filePath, 'utf-8');
      return await compile(content);
   }

   if (source.endsWith('.json')) {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
   }

   if (source.endsWith('.js') || source.endsWith('.mjs')) {
      const module = await import(pathToFileURL(filePath).href);
      return module.default;
   }

   if (source.endsWith('.mjs')) {
      const module = await import(pathToFileURL(filePath).href);
      return module.default;
   }

   throw new Error("Unsupported color source format. Must be SCSS, JSON, or JS.");
}

export async function colorConfig(config: Config) {
   if (!config.colors?.source) {
      throw new Error("No color source provided in the config.");
   }

   try {
      const colors = await loadColorsFromSource(config.colors.source);
      const { scss, css, figma, type = "tailwind" } = config.colors;
      const useTailwind = type === "tailwind";
      const useRoots = type === "variables";

      // Process colors and save them based on the config
      const saveTasks: Promise<void>[] = [];
      if(useRoots || useTailwind) 
         saveTasks.push(save(config.outFile, colors, "entry", useTailwind, useRoots));
      if (scss) {
         saveTasks.push(save(scss, colors, "scss", useTailwind, useRoots));
      }
      if (css) {
         saveTasks.push(save(css, colors, "css", useTailwind, useRoots));
      }
      if (figma) {
         saveTasks.push(Promise.resolve(toFigma(colors)) as any); // Direct call for Figma output
      }

      await Promise.all(saveTasks);

      return colors;
   } catch (error) {
      console.error("Error processing colors:", error);
      return {};
   }
}
