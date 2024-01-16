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
    _xampp: "C:/xampp/apache/conf/extra/httpd-vhosts.conf",
    get hosts() {
        return utilities_1.Fs.content(this.hosts) || '';
    },
    get xampp() {
        return utilities_1.Fs.content(this.xampp) || '';
    },
    set hosts(value) {
        utilities_1.Fs.writeSync(this.hosts, value);
    },
    set xampp(value) {
        utilities_1.Fs.writeSync(this.xampp, value);
    }
};
function write() {
    writeVHost();
    addHost();
    console.log('Created successfully');
}
function createId(end = false) {
    return `## domain: ${attrs.domain}----${end ? '####' : ''}`;
}
function writeVHost() {
    let content = manager.hosts;
    const id = createId();
    //---
    if (!content?.includes(id)) {
        content += append(createVirtualHost());
        manager.hosts = content;
        console.log(content);
    }
    else
        console.log('Virtual host already exists');
}
function addHost() {
    let content = manager.xampp;
    const id = createId();
    //---
    if (!content?.includes(id)) {
        content += append(`127.0.0.1    ${attrs.domain}`);
        manager.xampp = content;
        console.log('Written to path: ' + manager._xampp);
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
    return `\n\n${createId()}\n${content}\n${createId(true)}`;
}
function deleteHost() {
    let id = createId();
    let idEnd = createId(true);
    const list = [manager._hosts, manager._xampp];
    list.forEach(item => {
        let content = utilities_1.Fs.content(item);
        const [start, end] = [content.indexOf(id), content.indexOf(idEnd)];
        if (start > -1 && end > start) {
            console.log('Deleted content: ' + content.slice(start - id.length, end));
            content = content.replace(content.slice(start - id.length, end), '');
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
    let id = createId();
    let idEnd = createId(true);
    const vhost = manager.hosts, xampp = manager.xampp;
    [{ path: manager._hosts, content: vhost, name: 'hosts' }, { path: manager._xampp, content: xampp, name: 'xampp' }].forEach(({ content, path, name }) => {
        if (content.includes(id)) {
            const [start, end] = [content.indexOf(id), content.indexOf(idEnd)];
            const scrape = content.slice(start - id.length, end);
            //--------
            manager[name] = content.replace(scrape, append(name === 'hosts' ? createVirtualHost() : `127.0.0.1    ${attrs.domain}`));
        }
        else
            install(props);
    });
}
program
    .name('hs')
    .version('0.0.2')
    .description('Valet for Windows');
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
