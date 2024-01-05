/// <reference types="node" />
/// <reference types="node" />
import * as fs from 'fs';
import * as path from 'path';
import chokidar from 'chokidar';
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
    uppercase(): boolean;
}
export declare namespace util {
    /**
     * Function for validating variables
     */
    export function is<T>(prop: T): ValidationObj<T>;
    /**
     * Ckecks whether or not the parameter is `null` or `undefined`
     * @param prop
     * @returns boolean
     */
    export function unset(prop: any): prop is undefined;
    /**
     *
     * @param prop object
     * @returns A copy of the same object
     */
    export function copyObj<T>(prop: T, deepCopy?: boolean): T;
    /**
     * Checks if value is empty as follows
     * - `string`: true if it is empty - ignores whitespace
     * - `number`: true if number is less than or equal to 0
     * - `falsey`: true
     * - `object`: true if `Object.keys(args).length <= 0`
     * returns true if error occurs
     * @param args
     */
    export function isEmpty<T>(args: T): boolean | undefined;
    /**
     * Runs JSON.parse on string and returns corresponding object
     * @param json valid JSON string
     * @throws Error if JSON string is not valid
     */
    export function getObj<T>(json: string): T;
    type Avoid<T> = {
        then<E>(callback: <E>(err: undefined, value: T) => void): E | undefined;
    } | {
        then<E>(callback: <E>(err: Error, value: undefined) => void): E | undefined;
    };
    export function avoid<T extends any>(e: () => T): Avoid<T>;
    export {};
}
export declare namespace Fs {
    export const api: {
        fs: typeof fs;
        path: path.PlatformPath;
    };
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
    export function format(path: string, options?: FormatOptions): string;
    /**
     * Returns an Array of all direct files and folders within this path
     * @param path path to folder
     */
    export function files(path: string, absolute?: boolean): string[] | undefined;
    export function isDir(path: string): boolean;
    export function stats(path: string): fs.Stats | undefined;
    export function name(filepath: string, ext?: string): string;
    export function ext(filepath: string): string;
    export function dirname(link: string): string;
    export function dir(link: string): string;
    export function exists(path: string): boolean;
    export function join(path1: string, path2: string): string;
    export function watchFile(link: string | string[], callback: (path: string, stop: Function, event: fs.WatchEventType) => void): void;
    /**
     * Return true if folder is created or already exists otherwise false
     * @param path folder path to be created
     */
    export function mkdir(path: string): boolean;
    type WriteCallback = (err: any) => void;
    export function write(path: string, data?: string | WriteCallback, callback?: WriteCallback): void;
    export function writeSync(path: string, data?: any): void;
    export function watch(path: string | string[], options?: chokidar.WatchOptions): chokidar.FSWatcher;
    export function deleteFile(path: string): void;
    export function deleteFolder(link: string): void;
    export function createRel(basePath: string, path: string): string;
    interface PathOptions {
        content?: string;
        callack?(err: any): void;
        [x: string]: any;
    }
    /**
     * It creates a file or folder including all parent folders in they don't exist
     * @param base file path to be created
     * @param options PathOptions: `content` file content if path is a file; if set, will call `Fs.write`. `callback` this is the same as the callback used in `Fs.write` function
     *
     * @returns true if sucessful
     */
    export function createPath(base: string, options?: PathOptions): boolean;
    export function samePath(path1: string, path2: string): boolean;
    export function unwatchFile(path: string | string[]): void;
    export function content(path: string): string | undefined;
    export function copy(from: string, to: string): void;
    export {};
}
export declare class Default {
    self: this;
    constructor(...props: any[]);
    init(): void;
    private _isSet;
    get isSet(): boolean;
    set isSet(value: boolean);
    throw(message: string, name?: string): void;
}
export {};
