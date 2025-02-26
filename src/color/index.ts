import { Fs } from "@timeax/utilities";
import chokidar from "chokidar";
import { Command } from "commander";
import finder from 'find-package-json';
//@ts-ignore
import { QuestionCollection } from "inquirer";
import sass from "sass";
import { extractColors, getString, save, toFigma } from "./sass";
import { run as insertQuery } from '../media';

export default function (program: Command) {
   program
      .command("colors <source>")
      .description("Create color variables from tailwind, sass and css")
      .option("-w --watch <boolean>")
      .action(run);

   program
      .command("cnf [source]")
      .description("Run valet cli functions from config file")
      .action(fromConfig);
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
            if (!value) continue;

            if (!useRoot && key === "cssVars")
               if (
                  !hasRun &&
                  (value.startsWith("./") ||
                     value.startsWith("/") ||
                     value.startsWith("../"))
               ) {
                  modal[key] = Fs.join(process.cwd(), value);
               }

            if (key == 'tailwind' && typeof useTailwind !== 'string') continue;
            save(modal[key], colors, key as any, !!useTailwind, useRoot);
         }
      }
   }

   if (modal.figma !== undefined && modal.figma)
      return toFigma(colors || {});
}

function fromPackageJson(source: finder.PackageWithPath) {
   if (!source.__path.includes('node_modules') && source.dweb) return true
}

function isRelative(source: string) {
   source = Fs.format(source);
   return source.startsWith('/') || source.startsWith('./') || source.startsWith('../');
}

function getJson(source?: string) {
   let config: Config | undefined;
   if (!source) {
      const f = finder(process.cwd());
      var json: finder.PackageWithPath;
      //-------
      while (!((json = f.next().value) && fromPackageJson(json)));
      source = json?.__path;
      //--------
      if (json) config = json.dweb;
   } else {
      if (isRelative(source)) source = Fs.join(process.cwd(), Fs.format(source));
      config = JSON.parse(Fs.content(source) || "{}");
   }

   if (!config) throw Error('Could not load config file in ' + process.cwd());

   return { config, configSource: source };
}

async function runColors(props: ColorConfig, watch?: boolean) {
   const path = props.source;

   const options: Record<keyof typeof Options, string> = {
      css: props.css,
      root: props.cssRoots,
      scss: props.scss,
      tailwind: props.tailwind,
      //@ts-ignore
      cssVars: props.cssRoots,
      useRoot: props.cssRoots,
      figma: props.figma || false
   }

   const watcher = await lastRun(path, options, { w: watch });
   //@ts-ignore
   if (runColors.watcher) runColors.watcher.close();
   //@ts-ignore
   runColors.watcher = watcher;
}

function watchConfig(path: string, source: string) {
   //@ts-ignore
   if (watchConfig.watcher) return;

   const watcher = chokidar.watch(path, {
      persistent: true,
   });

   watcher.on("change", () => {
      console.log("A change occured....");
      console.log("Stopping watchers..");
      console.log("Recompiling..");
      fromConfig(source)
   });

   //@ts-ignore
   watchConfig.watcher = watcher;
}

async function fromConfig(source: string) {
   let { config, configSource } = getJson(source);

   watchConfig(configSource, source)

   const runners: Record<keyof Config, any> = {
      colors: (props) => runColors(props, config.watch),
      mediaQuery: (props) => {
         const points = props.breakpoints || {};
         const keys = Object.keys(points);

         if (keys.length < 1) return;

         let path = props.outDir

         if (isRelative(path)) path = Fs.join(process.cwd(), path);

         insertQuery(path, { b: [keys.map(item => `${item}:${points[item]}`).join(',')], ...props })
      },
      watch: undefined
   }

   for (const key in config) {
      if (Object.prototype.hasOwnProperty.call(config, key)) {
         const element = config[key];
         //---------
         const func = runners[key];
         if (func) {
            func(element);
         }
      }
   }
}

async function lastRun(source: string, modal: any, props) {
   await start(source, modal);

   if (props.watch || props.w) {
      const watcher = chokidar.watch(source, {
         persistent: true,
      });

      watcher.on("change", () => {
         console.log("File change detected...");
         start(source, modal, true);
      });

      return watcher;
   }
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

      lastRun(source, modal, props);
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

const Options = {
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
