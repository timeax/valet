export declare function watchPropChange(key: [] | any, callback: Function, value?: any): {
    stop: () => void;
};
export declare function is(el: any): {
    array: boolean;
    null: boolean;
    emptyArray: number | boolean;
    blockElement: (args?: boolean) => boolean;
    closingEl: () => boolean;
    notEmptyArr: number | boolean;
    notNull: boolean;
    equal: (args: any) => boolean;
    NaN: () => boolean;
    isCap(): boolean;
};
export declare function avoid(e: Function): {
    then: (r: Function) => void;
};
export declare function isFalse(args: any): boolean;
export declare function isUndefined(args: any): boolean;
export declare function parseBoolean(text: string): boolean;
export declare function copyOBJ(obj: object): any;
export declare function getObj(objstring: string): any;
export declare function isEmpty(args: any): boolean;
export declare function timer(callback: (timer?: number) => any, timer?: number, type?: 0 | 1): {
    stop: () => void;
};
export declare function wait(callback: (...props: any) => boolean, ...args: any[]): Promise<any>;
export { Fs } from './modules';
export { Default } from './modules/default';
