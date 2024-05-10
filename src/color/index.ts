import { Fs } from "@timeax/utilities";
import chokidar from "chokidar";
import { Command } from "commander";
//@ts-ignore
import { QuestionCollection } from "inquirer";
import sass from "sass";
import { extractColors, getString, save, toFigma } from "./sass";

export default function (program: Command) {
   program
      .command("colors <source>")
      .description("Create color variables from tailwind, sass and css")
      .option("-w --watch <boolean>")
      .action(run);

   program
      .command("cc [source]")
      .description("Create color variables from tailwind, sass and css")
      .option("-s, --start")
      .action(run);
}

async function start(source: string, modal, hasRun: boolean = false) {
   if (
      source.startsWith("../") ||
      source.startsWith("./") ||
      source.startsWith("/")
   )
      source = Fs.join(process.cwd(), source);

   // console.log(source);
   const colors = await compile(Fs.content(source));

   if (colors) {
      let useRoot = modal["useRoot"] as unknown as boolean;
      let useTailwind = modal["tailwind"];
      //---------
      for (const key in modal) {
         if (Object.prototype.hasOwnProperty.call(modal, key)) {
            const value = modal[key];
            ///---
            if (key === "useRoot") continue;
            if (!useRoot && key === "cssVars")
               if (
                  !hasRun &&
                  (value.startsWith("./") ||
                     value.startsWith("/") ||
                     value.startsWith("../"))
               ) {
                  modal[key] = Fs.join(process.cwd(), value);
               }

            save(modal[key], colors, key as any, !!useTailwind, useRoot);
         }
      }
   }

   return toFigma(colors || {});
}

async function fromConfig(source: string, params: {}) {

}

async function run(
   source: string,
   props: { w?: any; watch?: any; source: string }
) {
   const {
      default: { prompt },
   } = await import("inquirer");
   // console.log(def, props);
   //-----------
   const selection = (await prompt(Select)) as { options?: string[] };

   if (selection.options) {
      selection.options.unshift("root", "vars");
      //--------
      const modal: Record<string, string> = await prompt(
         selection.options.map((item) => ({ ...Options[item] }))
      );

      await start(source, modal);

      if (props.watch || props.w) {
         const watcher = chokidar.watch(source, {
            persistent: true,
         });

         watcher.on("change", () => {
            console.log("File change detected...");
            start(source, modal, true);
         });
      }
   }
}

async function compile(content: string) {
   // console.log(content)
   const result = await sass.compileStringAsync(getString(content), {
      sourceMap: false,
   });

   // console.log(result.css);
   if (result.css) {
      return extractColors(result.css);
   }

   return undefined;
}

const Select: QuestionCollection<any> = [
   {
      name: "options",
      message: "Select the output environments you intend to use",
      choices: [
         {
            type: "choice",
            value: "tailwind",
            name: "Tailwind",
         },
         {
            type: "choice",
            value: "css",
            name: "Cascading stylesheet(.css)",
            checked: true,
         },
         {
            type: "choice",
            name: "Sass",
            value: "scss",
         },
      ],
      type: "checkbox",
   },
];

const Options: { [x: string]: QuestionCollection<any> } = {
   tailwind: {
      name: "tailwind",
      message: "Enter relative or absolute path to tailwind output(.js | .ts)",
      default: "./tailwind/colors.js",
   },

   css: {
      name: "css",
      message: "Enter relative or absolute path to css output",
      default: "./styles/colors.css",
   },

   scss: {
      name: "scss",
      message: "Enter relative or absolute path to scss output",
      default: "./scss/_colors.scss",
   },

   root: {
      name: "useRoot",
      message: "Do you want to add colors as css variables?",
      type: "confirm",
   },

   vars: {
      name: "cssVars",
      message:
         "Enter path to insert css variables (please ensure file contains css :root {...} selector)",
      when(answers) {
         if (answers.useRoot) return true;
         return false;
      },
      default: "./styles/vars.css",
   },
};
