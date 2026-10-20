const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('apps/mobile/dist-qa');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};
http
  .createServer((req, res) => {
    let name;
    try {
      name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep) && file !== root) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory())
      file = path.join(file, 'index.html');
    if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    if (!fs.existsSync(file)) {
      const directory = path.dirname(file);
      if (fs.existsSync(directory)) {
        const template = fs.readdirSync(directory).find(entry => /^\[[^\]]+\]\.html$/.test(entry));
        if (template) file = path.join(directory, template);
      }
    }
    if (!fs.existsSync(file)) file = path.join(root, 'index.html');
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    const stream = fs.createReadStream(file);
    stream.on('error', () => {
      res.writeHead(404).end();
    });
    stream.pipe(res);
  })
  .listen(8085, '127.0.0.1', () => console.log('QA mobile static server: 8085'));
