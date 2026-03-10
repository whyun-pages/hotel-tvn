import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let config = {};
try {
  config = await import('schedule-config.json', {
    with: {
      type: 'json',
    },
  });
} catch (_error) {
  console.warn('读取 schedule-config.json 失败');
}
const saveDir = config.liveResultDir || __dirname;
const livesTxtPath = path.join(saveDir, 'lives.txt');
const livesM3uPath = path.join(saveDir, 'lives.m3u');

const server = http.createServer((req, res) => {
  const url = req.url;
  if (url === '/lives.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    fs.createReadStream(livesTxtPath).pipe(res);
  } else if (url === '/lives.m3u') {
    res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
    fs.createReadStream(livesM3uPath).pipe(res);
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