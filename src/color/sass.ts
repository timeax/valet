import { Fs } from "@timeax/utilities";

export function getString(code: string) {
   return `@function is-map($var){
      @return type-of($var) == 'map';
    }
    
    @mixin create-vars($value, $baseName: null, $prefix: '--') {
        @if is-map($value) {
            @each $name, $value in $value {
                $var-name: "";
                @if str-index($baseName, $prefix) {
                    $var-name: #{$baseName}-#{$name};
                } @else {
                    $var-name: #{$prefix}-#{$name};   
                }
                
                @if is-map($value) {
                    @include create-vars($value, $var-name);
                } @else {
                    #{$var-name}: $value;
                }
            }
        } @else if $baseName {
            #{$var-name}: $value;
        }
    }
    ${code};
    
    :root {
       /* Color list start */
       @each $name, $value in $colors {
           @include create-vars($value, '--color-'+$name);
       }
     /* Color list ends */
    }
    `;
}

export function extractColors(css: string) {
   const colors = css.match(/--color-[^;]*;/gm);

   const list = {};

   colors.forEach((color) => {
      color = color.replace("--color-", "");
      const name = color.substring(0, color.indexOf("-"));

      const suffix = color.substring(
         color.indexOf("-") + 1,
         color.indexOf(":")
      );
      const value = color
         .substring(color.indexOf(":") + 1, color.length - 1)
         .trim();
      //--------------

      if (!list[name]) list[name] = {};

      if (suffix === "default") list[name]["DEFAULT"] = value;

      list[name][suffix] = value;
   });

   return list;
}

export function save(
   to: string,
   colors: Record<string, any>,
   name: "tailwind" | "css" | "scss" | "cssVars",
   useTailwind?: boolean,
   useRoots?: boolean
) {
   switch (name) {
      case "tailwind":
         return tailwind(to, colors, useRoots);
      case "css":
         return css(to, colors, useRoots);
      case "scss":
         return scss(to, colors, useRoots);
      case "cssVars":
         return roots(to, colors, useTailwind);
   }
}

async function parse(value) {
   const { default: parse } = await import("color-parse");
   return parse(value);
}

export function toFigma(list) {
   const colors = {};
   for (const group in list) {
      if (Object.hasOwnProperty.call(list, group)) {
         colors[group.charAt(0).toUpperCase() + group.slice(1)] = list[group];
      }
   }

   const jsonFile = Fs.join(process.cwd(), "colors.theme.json");

   Fs.writeSync(jsonFile, JSON.stringify(colors));
   console.log("For figma usage, see -> " + jsonFile);

   return jsonFile;
}

async function tailwind(
   to: string,
   colors: Record<string, any>,
   useRoots?: boolean
) {
   const tailwindColors = {} as any;

   for (const key in colors) {
      if (Object.prototype.hasOwnProperty.call(colors, key)) {
         const color = colors[key];
         if (typeof color === "string") {
            const { values, space } = await parse(color);
            if (useRoots)
               tailwindColors[key] = `${space}(var(--color-${key}) ${
                  space === "rgba" ? ", " : "/"
               } <alpha-value>)`;
            else
               tailwindColors[key] = `${space}(${values.join(",")} ${
                  space === "rgba" ? ", " : "/"
               } <alpha-value>)`;
         } else {
            tailwindColors[key] = {};
            for (const name in color) {
               if (Object.prototype.hasOwnProperty.call(color, name)) {
                  let value = color[name];
                  if (name === "default") continue;

                  const { values, space } = await parse(value);

                  let propName =
                     name === "DEFAULT" ? `${key}` : `${key}-${name}`;

                  if (useRoots)
                     tailwindColors[key][
                        name
                     ] = `${space}(var(--color-${propName}) ${
                        space === "rgba" ? ", " : "/"
                     } <alpha-value>)`;
                  else
                     tailwindColors[key][name] = `${space}(${values.join(
                        ","
                     )} ${space === "rgba" ? ", " : "/"} <alpha-value>)`;
               }
            }
         }
      }
   }

   const jsonString = JSON.stringify(tailwindColors);
   const content = `const colors = ${jsonString}; \n\n module.exports = colors;`;
   // Fs.writeSync(to, content);
   Fs.createPath(to, { content });
}

