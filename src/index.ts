#!/usr/bin/env node

import { Command } from 'commander';
const program = new Command();

import { Fs } from "@timeax/utilities"

const files = {
    hosts: 'C:/Windows/System32/drivers/etc/hosts',
    xampp: "C:/xampp/apache/conf/extra/httpd-vhosts.conf",
    v3: "C:/xampp/apache/v3.ext"
}

const attrs = {
    domain: '',
    path: ''
}

function write() {
    writeVHost(files.xampp);
    addHost(files.hosts);

    console.log('Created successfully')
}

function createId(end: boolean = false) {
    return `## domain: ${attrs.domain}----${end ? '####' : ''}`;
}

function writeVHost(file: string) {
    let content = Fs.content(file) || '';
    const id = createId();
    //---
    if (!content?.includes(id)) {
        content += append(createVirtualHost());
        Fs.writeSync(file, content);
    }

    else console.log('Virtual host already exists')
}
function addHost(file: string) {
    let content = Fs.content(file) || '';
    const id = createId();
    //---
    if (!content?.includes(id)) {
        content += append(`127.0.0.1    ${attrs.domain}`);

        Fs.writeSync(file, content);

        console.log('Written to path: ' + file)
        console.log('Content: ' + content)
    }

    else console.log('Virtual host already exists')
}


function createVirtualHost() {
    return `<VirtualHost *:80>
    DocumentRoot "${attrs.path}"
    ServerName ${attrs.domain}
    ServerAlias *.${attrs.domain}

    <Directory "${attrs.path}">
        Require local
    </Directory>
</VirtualHost>`
}

function append(content: string) {
    return `\n\n${createId()}\n${content}\n${createId(true)}`
}

function deleteHost() {
    let id = createId();
    let idEnd = createId(true);
    const list = [files.hosts, files.xampp];

    list.forEach(item => {
        let content = Fs.content(item);
        const [start, end] = [content.indexOf(id), content.indexOf(idEnd)];

        if (start > -1 && end > start) {
            console.log('Deleted content: ' + content.slice(start - id.length, end))
            content = content.replace(content.slice(start - id.length, end), '');
            Fs.writeSync(item, content)
        }
    })
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
        let
            path = props.path || process.cwd(),
            domain = props.domain || Fs.dirname(path) + '.loc';
        // write(domain);
        attrs.domain = domain;
        attrs.path = path;

        write()
    });

program
    .command('del')
    .description('Deletes virtual host')
    .option('-d, --domain <domain>')
    .action((props) => {
        if (props) {
            attrs.domain = props.domain || Fs.dirname(process.cwd()) + '.local';
            deleteHost();

            console.log('deleted sucessfully')
        }
    })

program.parse(process.argv);