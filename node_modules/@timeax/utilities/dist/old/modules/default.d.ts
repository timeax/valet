export declare class Default {
    private _isSet;
    private _self;
    constructor(...props: any[]);
    init(): void;
    get self(): this;
    main(props?: any): void;
    run(...props: any[]): void;
    static Create(props: any, ...args: any[]): any;
    static getClass(): ClassProps;
    getClass(): ClassProps;
    get clone(): this;
    private getFields;
    throw(message: string, name?: string, type?: string): void;
    private getMethods;
    private static getFields;
    private static getMethods;
    listenFor(value: string, callback: (timer?: any, value?: any) => any): {
        stop: () => void;
    };
    get isSet(): boolean;
    set isSet(value: boolean);
}
export interface Default {
    getClass: () => ClassProps;
}
interface ClassProps {
    getName: () => string;
    getFields: () => Array<Fields>;
    getMethods: () => Array<Methods>;
    toString: () => string;
    constructor: () => ConstructorObj;
    getCaller: () => any;
    createInstance: () => any;
}
interface Fields {
    name: string;
    value: string;
    set: (value: any) => any;
}
interface Methods {
    args: any[];
    name: string;
    value: string;
    call: () => any;
    set: (value: Function) => any;
}
interface ConstructorObj {
}
export {};