async function css(
   to: string,
   colors: Record<string, any>,
   useRoots?: boolean
) {
   // this is to create the color class names utilities for design
   const list = [];
   //--
   const run = async (value, key: string, item: string) => {
      if (!(typeof value == "string" || typeof value == "number"))
         throw SyntaxError(
            "Error in code - cannot have a color shade on a shade at key - " +
               key +
               " " +
               typeof value
         );

      const name = key === "default" ? "" : "-" + key;
      let realVal = colors[item][key];
      //--------
      const { space } = await parse(realVal);
      if (useRoots) value = `${space}(var(--color-${item}${name}))`;
      //---
      list.push(
         `.bg-${item}${name} { background-color: ${value} } .color-${item}${name} { color: ${value} }`
      );
   };

   for (const item of Object.keys(colors)) {
      if (typeof colors[item] === "object")
         for (const key in colors[item]) {
            if (key.endsWith("DEFAULT")) continue;
            if (Object.hasOwnProperty.call(colors[item], key)) {
               let value = colors[item][key];
               await run(value, key, item);
            }
         }
      else await run(colors[item], "default", item);
   }

   Fs.createPath(to, { content: list.join("\n") });
}

const PREFIX = "--color-";

async function roots(
   to: string,
   colors: Record<string, any>,
   useTailwind: boolean
) {
   const regex = new RegExp(/(--)[^\,\:\)]+:[^\;][^\n]+/, "gm");
   const cssVars = new RegExp(":root[^{]*{[^}]*}", "gm");
   const list = [];
   //---
   const run = async (value, key, item) => {
      value = useTailwind
         ? await (async () => {
              const { values } = await parse(value);
              return values.join(" ");
           })()
         : value;
      const name = key === "default" ? "" : "-" + key;
      //-------
      list.push(`--color-${item}${name}: ${value};`);
   };

   for (const item of Object.keys(colors)) {
      //----------
      if (typeof colors[item] == "object")
         for (const key in colors[item]) {
            if (key.endsWith("DEFAULT")) continue;
            if (Object.hasOwnProperty.call(colors[item], key))
               await run(colors[item][key], key, item);
         }
      else await run(colors[item], "default", item);
   }

   let content = Fs.content(to) || "";
   if (!content) {
      if (useTailwind) {
         content = `@layer base {
            :root {}
          }`;
      } else content = `:root {}`;
   }

   let vars = cssVars.exec(content);

   if (!vars) {
      if (useTailwind) {
         content += `@layer base {
            :root {}
          }`;
      } else content += `:root {}`;
      vars = cssVars.exec(content);
   }

   const text = vars[0];
   //---------
   let match = text.match(regex) || [];
   //------
   const roots = match.filter((item) => !item.startsWith(PREFIX));

   roots.push(...list);

   let edited = content.replace(text, `:root {\n${roots.join("\n\t")}\n}`);
   //---
   Fs.createPath(to, { content: edited });
   // Fs.writeSync(to, colors.join("\n"));
}

async function scss(
   to: string,
   colors: Record<string, any>,
   useRoots?: boolean
) {
   const list = [];

   for (let item of Object.keys(colors)) {
      let colorName = "$color-" + item;
      //----------
      for (const key in colors[item]) {
         if (key.endsWith("DEFAULT")) continue;
         if (Object.hasOwnProperty.call(colors[item], key)) {
            const name = key === "default" ? "" : "-" + key;
            let realVal = colors[item][key];
            //--------
            const { space } = await parse(realVal);

            const value = useRoots
               ? `${space}(var(--color-${item}${name}));`
               : realVal;
            //-------
            list.push(`${colorName}${name}: ${value}`);
         }
      }
   }
   //---
   // Fs.writeSync(to, colors.join("\n"));
   Fs.createPath(to, { content: list.join("\n") });
}
