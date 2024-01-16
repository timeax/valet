#!/usr/bin/env node

import { Command } from 'commander';
const program = new Command();

import { Fs } from "@timeax/utilities"


const attrs = {
    domain: '',
    path: ''
}

const manager = {
    _hosts: 'C:/Windows/System32/drivers/etc/hosts',
    _xampp: "C:/xampp/apache/conf/extra/httpd-vhosts.conf",
    get hosts() {
        return Fs.content(this.hosts) || '';
    },

    get xampp() {
        return Fs.content(this.xampp) || ''
    },

    set hosts(value: string) {
        Fs.writeSync(this.hosts, value);
    },
    set xampp(value: string) {
        Fs.writeSync(this.xampp, value);
    }
}

function write() {
    writeVHost();
    addHost();

    console.log('Created successfully')
}

function createId(end: boolean = false) {
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

    else console.log('Virtual host already exists')
}
function addHost() {
    let content = manager.xampp;
    const id = createId();
    //---
    if (!content?.includes(id)) {
        content += append(`127.0.0.1    ${attrs.domain}`);

        manager.xampp = content;

        console.log('Written to path: ' + manager._xampp)
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
    const list = [manager._hosts, manager._xampp];

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

function createDomain(name: string, domain?: string) {
    if (domain) return domain;
    if (name.match(/^(?:https?:\/\/)?(?:[^.]+\.)?example\.com(\/.*)?$/)) return name;
    return name + '.test';
}

function set(domain: string, path: string) {
    attrs.domain = domain;
    attrs.path = path;
}

function install(props) {
    // write(domain);
    let path = props.path || process.cwd();
    set(createDomain(Fs.dirname(path), props.domain), path);

    write()
}

function update(props) {
    let path = props.path || process.cwd();
    set(createDomain(Fs.dirname(path), props.domain), path);
    //---------
    let id = createId();
    let idEnd = createId(true);

    const vhost = manager.hosts, xampp = manager.xampp;

    ([{ path: manager._hosts, content: vhost, name: 'hosts' }, { path: manager._xampp, content: xampp, name: 'xampp' }] as const).forEach(({ content, path, name }) => {
        if (content.includes(id)) {
            const [start, end] = [content.indexOf(id), content.indexOf(idEnd)];
            const scrape = content.slice(start - id.length, end);
            //--------
            manager[name] = content.replace(scrape, append(name === 'hosts' ? createVirtualHost() : `127.0.0.1    ${attrs.domain}`))
        } else install(props);
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
            let path = props.path || process.cwd(),
                domain = createDomain(Fs.dirname(path), props.domain);

            attrs.domain = domain;
            attrs.path = path;

            deleteHost();

            console.log('deleted sucessfully')
        }
    })

program.parse(process.argv);