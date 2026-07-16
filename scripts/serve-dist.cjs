const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..', 'dist');
const port = Number(process.env.PORT || 8081);

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function send(response, file) {
  fs.readFile(file, (error, body) => {
    if (error) {
      response.writeHead(500);
      response.end('Unable to read preview file.');
      return;
    }
    response.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
    response.end(body);
  });
}

http.createServer((request, response) => {
  const url = new URL(request.url || '/', `http://localhost:${port}`);
  const decoded = decodeURIComponent(url.pathname);
  const requested = path.normalize(path.join(root, decoded));
  if (!requested.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  const file = fs.existsSync(requested) && fs.statSync(requested).isFile()
    ? requested
    : fs.existsSync(path.join(requested, 'index.html'))
      ? path.join(requested, 'index.html')
      : path.join(root, 'index.html');
  send(response, file);
}).listen(port, '127.0.0.1', () => {
  console.log(`SmartLife preview running at http://localhost:${port}`);
});
