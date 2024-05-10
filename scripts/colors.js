const fs = require('fs');
const path = require('path');
const sass = require('sass');

const chokidar = require('chokidar')

const file = path.join(__dirname, './scss/colors.scss');

const tailwindColorFile = path.join(__dirname, '../tailwind/colors.js');
const root = path.join(__dirname, '../styles/global.css');

const sassFile = path.join(__dirname, '../styles/utils/_colors.scss');
const Figma = path.join(__dirname, 'figma.json')

const watcher = chokidar.watch(path.join(__dirname, './scss'), { persistent: true });

watcher.on('change', () => {
   console.log('File change detacted...')
   run()
});

console.log('Watching ' + path.dirname(file));

function run() {
   const result = sass.compile(file, { sourceMap: false });

   // console.log(result.css);
   //---
   const css = result.css;

   const colors = css.match(/--color-[^;]*;/gm);

   const list = {};

   colors.forEach(color => {
      color = color.replace('--color-', '');
      const name = color.substring(0, color.indexOf('-'));

      const suffix = color.substring(color.indexOf('-') + 1, color.indexOf(':'));
      const value = color.substring(color.indexOf('#'), color.length - 1);
      //--------------

      if (!list[name]) createGroup(name);

      if (suffix === 'default') list[name]['DEFAULT'] = value;

      list[name][suffix] = value;
   });

   function createGroup(name) {
      list[name] = {};
   }

   toSass(list);

   toJsFile(list);
   toFigma(list);

   console.log('Finished...')
}



function toJsFile(list) {
   const jsonString = JSON.stringify(list, (key, value) => {
      if (key === 'default') return;
      return value;
   });

   const content = `const colors = ${jsonString}; \n\nexport default colors;`;

   fs.writeFileSync(tailwindColorFile, content);
}


function toSass(list) {
   /**@type {string[]} */
   const colors = [];

   const forRoot = [];
   

   Object.keys(list).forEach(item => {
      let name = '$color-' + item;
      //----------
      for (const key in list[item]) {
         if (key.endsWith('DEFAULT')) continue;
         if (Object.hasOwnProperty.call(list[item], key)) {
            const value = list[item][key];
            //-------
            colors.push(`${name}-${key}: var(--color-${item}-${key});`);
            forRoot.push(`--color-${item}-${key}: ${value};`)

            // forModule.push(`${item}_${key}`);
         }
      }
   })
   //---
   fs.writeFileSync(sassFile, colors.join('\n'));
   toRoot(forRoot);
}

function toFigma(list) {
   const colors = { };
   for (const group in list) {
      if (Object.hasOwnProperty.call(list, group)) {
         if (group == 'transparent') continue;

         delete list[group]['DEFAULT'];

         colors[group.charAt(0).toUpperCase() + group.slice(1)] = list[group];
      }
   }
   fs.writeFileSync(Figma, JSON.stringify(colors));
   console.log('For figma usage, see -> ' + Figma)
}

const PREFIX = '--color-';
const regex = new RegExp(/(--)[^\,\:\)]+:[^\;][^\n]+/, 'gm');
const cssVars = new RegExp(':root[^{]*\{[^}]*}', 'gm');

function toRoot(list) {
   const content = fs.readFileSync(root, 'utf-8');
   let edited = content;

   let vars = cssVars.exec(edited);

   if (!vars) return;

   const text = vars[0];
   //---------
   let match = text.match(regex) || [];
   //------
   const roots = match.filter(item => !item.startsWith(PREFIX));

   roots.push(...list);

   // let [starter, ender] = [content.substring(0, start), content.substring(start + text.length)];
   ///--
   // edited = starter +  + ender;

   edited = content.replace(text, `:root {\n${roots.join('\n\t')}\n}`);

   // console.log(edited, content.includes(vars.input))
   // console.log(edited)
   fs.writeFileSync(root, edited);
}

run();