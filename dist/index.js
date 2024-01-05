#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const program = new commander_1.Command();
const utilities_1 = require("@timeax/utilities");
const files = {
    hosts: 'C:/Windows/System32/drivers/etc/hosts',
    xampp: "C:/xampp/apache/conf/extra/httpd-vhosts.conf",
    v3: "C:/xampp/apache/v3.ext"
};
const attrs = {
    domain: '',
    path: ''
};
function write() {
    writeVHost(files.xampp);
    addHost(files.hosts);
    console.log('Created successfully');
}
function createId(end = false) {
    return `## domain: ${attrs.domain}----${end ? '####' : ''}`;
}
function writeVHost(file) {
    let content = utilities_1.Fs.content(file) || '';
    const id = createId();
    //---
    if (!content?.includes(id)) {
        content += append(createVirtualHost());
        utilities_1.Fs.writeSync(file, content);
    }
    else
        console.log('Virtual host already exists');
}
function addHost(file) {
    let content = utilities_1.Fs.content(file) || '';
    const id = createId();
    //---
    if (!content?.includes(id)) {
        content += append(`127.0.0.1    ${attrs.domain}`);
        utilities_1.Fs.writeSync(file, content);
        console.log('Written to path: ' + file);
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
    const list = [files.hosts, files.xampp];
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
program
    .name('valet')
    .version('0.0.1')
    .description('Valet for Windows');
program
    .command('start')
    .description('Start Program')
    .option('-d, --domain <domainName>')
    .option('-p, --path <filepath>')
    .action((props) => {
    let path = props.path || process.cwd(), domain = createDomain(utilities_1.Fs.dirname(path), props.domain);
    // write(domain);
    attrs.domain = domain;
    attrs.path = path;
    write();
});
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
