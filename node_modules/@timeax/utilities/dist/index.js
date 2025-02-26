"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Default = exports.Fs = exports.util = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const chokidar_1 = __importDefault(require("chokidar"));
const types_1 = require("util/types");
var util;
(function (util) {
    const isObj = {
        prop: null,
        get array() {
            return Array.isArray(this.prop);
        },
        /**
         *
         * @param param - element to be compared
         * @param strict - boolean - set to true to compare elements of an object. default is false
         * @returns boolean
         */
        equal(param, strict) {
            const prop = this.prop;
            if (!strict)
                return param === prop;
            //---
            if (Array.isArray(prop)) {
                if (Array.isArray(param)) {
                    return prop.every((item, i) => is(item).equal(param[i], strict));
                }
                return false;
            }
            if (typeof param === 'object' && param && typeof prop == 'object' && prop && !(0, types_1.isProxy)(prop)) {
                for (const key in param) {
                    if (Object.prototype.hasOwnProperty.call(param, key)) {
                        if (!(key in prop) || !is(param[key]).equal(prop[key]))
                            return false;
                    }
                }
            }
            return param === prop;
        },
        uppercase() {
            return /^[A-Z]*$/.test(this.prop.charAt(0));
        },
    };
    /**
     * Function for validating variables
     */
    function is(prop) {
        isObj.prop = prop;
        return isObj;
    }
    util.is = is;
    /**
     * Ckecks whether or not the parameter is `null` or `undefined`
     * @param prop
     * @returns boolean
     */
    function unset(prop) {
        return prop === null || prop === undefined;
    }
    util.unset = unset;
    /**
     *
     * @param prop object
     * @returns A copy of the same object
     */
    function copyObj(prop, deepCopy = false) {
        if (typeof prop !== 'object' || !prop)
            return prop;
        if (!deepCopy)
            return JSON.parse(JSON.stringify(prop));
        else {
            if ((0, types_1.isProxy)(prop))
                return prop;
            //--
            if (Array.isArray(prop))
                return prop.map(item => copyObj(item));
            let obj = {};
            for (const key in prop) {
                if (Object.prototype.hasOwnProperty.call(prop, key)) {
                    obj[key] = copyObj(prop[key]);
                }
            }
            return obj;
        }
    }
    util.copyObj = copyObj;
    /**
     * Checks if value is empty as follows
     * - `string`: true if it is empty - ignores whitespace
     * - `number`: true if number is less than or equal to 0
     * - `falsey`: true
     * - `object`: true if `Object.keys(args).length <= 0`
     * returns true if error occurs
     * @param args
     */
    function isEmpty(args) {
        if (unset(args))
            return true;
        try {
            if (typeof args == 'object') {
                if (Array.isArray(args))
                    return args.length === 0;
                if (Object.keys(args).length === 0)
                    return false;
            }
            else if (typeof args == "number") {
                return args <= 0;
            }
            else if (typeof args == 'string') {
                return args.trim().length < 1;
            }
        }
        catch (e) {
            return true;
        }
    }
    util.isEmpty = isEmpty;
    /**
     * Runs JSON.parse on string and returns corresponding object
     * @param json valid JSON string
     * @throws Error if JSON string is not valid
     */
    function getObj(json) {
        return JSON.parse(json);
    }
    util.getObj = getObj;
    function avoid(e) {
        try {
            let value = e();
            return {
                then(callback) {
                    return callback(undefined, value);
                }
            };
        }
        catch (error) {
            return {
                then(callback) {
                    return callback(error, undefined);
                }
            };
        }
    }
    util.avoid = avoid;
})(util || (exports.util = util = {}));
util.avoid(() => {
    return '';
}).then((err, value) => {
    if (!err)
        value;
});
var Fs;
(function (Fs) {
    Fs.api = { fs, path };
    /**
     * @description Removes file:/// and other string symbols like `/%20`
     * @param path path-like string
     * @param options FormatOptions: `slashType`: '/' or '\\',  `replaceWhitespaceSym`: boolean, default is true
     * @returns a clean path
     */
    function format(path, options) {
        let slash = (options === null || options === void 0 ? void 0 : options.slashType) || '/', rwss = util.unset(options === null || options === void 0 ? void 0 : options.replaceWhitespaceSym) ? false : options === null || options === void 0 ? void 0 : options.replaceWhitespaceSym;
        //---
        let regex = new RegExp(slash == '/' ? '\\\\' : '/', 'g');
        path = path.replace('file:///', '');
        path = path.replace(regex, slash);
        if (rwss)
            path = path.replace(/%20/g, ' ');
        return path;
    }
    Fs.format = format;
    /**
     * Returns an Array of all direct files and folders within this path
     * @param path path to folder
     */
    function files(path, absolute) {
        if (!path)
            return;
        try {
            let files = fs.readdirSync(path);
            if (absolute)
                return files.map(item => format(join(path, item)));
            return files;
        }
        catch (e) {
            return;
        }
    }
    Fs.files = files;
    function isDir(path) {
        try {
            return fs.statSync(path).isDirectory();
        }
        catch (error) {
            return false;
        }
    }
    Fs.isDir = isDir;
    function stats(path) {
        try {
            const stats = fs.statSync(path);
            return stats;
        }
        catch (error) { }
    }
    Fs.stats = stats;
    function name(filepath, ext) {
        if (!filepath)
            return '';
        return path.basename(filepath, ext);
    }
    Fs.name = name;
    function ext(filepath) {
        if (!filepath)
            return '';
        return path.extname(filepath);
    }
    Fs.ext = ext;
    function dirname(link) {
        if (!link)
            return '';
        return name(dir(link));
    }
    Fs.dirname = dirname;
    function dir(link) {
        if (!link)
            return '';
        return path.dirname(link);
    }
    Fs.dir = dir;
    function exists(path) {
        if (!path)
            return false;
        return fs.existsSync(path);
    }
    Fs.exists = exists;
    function join(path1, path2) {
        return Fs.api.path.join(path1, path2);
    }
    Fs.join = join;
    function watchFile(link, callback) {
        let paths = Array.isArray(link) ? link : [link];
        paths.forEach(item => {
            if (item && exists(item)) {
                _watch(item, callback);
            }
        });
    }
    Fs.watchFile = watchFile;
    function _watch(path, caller) {
        fs.unwatchFile(path);
        //---
        let fwait = false;
        fs.watch(path, (event, filename) => {
            if (filename) {
                if (fwait)
                    return;
                fwait = setTimeout(() => {
                    fwait = false;
                }, 100);
                caller(filename, () => fs.unwatchFile(filename), event);
            }
        });
    }
    /**
     * Return true if folder is created or already exists otherwise false
     * @param path folder path to be created
     */
    function mkdir(path) {
        fs.mkdirSync(path);
        return fs.existsSync(path);
    }
    Fs.mkdir = mkdir;
    function write(path, data, callback) {
        path = format(path);
        //--
        let method = data;
        let text = data;
        if (typeof data !== 'string')
            text = '';
        if (callback)
            method = callback;
        else if (typeof data === 'function')
            method = data;
        else
            method = (err) => {
                if (err)
                    throw err;
            };
        fs.writeFile(path, text, method);
    }
    Fs.write = write;
    function writeSync(path, data = '') {
        return __awaiter(this, void 0, void 0, function* () {
            path = format(path);
            fs.writeFileSync(path, data);
        });
    }
    Fs.writeSync = writeSync;
    function watch(path, options) {
        return chokidar_1.default.watch(path, options);
    }
    Fs.watch = watch;
    function deleteFile(path) {
        fs.unlinkSync(path);
    }
    Fs.deleteFile = deleteFile;
    function isRelative(path) {
        path = format(path);
        return ['../', './', '/'].some(item => path.startsWith(item));
    }
    Fs.isRelative = isRelative;
    function fPath(path, cwd = __dirname) {
        return isRelative(path) ? Fs.join(cwd, path) : path;
    }
    Fs.fPath = fPath;
    function deleteFolder(link) {
        var _a;
        var content = files(link);
        //------
        if (content) {
            for (let i = 0; i < content.length; i++) {
                var filePath = join(link, content[i]);
                if ((_a = stats(filePath)) === null || _a === void 0 ? void 0 : _a.isFile())
                    deleteFile(filePath);
                else
                    deleteFolder(filePath);
            }
        }
        else
            return;
        fs.rmdirSync(link);
    }
    Fs.deleteFolder = deleteFolder;
    function createRel(basePath, path) {
        return Fs.api.path.relative(basePath, path);
    }
    Fs.createRel = createRel;
    /**
     * It creates a file or folder including all parent folders in they don't exist
     * @param base file path to be created
     * @param options PathOptions: `content` file content if path is a file; if set, will call `Fs.write`. `callback` this is the same as the callback used in `Fs.write` function
     *
     * @returns true if sucessful
     */
    function createPath(base, options = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            let ignore = options === null || options === void 0 ? void 0 : options.ignore;
            //--
            base = format(base);
            while (!exists(base)) {
                let dirname = dir(base);
                if (exists(dirname)) {
                    if (!exists(base)) {
                        if (ignore)
                            mkdir(base);
                        else {
                            if (base.endsWith('/'))
                                mkdir(base);
                            break;
                        }
                    }
                }
                else {
                    if (!(options === null || options === void 0 ? void 0 : options.ignore))
                        options.ignore = true;
                    yield createPath(dirname, options);
                }
            }
            if (options.content && !options.ignore)
                options.callack
                    ? write(base, options.content, options.callack)
                    : yield writeSync(base, options.content);
            return exists(base);
        });
    }
    Fs.createPath = createPath;
    function samePath(path1, path2) {
        return format(path1) === format(path2);
    }
    Fs.samePath = samePath;
    function unwatchFile(path) {
        let paths = Array.isArray(path) ? path : [path];
        paths.forEach(item => {
            if (item && exists(item))
                fs.unwatchFile(item);
        });
    }
    Fs.unwatchFile = unwatchFile;
    function content(path) {
        path = format(path);
        if (path && exists(path))
            return fs.readFileSync(path, 'utf-8');
    }
    Fs.content = content;
    function copy(from, to) {
        var _a;
        const title = name(from);
        if (exists(from)) {
            const type = stats(from);
            if (type === null || type === void 0 ? void 0 : type.isDirectory()) {
                mkdir(join(to, title));
                (_a = files(from)) === null || _a === void 0 ? void 0 : _a.forEach(item => {
                    const joined = join(from, item);
                    const des = join(to, title);
                    copy(joined, to);
                });
            }
            else if (type === null || type === void 0 ? void 0 : type.isFile()) {
                fs.copyFileSync(from, join(to, title));
            }
        }
    }
    Fs.copy = copy;
})(Fs || (exports.Fs = Fs = {}));
class Default {
    constructor(...props) {
        this._isSet = false;
        this.self = this;
    }
    init() { }
    get isSet() {
        return this._isSet;
    }
    set isSet(value) {
        if (value && !this.isSet) {
            this.init();
        }
        this._isSet = value;
    }
    throw(message, name) {
        const err = new Error(message);
        if (name)
            err.name = name;
        throw err;
    }
}
exports.Default = Default;
// var result = '';
// // Strip off the other directories from where the files share a place of storage
// basePath = format(basePath);
// path = format(path);
// const arr1 = basePath.split('/');
// const arr2 = path.split('/');
// const arr3 = basePath.split('/');
// const arr4 = path.split('/');
// var size = arr1.length < arr2.length ? arr2.length : arr1.length;
// // ===========
// for (let i = 0; i < size; i++) {
//     var temp1 = arr3[i];
//     var temp2 = arr4[i];
//     if (temp1 === temp2) {
//         arr2.shift();
//         arr1.shift();
//     }
//     else break;
// }
// let len = arr1.length;
// let dots = '';
// let pathB = arr2.join('/');
// if (len > 1) {
//     // console.log(len);
//     const size = len - 1;
//     for (let i = 0; i < size; i++) {
//         dots += '../';
//     }
//     result = dots + pathB;
// }
// else result = pathB;
// // ============
// return result;
