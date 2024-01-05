"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Default = void 0;
const __1 = require("..");
class Default {
    constructor(...props) {
        this._self = this;
        this.isSet = false;
    }
    init() {
    }
    get self() {
        return this._self;
    }
    main(props) {
    }
    run(...props) {
    }
    static Create(props, ...args) {
        return new props(args);
    }
    static getClass() {
        const obj = new this();
        const { name } = obj.constructor;
        const classObj = eval(name);
        return {
            createInstance: () => obj,
            getCaller: () => this,
            getName: () => name,
            getFields: () => classObj.getFields(),
            getMethods: () => classObj.getMethods(),
            constructor: () => obj.constructor,
        };
    }
    getClass() {
        const { name } = this.constructor;
        return {
            //@ts-ignore
            createInstance: (() => new this.constructor()),
            getCaller: () => this,
            getName: () => name,
            getFields: this.getFields,
            getMethods: this.getMethods,
            constructor: () => this.constructor,
        };
    }
    get clone() {
        const clone = this.getClass().createInstance();
        //Copy values 
        this.getFields().forEach(field => {
            const fields = clone.getFields();
            const item = fields.find(prop => prop.name === field.name);
            if ((0, __1.is)(item).null)
                clone[field.name] = field.value;
            else
                item.set(field.value);
        });
        this.getMethods().forEach(method => {
            const methods = clone.getFields();
            const item = methods.find(prop => prop.name === method.name);
            if ((0, __1.is)(item).null)
                clone[method.name] = method.value;
            else
                item.set(method.value);
        });
        return this;
    }
    getFields() {
        const fields = [];
        for (const key in this) {
            if (Object.prototype.hasOwnProperty.call(this, key)) {
                const value = this[key];
                if (typeof value !== 'function')
                    fields.push({ name: key, value: value, set: (val) => this[key] = val });
            }
        }
        return fields;
    }
    throw(message, name = undefined, type = undefined) {
        throw new CustomError(message, name);
    }
    getMethods() {
        const methods = [];
        for (const key in this) {
            if (Object.prototype.hasOwnProperty.call(this, key)) {
                //@ts-ignore
                const value = this[key];
                //@ts-ignore
                if (typeof value === 'function')
                    methods.push({ name: key, value: value, set: (val) => this[key] = val.bind(this), call: (...props) => value.call(this, props) });
            }
        }
        return methods;
    }
    static getFields() {
        return [];
    }
    static getMethods(obj) {
        return [];
    }
    listenFor(value, callback) {
        let watched = this[value];
        const watch = setInterval(() => {
            if ((0, __1.is)(value).notNull) {
                if (this[value] == value) {
                    clearInterval(watch);
                    callback(watch);
                }
            }
            else {
                if (this[value] !== watched) {
                    watched = this[value];
                    callback(watch, watched);
                }
            }
        }, 1);
        return {
            stop: function () {
                clearInterval(watch);
            }
        };
    }
    get isSet() {
        return this._isSet;
    }
    set isSet(value) {
        if (value) {
            this._isSet = value;
            this.init();
        }
    }
}
exports.Default = Default;
class CustomError extends Error {
    constructor(msg, name) {
        super(msg);
        this.name = name ? name : super.name;
    }
}
