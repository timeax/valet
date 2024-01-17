#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const program = new commander_1.Command();
const utilities_1 = require("@timeax/utilities");
const attrs = {
    domain: '',
    path: ''
};
const manager = {
    _hosts: 'C:/Windows/System32/drivers/etc/hosts',
    _vhosts: "C:/xampp/apache/conf/extra/httpd-vhosts.conf",
    get hosts() {
        return utilities_1.Fs.content(this._hosts) || '';
    },
    get vhosts() {
        return utilities_1.Fs.content(this._vhosts) || '';
    },
    set hosts(value) {
        utilities_1.Fs.writeSync(this._hosts, value);
    },
    set vhosts(value) {
        utilities_1.Fs.writeSync(this._vhosts, value);
    }
};
function write() {
    writeVHost();
    addHost();
    console.log('Created successfully');
}
function createId() {
    let id = `## domain: ${attrs.domain}----`;
    return {
        start: id,
        end: id + '####'
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
        console.log('Virtual host already exists');
}
function addHost() {
    let content = manager.hosts;
    const id = createId();
    //---
    if (!content?.includes(id.start)) {
        content += append(`127.0.0.1    ${attrs.domain}`);
        manager.hosts = content;
        console.log('Written to path: ' + manager._hosts);
        console.log('Content: ' + content);
    }
    else
        console.log('Virtual host already exists');
}
function createVirtualHost() {
    return `<VirtualHost *:80>
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
    list.forEach(item => {
        let content = utilities_1.Fs.content(item);
        const [start, end] = [content.indexOf(id), content.indexOf(idEnd)];
        if (start > -1 && end > start) {
            console.log('Deleted content: ' + content.slice(start, end + idEnd.length));
            content = content.replace(content.slice(start, end + idEnd.length), '');
            utilities_1.Fs.writeSync(item, content);
        }
    });
}
function createDomain(name, domain) {
    if (domain)
        return domain;
    if (name.match(/^(?:https?:\/\/)?(?:[^.]+\.)?example\.com(\/.*)?$/))
        return name;
    return name + '.test';
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
}
function update(props) {
    let path = props.path || process.cwd();
    set(createDomain(utilities_1.Fs.dirname(path), props.domain), path);
    //---------
    let { start: id, end: idEnd } = createId();
    const host = manager.hosts, vhosts = manager.vhosts;
    [{ path: manager._hosts, content: host, name: 'hosts' }, { path: manager._vhosts, content: vhosts, name: 'vhosts' }].forEach(({ content, path, name }) => {
        if (content.includes(id)) {
            const [start, end] = [content.indexOf(id), content.indexOf(idEnd) + idEnd.length];
            const scrape = content.slice(start, end);
            //--------
            manager[name] = content.replace(scrape, append(name === 'vhosts' ? createVirtualHost() : `127.0.0.1    ${attrs.domain}`));
        }
        else
            install(props);
    });
}
function listDomains(props) {
    if (props.f) {
    }
    if (props.m) {
    }
    const list = [];
    let { hosts, vhosts } = manager;
    let matches = vhosts.match(/\#\#\s+?domain:\s+?[^\n]*---(-(?!\#))/gm);
    let domains = {};
    if (Array.isArray(matches)) {
        matches.forEach(item => {
            const name = item.match(/(?<=(\#\#\sdomain:))\s([^\s]*(?=(----)))/gm)?.[0]?.trim();
            if (name) {
                attrs.domain = name;
                const { start: id, end: closingID } = createId();
                //---
                const content = vhosts.slice(vhosts.indexOf(id), vhosts.indexOf(closingID) + closingID.length);
                const { alias, directory, serverPort, dns, } = extract(hosts.indexOf(id) > -1 ? hosts.slice(hosts.indexOf(id) + id.length, hosts.indexOf(closingID)) : '', content, name);
                domains[name] = {
                    alias,
                    directory,
                    serverPort,
                    dns
                };
            }
        });
        const table = Object.keys(domains).map(item => {
            return {
                Name: item,
                ServerAlias: domains[item].alias,
                Directory: domains[item].directory,
                DNS: domains[item].dns,
                Port: domains[item].serverPort
            };
        });
        console.log('\n\nList Of Installed Domains');
        console.table(table);
    }
}
program
    .name('hs')
    .version('0.0.2')
    .description('Valet for Windows');
program
    .command('list')
    .description('Get a full list of a installed domains')
    .option('-f, --format')
    .option('-m, --modify')
    .action(listDomains);
program
    .command('install')
    .description('Install a local domain on your system')
    .option('-d, --domain <domainName>')
    .option('-p, --path <filepath>')
    .action(install);
program
    .command('update')
    .description('update a local domain on your system')
    .option('-d, --domain <domainName>')
    .option('-p, --path <filepath>')
    .action(update);
program
    .command('i')
    .description('Install a local domain on your system')
    .option('-d, --domain <domainName>')
    .option('-p, --path <filepath>')
    .action(install);
program
    .command('del')
    .description('Deletes virtual host')
    .option('-d, --domain <domain>', '-p, --path <path>')
    .action((props) => {
    if (props) {
        let path = props.path || process.cwd(), domain = createDomain(utilities_1.Fs.dirname(path), props.domain);
        attrs.domain = domain;
        attrs.path = path;
        deleteHost();
        console.log('deleted sucessfully');
    }
});
program.parse(process.argv);
function extract(hosts, content, name) {
    let port = content.match(/<VirtualHost\s+?[^\>]*>/gm)?.[0];
    if (port)
        port = port.replace(/<VirtualHost\s+?/gm, '').replace('>', '');
    let alias = content.match(/ServerAlias\s+[^\n]*/gm)?.[0];
    if (alias)
        alias = alias.replace(/ServerAlias\s+?/, '')?.trim();
    let path = content.match(/DocumentRoot\s+[^\n]*/gm)?.[0];
    if (path)
        path = path.replace(/DocumentRoot\s+?[^"]*"/gm, '').replace('"', '').trim();
    let dns = hosts.replace(new RegExp(`\\s+?${name}[^\n]*`), '')?.trim();
    return { alias, directory: path, serverPort: port, dns };
}
