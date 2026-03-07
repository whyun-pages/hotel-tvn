import http from 'node:http';
import fs from 'node:fs';

const server = http.createServer((req, res) => {
  const url = req.url;
  if (url === '/lives.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    fs.createReadStream('../lives.txt').pipe(res);
  } else if (url === '/lives.m3u') {
    res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
    fs.createReadStream('../lives.m3u').pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
});

// 监听 3000 端口
const PORT = 3000;
server.listen(PORT, () => {
  // eslint-disable-next-line no-undef
  console.log(new Date().toLocaleString(), `服务器运行在 http://localhost:${PORT}/`);
});