"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TAB = void 0;
exports.run = run;
exports.mediaQuery = mediaQuery;
const utilities_1 = require("@timeax/utilities");
exports.TAB = '   ';
const PLACEHOLDER = 'INCLUDE_BREAKPOINTS_HERE';
const QUERY = utilities_1.Fs.content(utilities_1.Fs.join(__dirname, './query.txt'));
// process.addListener('uncaughtException', (err) => {
//    console.log(err.message)
// });
function install(props = '_mediaQuery.scss', options) {
    let path = utilities_1.Fs.join(process.cwd(), props);
    if (!['.scss', '.sass'].includes(utilities_1.Fs.ext(props)))
        throw TypeError('Please add a `.scss` or `.sass` extension to your path');
    run(path, options);
}
async function run(path, options) {
    const dir = utilities_1.Fs.dir(path);
    if (!utilities_1.Fs.name(path).startsWith('_'))
        path = utilities_1.Fs.join(dir, '_' + utilities_1.Fs.name(path));
    //----
    const breakpoints = breakPoints(options.b?.join?.(''));
    //-------
    const path2 = utilities_1.Fs.join(dir, '_breakpoints.scss');
    // console.log(path, path2, breakpoints, options);
    //-----------
    await utilities_1.Fs.createPath(path2, { content: breakpoints });
    if (options.tailwind) {
        let js = 'module.exports = ' + JSON.stringify(options.breakpoints);
        await utilities_1.Fs.createPath(utilities_1.Fs.fPath(options.tailwind, process.cwd()), { content: js });
    }
    let content = QUERY?.replace(PLACEHOLDER, "@import './breakpoints.scss';\n");
    await utilities_1.Fs.createPath(path, { content: content });
}
function breakPoints(props) {
    if (props) {
        const breakPoints = props.split(',');
        return `$breakpoints: (\n${breakPoints.map(item => exports.TAB + item + ',' + '\n').join('')}) !default;`;
    }
    return (`
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
		`);
}
function mediaQuery(program) {
    program
        .command('mq')
        .argument('[string]', 'Location to install query SCSS file')
        .description('Get a full list of a installed domains')
        .action(install)
        .option('-b, --b <string...>', "A list of breakpoints separated by a comma, Default is created if ommited")
        .action(install);
}
