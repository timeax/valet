import * as fs from 'fs';
import * as path from 'path';
import chokidar from 'chokidar';
import { isProxy } from 'util/types';

interface ValidationObj<T = any> {
    prop: T;
    readonly array: boolean;
    /**
         * 
         * @param param - element to be compared
         * @param strict - boolean - set to true to compare elements of an object. default is false
         * @returns boolean
         */
    equal(param: any, strict?: boolean): boolean;
    uppercase(): boolean
}

export namespace util {
    const isObj: ValidationObj = {
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
        equal(param: any, strict?: boolean): boolean {
            const prop = this.prop;
            if (!strict) return param === prop;
            //---
            if (Array.isArray(prop)) {
                if (Array.isArray(param)) {
                    return prop.every((item, i) => is(item).equal(param[i], strict))
                }
                return false;
            }

            if (typeof param === 'object' && param && typeof prop == 'object' && prop && !isProxy(prop)) {
                for (const key in param) {
                    if (Object.prototype.hasOwnProperty.call(param, key)) {
                        if (!(key in prop) || !is(param[key]).equal(prop[key])) return false;
                    }
                }
            }

            return param === prop;
        },
        uppercase() {
            return /^[A-Z]*$/.test((this.prop as string).charAt(0))
        },
    }
    /**
     * Function for validating variables 
     */
    export function is<T>(prop: T): ValidationObj<T> {
        isObj.prop = prop;
        return isObj;
    }

    /**
     * Ckecks whether or not the parameter is `null` or `undefined`
     * @param prop 
     * @returns boolean
     */
    export function unset(prop: any): prop is undefined {
        return prop === null || prop === undefined;
    }

