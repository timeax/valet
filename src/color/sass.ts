import { Fs } from "@timeax/utilities";
import { updateThemeBlock } from "../utils/theme";
import sass from "sass";

export function getString(code: string, colors: string = "$colors") {
   return `@mixin create-vars($value, $baseName: null, $prefix: '--') {
        @if type-of($value) == 'map' {
            @each $name, $val in $value {
                $var-name: if(str-index($baseName, $prefix), #{$baseName}-#{$name}, #{$prefix}-#{$name});
                @if type-of($val) == 'map' {
                    @include create-vars($val, $var-name);
                } @else {
                    #{$var-name}: $val;
                }
            }
        } @else if $baseName {
            #{$baseName}: $value;
        }
    }

    ${code};
    
    :root {
       @each $name, $value in ${colors} {
           @include create-vars($value, '--color-'+$name);
       }
    }`;
}

export function extractColors(css) {
   return css.match(/--color-[^;]*;/gm)?.reduce((list, color) => {
      let [name, value] = color.replace('--color-', '').split(':');
      name = name.trim();
      value = value.replace(';', '').trim();
      const [base, shade = "DEFAULT"] = name.split('-');
      list[base] = list[base] || {};
      list[base][shade] = value;
      return list;
   }, {});
}



export async function compile(content: string) {
   // console.log(content)
   const result = await sass.compileStringAsync(getString(content), { sourceMap: false });

   // console.log(result.css);
   if (result.css) {
      return extractColors(result.css);
   }

   return undefined;
}

export function save(to, colors, name, useTailwind, useRoots) {
   const handlers = { css, scss, entry: roots };
   return handlers[name]?.(to, colors, useTailwind || useRoots);
}

async function parse(value: string): Promise<string> {
   try {
      // Regex for detecting RGB(A) formats (supports slash and comma separation)
      if (/^rgba?\(\s*\d+\s*([,\s]\s*\d+\s*){2}(?:\/?\s*\d+(\.\d+)?|\s*,\s*\d+(\.\d+)?)?\s*\)$/i.test(value)) {
         return value; // Already in RGB(A) format, return as is
      }

      const { default: parse } = await import("color-parse");
      const result = parse(value);

      if (!result?.values) {
         throw new Error(`Invalid color value: ${value}`);
      }

      return result.values.join(", ");
   } catch (error) {
      console.error("Color parsing error:", error);
      return "Invalid Color";
   }
}


export async function toFigma(list) {
   const colors = Object.fromEntries(Object.entries(list).map(([key, val]) => [
      key.charAt(0).toUpperCase() + key.slice(1), val
   ]));
   const jsonFile = Fs.join(process.cwd(), "colors.theme.json");
   await Fs.writeSync(jsonFile, JSON.stringify(colors));
   console.log("For figma usage, see -> " + jsonFile);
   return jsonFile;
}

async function css(to, colors, useRoots) {
   const list = Object.entries(colors).flatMap(([item, shades]) =>
      Object.entries(shades).map(([key, value]) => `.bg-${item}-${key} { background-color: ${useRoots ? `var(--color-${item}-${key})` : value} } .color-${item}-${key} { color: ${useRoots ? `var(--color-${item}-${key})` : value} }`)
   );
   await Fs.createPath(to, { content: list.join("\n") });
}

async function roots(to, colors, useTailwind) {
   const entries = Object.entries(colors).flatMap(([item, shades]) =>
      Object.entries(shades).map(async ([key, value]) => {
         let parsedValue = useTailwind ? await parse(value) : value;

         // Ensure it's a string and normalize whitespace
         parsedValue = typeof parsedValue === "string" ? parsedValue.trim() : parsedValue;

         // Check if the parsed value is already an rgb/rgba string
         const isRGB = /^rgba?\s*\(/.test(parsedValue);

         // Format correctly: Only wrap if it's NOT already in rgb/rgba format
         const colorString = isRGB ? parsedValue : `rgb(${parsedValue})`;

         return `--color-${item}-${key}: ${colorString};`;
      })
   );

   const list = await Promise.all(entries);

   await Fs.createPath(to, {
      content: updateThemeBlock(Fs.content(to) || "", {
         type: useTailwind ? "theme" : "root",
         prefix: "--color-",
         newPrefixContent: list.join("\n"),
      }),
   });
}


async function scss(to, colors, useRoots) {
   const list = Object.entries(colors).flatMap(([item, shades]) =>
      Object.entries(shades).map(([key, value]) => `$color-${item}-${key}: ${useRoots ? `var(--color-${item}-${key})` : value}; ${useRoots ? `$rc-${item}-${key}: var(--color-${item}-${key});` : ""}`)
   );
   await Fs.createPath(to, { content: list.join("\n") });
}
