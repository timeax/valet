import { Fs } from "@timeax/utilities";
import { CommandOptions } from "commander";

export const TAB = '   ';
const PLACEHOLDER = 'INCLUDE_BREAKPOINTS_HERE';

const QUERY = Fs.content(Fs.join(__dirname, './query.txt')) as string;

// process.addListener('uncaughtException', (err) => {
//    console.log(err.message)
// });

function install(props: string = '_mediaQuery.scss', options: { b?: string[], tailwind?: string }) {
   let path = Fs.join(process.cwd(), props);
   if (!['.scss', '.sass'].includes(Fs.ext(props))) throw TypeError('Please add a `.scss` or `.sass` extension to your path');
   run(path, options);
}

export async function run(path: string, options: any) {
   const dir = Fs.dir(path);

   if (!Fs.name(path).startsWith('_')) path = Fs.join(dir, '_' + Fs.name(path));
   //----
   const breakpoints = breakPoints(options.b?.join?.(''));
   //-------
   const path2 = Fs.join(dir, '_breakpoints.scss');

   // console.log(path, path2, breakpoints, options);
   //-----------
   await Fs.createPath(path2, { content: breakpoints });


   if (options.tailwind) {
      let js = 'module.exports = ' + JSON.stringify(options.breakpoints);
      await Fs.createPath(Fs.fPath(options.tailwind, process.cwd()), { content: js })
   }


   let content = QUERY?.replace(PLACEHOLDER, "@import './breakpoints.scss';\n");

   await Fs.createPath(path, { content: content });
}

function breakPoints(props?: string) {
   if (props) {
      const breakPoints = props.split(',');
      return `$breakpoints: (\n${breakPoints.map(item => TAB + item + ',' + '\n').join('')}) !default;`
   }

   return (
      `
		$breakpoints: (
			"xxs-mobile": 320px,
			"xs-mobile": 360px,
			"mobile": 375px,
			"xxs-tablet": 414px,
			"xs-tablet": 576px,
			"sm-tablet": 768px,
			"tablet": 992px,
			"xxs-laptop": 1024px,
			"xs-laptop": 1280px,
			"sm-laptop": 1366px,
			"laptop": 1536px,
			"monitor": 1920px,
	  	) !default;
		`
   )
}

interface CliOption1 {
   name: undefined;
   action<T>(...any: T[]): any;
   options: Array<{
      name: string;
      desc?: string
      default?: any;
   }>
}

interface CliOption2 {
   name: string;
   commandOpts: CommandOptions | undefined;
   alias?: string;
   //---
   desc?: string;
   args?: Array<{
      name: string;
      desc?: string
      default?: string;
   }>;
   action<T>(...any: T[]): any;
   options?: Array<{
      name: string;
      desc?: string
      default?: string;
   }>
}

type Options = CliOption1 | CliOption2;


export function mediaQuery(program: any) {
   program
      .command('mq')
      .argument('[string]', 'Location to install query SCSS file')
      .description('Get a full list of a installed domains')
      .action(install)
      .option('-b, --b <string...>', "A list of breakpoints separated by a comma, Default is created if ommited")
      .action(install)
}

