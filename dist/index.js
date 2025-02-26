#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const commander_1 = require("commander");
const program = new commander_1.Command();
const utilities_1 = require("@timeax/utilities");
const color_1 = __importDefault(require("./color"));
const media_1 = require("./media");
function restartServer() {
    (0, child_process_1.exec)('httpd -k restart -n "Apache2.4"', (err) => {
        if (err)
            return console.log(err.message);
        console.log("Apache restarted");
    });
}
const attrs = {
    domain: "",
    path: "",
};
const manager = {
    get _hosts() {
        let def = process.env.HOSTS || "C:/Windows/System32/drivers/etc/hosts";
        const drive = process.env.HOSTS ? null : process.env.DRIVE;
        ///---
        if (drive)
            def = drive + def.substring(1);
        //---
        return def;
    },
    get _vhosts() {
        let def = process.env.VP || "D:/xampp/apache/conf/extra/httpd-vhosts.conf";
        const drive = process.env.VP ? null : process.env.VD;
        ///---
        if (drive)
            def = drive + def.substring(1);
        return def;
    },
    get hosts() {
        return utilities_1.Fs.content(this._hosts) || "";
    },
    get vhosts() {
        return utilities_1.Fs.content(this._vhosts) || "";
    },
    set hosts(value) {
        utilities_1.Fs.writeSync(this._hosts, value);
    },
    set vhosts(value) {
        utilities_1.Fs.writeSync(this._vhosts, value);
    },
};
(0, color_1.default)(program);
function write() {
    writeVHost();
    addHost();
    console.log("Created successfully");
}
function createId() {
    let id = `## domain: ${attrs.domain}----`;
    return {
        start: id,
        end: id + "####",
    };
}
function writeVHost() {
    let content = manager.vhosts;
    const { start: id } = createId();
    console.log(content);
    //---
    if (!content?.includes(id)) {
        content += append(createVirtualHost());
        manager.vhosts = content;
        console.log(content);
    }
    else
        console.log("Virtual host already exists");
}
function addHost() {
    let content = manager.hosts;
    const id = createId();
    //---
    if (!content?.includes(id.start)) {
        content += append(`127.0.0.1    ${attrs.domain}`);
        manager.hosts = content;
        console.log("Written to path: " + manager._hosts);
        console.log("Content: " + content);
    }
    else
        console.log("Virtual host already exists");
}
function createVirtualHost() {
    return `<VirtualHost ${attrs.domain}>
    DocumentRoot "${attrs.path}"
    ServerName ${attrs.domain}
    ServerAlias *.${attrs.domain}

    <Directory "${attrs.path}">
        Require local
    </Directory>
</VirtualHost>`;
}
function append(content) {
    const id = createId();
    return `\n\n${id.start}\n${content}\n${id.end}`;
}
function deleteHost() {
    let { start: id, end: idEnd } = createId();
    const list = [manager._hosts, manager._vhosts];
    list.forEach((item) => {
        let content = utilities_1.Fs.content(item);
        const a = new RegExp(id), b = new RegExp(idEnd);
        console.log(a.exec(content), id);
        const [start, end] = [a.exec(content).index, b.exec(content).index];
        if (start > -1 && end > start) {
            console.log("Deleted content: " + content.slice(start, end + idEnd.length));
            content = content.replace(content.slice(start, end + idEnd.length), "");
            utilities_1.Fs.writeSync(item, content);
        }
    });
}
function createDomain(name, domain) {
    if (domain)
        return domain;
    if (name.match(/^(?:https?:\/\/)?(?:[^.]+\.)?example\.com(\/.*)?$/))
        return name;
    return name + ".test";
}
function set(domain, path) {
    attrs.domain = domain;
    attrs.path = path;
}
function install(props) {
    // write(domain);
    let path = props.path || process.cwd();
    set(createDomain(utilities_1.Fs.dirname(path), props.domain), path);
    write();
    restartServer();
}
function update(props) {
    let path = props.path || process.cwd();
    set(createDomain(utilities_1.Fs.dirname(path), props.domain), path);
    //---------
    let { start: id, end: idEnd } = createId();
    const host = manager.hosts, vhosts = manager.vhosts;
    [
        { path: manager._hosts, content: host, name: "hosts" },
        { path: manager._vhosts, content: vhosts, name: "vhosts" },
    ].forEach(({ content, path, name }) => {
        if (content.includes(id)) {
            const [start, end] = [
                content.indexOf(id),
                content.indexOf(idEnd) + idEnd.length,
            ];
            const scrape = content.slice(start, end);
            //--------
            manager[name] = content.replace(scrape, append(name === "vhosts"
                ? createVirtualHost()
                : `127.0.0.1    ${attrs.domain}`));
        }
        else
            install(props);
    });
    restartServer();
}
function del(props) {
    if (props) {
        let path = props.path || process.cwd(), domain = createDomain(utilities_1.Fs.name(path), props.domain.join(" "));
        attrs.domain = domain;
        attrs.path = path;
        deleteHost();
        restartServer();
        console.log("deleted sucessfully");
    }
}
function parse(num) {
    return num
        .map((item) => parseInt(item.trim()))
        .filter((item) => typeof item == "number");
}
function getNumbers(num) {
    num = num.trim();
    if (num.includes(",")) {
        return parse(num.split(","));
    }
    return parse([num]);
}
async function listDomains(props) {
    const { default: { prompt }, } = await import("inquirer");
    let deleteIndex = [];
    let formatIndex = [];
    if (props.remove)
        props.remove.forEach((item) => deleteIndex.push(...getNumbers(item)));
    if (props.format)
        props.format.forEach((item) => formatIndex.push(...getNumbers(item)));
    let table = getTable();
    if (table) {
        if (formatIndex.length > 0) {
            for (let item of formatIndex) {
                if (item < 0)
                    item = table.length + item;
                //-----------
                const row = table[item];
                if (!row)
                    continue;
                const modal = await prompt([
                    {
                        name: "modify",
                        message: `Are you sure you want to modify ${row.Name} in ${row.Directory}`,
                        type: "confirm",
                    },
                ]);
                if (modal.modify) {
                    const modal = await prompt([
                        {
                            name: "domain",
                            message: `Enter Domain name`,
                            type: "input",
                            default: row.Name,
                        },
                        {
                            name: "alias",
                            message: `Enter Server Alias`,
                            type: "input",
                            default: row.ServerAlias,
                        },
                        {
                            name: "path",
                            message: `Root Directory (relative paths are valid)`,
                            type: "input",
                            default: row.Directory,
                        },
                        {
                            name: "dns",
                            message: `Enter new DNS`,
                            type: "input",
                            default: row.DNS,
                        },
                        {
                            name: "port",
                            message: `Enter Port`,
                            type: "input",
                            default: row.Port,
                        },
                    ]);
                    modify(modal);
                    table = getTable();
                }
            }
        }
        if (deleteIndex.length > 0) {
            for (let item of deleteIndex) {
                if (item < 0)
                    item = table.length + item;
                const row = table[item];
                if (!row)
                    continue;
                const modal = await prompt([
                    {
                        name: "delete",
                        message: `Are you sure you want to delete ${row.Name} in ${row.Directory}`,
                        type: "confirm",
                    },
                ]);
                if (modal.delete)
                    del({ domain: [row.Name], path: row.Directory });
            }
            table = getTable();
        }
        console.log("\n\nList Of Installed Domains");
        console.table(table);
    }
    else
        console.log("No records found");
    console.log(`\nSee hosts file at -> ${manager._hosts}`);
    console.log(`\nSee vhosts file at -> ${manager._vhosts}`);
}
program.name("web").version("0.0.2").description("Web Development Utility CMD Interface");
(0, media_1.mediaQuery)(program);
program
    .command("list")
    .description("Get a full list of a installed domains")
    .option("-f, --format <id...>")
    .option("-rm, --remove <id...>")
    .action(listDomains);