    /**
     * 
     * @param prop object
     * @returns A copy of the same object
     */
    export function copyObj<T>(prop: T, deepCopy: boolean = false): T {
        if (typeof prop !== 'object' || !prop) return prop;
        if (!deepCopy)
            return JSON.parse(JSON.stringify(prop)) as T;
        else {
            if (isProxy(prop)) return prop;
            //--
            if (Array.isArray(prop)) return prop.map(item => copyObj(item)) as T;
            let obj = {} as any;
            for (const key in prop) {
                if (Object.prototype.hasOwnProperty.call(prop, key)) {
                    obj[key] = copyObj(prop[key]);
                }
            }
            return obj;
        }
    }
    /**
     * Checks if value is empty as follows
     * - `string`: true if it is empty - ignores whitespace
     * - `number`: true if number is less than or equal to 0
     * - `falsey`: true
     * - `object`: true if `Object.keys(args).length <= 0`
     * returns true if error occurs
     * @param args 
     */
    export function isEmpty<T>(args: T) {
        if (unset(args)) return true;
        try {
            if (typeof args == 'object') {
                if (Array.isArray(args)) return args.length === 0;
                if (Object.keys(args as object).length === 0) return false;
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
    /**
     * Runs JSON.parse on string and returns corresponding object
     * @param json valid JSON string
     * @throws Error if JSON string is not valid
     */
    export function getObj<T>(json: string): T {
        return JSON.parse(json);
    }

    type Avoid<T> = {
        then<E>(callback: <E> (err: undefined, value: T) => void): E | undefined
    } | {
        then<E>(callback: <E> (err: Error, value: undefined) => void): E | undefined
    }

    export function avoid<T extends any>(e: () => T): Avoid<T> {
        try {
            let value = e();
            return {
                then(callback: (err: undefined, value: T) => any) {
                    return callback(undefined, value)
                }
            }
        } catch (error: any) {
            return {
                then(callback: (err: Error, value: undefined) => any) {
                    return callback(error, undefined)
                }
            }
        }
    }
}

util.avoid<string>(() => {
    return ''
}).then((err, value) => {
    if (!err) value;
})

export namespace Fs {
    export const api = { fs, path };
    interface FormatOptions {
        slashType?: '/' | '\\';
        replaceWhitespaceSym: boolean;
    }

    /**
     * @description Removes file:/// and other string symbols like `/%20`
     * @param path path-like string
     * @param options FormatOptions: `slashType`: '/' or '\\',  `replaceWhitespaceSym`: boolean, default is true
     * @returns a clean path
     */
    export function format(path: string, options?: FormatOptions) {
        let slash = options?.slashType || '/', rwss = util.unset(options?.replaceWhitespaceSym) ? false : options?.replaceWhitespaceSym;
        //---
        let regex = new RegExp(slash == '/' ? '\\\\' : '/', 'g');
        path = path.replace('file:///', '');
        path = path.replace(regex, slash);
        if (rwss)
            path = path.replace(/%20/g, ' ');
        return path;
    }
    /**
     * Returns an Array of all direct files and folders within this path
     * @param path path to folder
     */
    export function files(path: string, absolute?: boolean) {
        if (!path) return;
        try {
            let files = fs.readdirSync(path);
            if (absolute) return files.map(item => format(join(path, item)));
            return files;
        } catch (e) {
            return;
        }
    }

    export function isDir(path: string) {
        try {
            return fs.statSync(path).isDirectory();
        } catch (error) {
            return false;
        }
    }

    export function stats(path: string) {
        try {
            const stats = fs.statSync(path);
            return stats;
        }
        catch (error) { }
    }

    export function name(filepath: string, ext?: string) {
        if (!filepath) return '';
        return path.basename(filepath, ext);
    }

    export function ext(filepath: string) {
        if (!filepath) return '';
        return path.extname(filepath);
    }

    export function dirname(link: string) {
        if (!link) return '';
        return name(dir(link));
    }

    export function dir(link: string) {
        if (!link) return '';
        return path.dirname(link)
    }

    export function exists(path: string) {
        if (!path) return false;
        return fs.existsSync(path);
    }

    export function join(path1: string, path2: string) {
        return api.path.join(path1, path2);
    }

    export function watchFile(link: string | string[], callback: (path: string, stop: Function, event: fs.WatchEventType) => void) {
        let paths = Array.isArray(link) ? link : [link];
        paths.forEach(item => {
            if (item && exists(item)) {
                _watch(item, callback);
            }
        });
    }

    function _watch(path: string, caller: any) {
        fs.unwatchFile(path);
        //---
        let fwait: any = false;
        fs.watch(path, (event, filename) => {
            if (filename) {
                if (fwait) return;

                fwait = setTimeout(() => {
                    fwait = false;
                }, 100);
                caller(filename, () => fs.unwatchFile(filename), event)
            }
        });
    }

    /**
     * Return true if folder is created or already exists otherwise false
     * @param path folder path to be created
     */
    export function mkdir(path: string) {
        fs.mkdirSync(path);
        return fs.existsSync(path)
    }
    type WriteCallback = (err: any) => void;
    export function write(path: string, data?: string | WriteCallback, callback?: WriteCallback) {
        path = format(path);
        //--
        let method = data as WriteCallback;
        let text: string = data as string;
        if (typeof data !== 'string') text = '';

        if (callback) method = callback as WriteCallback;
        else if (typeof data === 'function') method = data as WriteCallback;
        else method = (err) => {
            if (err) throw err
        }


        fs.writeFile(path, text, method)
    }

    export function writeSync(path: string, data: any = '') {
        path = format(path);
        fs.writeFileSync(path, data);
    }

    export function watch(path: string | string[], options?: chokidar.WatchOptions) {
        return chokidar.watch(path, options)
    }

    export function deleteFile(path: string) {
        fs.unlinkSync(path);
    }

    export function deleteFolder(link: string) {
        var content = files(link);
        //------
        if (content) {
            for (let i = 0; i < content.length; i++) {
                var filePath = join(link, content[i]);
                if (stats(filePath)?.isFile()) deleteFile(filePath);
                else deleteFolder(filePath);
            }
        } else return;

        fs.rmdirSync(link);
    }

    export function createRel(basePath: string, path: string) {
        return api.path.relative(basePath, path);
    }

    interface PathOptions {
        content?: string;
        callack?(err: any): void
        [x: string]: any
    }

    /**
     * It creates a file or folder including all parent folders in they don't exist
     * @param base file path to be created
     * @param options PathOptions: `content` file content if path is a file; if set, will call `Fs.write`. `callback` this is the same as the callback used in `Fs.write` function
     * 
     * @returns true if sucessful
     */
    export function createPath(base: string, options: PathOptions = {}) {
        let ignore = options?.ignore;
        //--
        base = format(base);
        while (!exists(base)) {
            let dirname = dir(base);
            if (exists(dirname)) {
                if (!exists(base)) {
                    if (ignore) mkdir(base);
                    else {
                        if (base.endsWith('/')) mkdir(base);
                        break;
                    }
                }
            } else {
                if (!options?.ignore) options.ignore = true;
                createPath(dirname, options);
            }
        }

        if (options.content && !options.ignore) options.callack
            ? write(base, options.content, options.callack)
            : writeSync(base, options.content);

        return exists(base);
    }

    export function samePath(path1: string, path2: string) {
        return format(path1) === format(path2);
    }

    export function unwatchFile(path: string | string[]) {
        let paths = Array.isArray(path) ? path : [path];
        paths.forEach(item => {
            if (item && exists(item)) fs.unwatchFile(item);
        })
    }

    export function content(path: string) {
        path = format(path);
        if (path && exists(path)) return fs.readFileSync(path, 'utf-8');
    }

    export function copy(from: string, to: string) {
        const title = name(from);
        if (exists(from)) {
            const type = stats(from);
            if (type?.isDirectory()) {
                mkdir(join(to, title));
                files(from)?.forEach(item => {
                    const joined = join(from, item);
                    const des = join(to, title);
                    copy(joined, to);
                })
            } else if (type?.isFile()) {
                fs.copyFileSync(
                    from,
                    join(to, title)
                )
            }
        }
    }
}

export class Default {
    self: this;
    constructor(...props: any[]) {
        this.self = this;
    }

    init() { }

    private _isSet = false;
    public get isSet() {
        return this._isSet;
    }
    public set isSet(value) {
        if (value && !this.isSet) {
            this.init()
        }
        this._isSet = value;
    }

    throw(message: string, name?: string) {
        const err = new Error(message);
        if (name) err.name = name;
        throw err;
    }
}


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