program
    .command("l")
    .description("Get a full list of a installed domains")
    .option("-f, --format <id...>")
    .option("-rm, --remove <id...>")
    .action(listDomains);
program
    .command("install")
    .description("Install a local domain on your system")
    .option("-d, --domain <domainName>")
    .option("-p, --path <filepath>")
    .action(install);
program
    .command("update")
    .description("update a local domain on your system")
    .option("-d, --domain <domainName>")
    .option("-p, --path <filepath>")
    .action(update);
program
    .command("i")
    .description("Install a local domain on your system")
    .option("-d, --domain <domainName>")
    .option("-p, --path <filepath>")
    .action(install);
program
    .command("del")
    .description("Deletes virtual host")
    .option("-d, --domain <domain...>", "-p, --path <path>")
    .action(del);
program.parse(process.argv);
function extract(hosts, content, name) {
    let port = content.match(/<VirtualHost\s+?[^\>]*>/gm)?.[0];
    if (port)
        port = port.replace(/<VirtualHost\s+?/gm, "").replace(">", "");
    let alias = content.match(/ServerAlias\s+[^\n]*/gm)?.[0];
    if (alias)
        alias = alias.replace(/ServerAlias\s+?/, "")?.trim();
    let path = content.match(/DocumentRoot\s+[^\n]*/gm)?.[0];
    if (path)
        path = path
            .replace(/DocumentRoot\s+?[^"]*"/gm, "")
            .replace('"', "")
            .trim();
    let dns = hosts.replace(new RegExp(`\\s+?${name}[^\n]*`), "")?.trim();
    return { alias, directory: path, serverPort: port, dns };
}
function modify(modal) {
    // throw new Error("Function not implemented.");
}
function getTable() {
    let { hosts, vhosts } = manager;
    let matches = vhosts.match(/\#\#\s+?domain:\s+?[^\n]*---(-(?!\#))/gm);
    let domains = {};
    if (Array.isArray(matches)) {
        matches.forEach((item) => {
            const name = item
                .match(/(?<=(\#\#\sdomain:))\s([^\n]*(?=(----)))/gm)?.[0]
                ?.trim();
            if (name) {
                attrs.domain = name;
                const { start: id, end: closingID } = createId();
                //---
                const content = vhosts.slice(vhosts.indexOf(id), vhosts.indexOf(closingID) + closingID.length);
                const { alias, directory, serverPort, dns } = extract(hosts.indexOf(id) > -1
                    ? hosts.slice(hosts.indexOf(id) + id.length, hosts.indexOf(closingID))
                    : "", content, name);
                domains[name] = {
                    alias,
                    directory,
                    serverPort,
                    dns,
                };
            }
        });
        return Object.keys(domains).map((item) => {
            return {
                Name: item,
                ServerAlias: domains[item].alias,
                Directory: domains[item].directory,
                DNS: domains[item].dns,
                Port: domains[item].serverPort,
                Url: `http://${item}/`,
            };
        });
    }
}
