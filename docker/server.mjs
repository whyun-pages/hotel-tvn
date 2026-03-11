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
const url2StreamInfo = {
  '/lives.txt': {path: livesTxtPath, contentType: 'text/plain; charset=utf-8'},
  '/lives.m3u': {path: livesM3uPath, contentType: 'application/vnd.apple.mpegurl'},
}
async function sendFile(req, res, streamInfoMap = url2StreamInfo) {
  const url = req.url?.split('?')[0];
  const streamInfo = streamInfoMap[url];
  if (streamInfo) {
    const stats = await fs.promises.stat(streamInfo.path);
    const lastModified = stats.mtime.toUTCString();

    const ifModifiedSince = req.headers['if-modified-since'];
    if (req.method === 'HEAD') {
      res.setHeader('Last-Modified', lastModified);
      res.setHeader('Content-Length', stats.size);
      res.writeHead(200, { 'Content-Type': streamInfo.contentType });
      res.end();
      return;
    }
    if (ifModifiedSince === lastModified) {
      res.writeHead(304, { 'Content-Type': streamInfo.contentType });
      res.end();
      return;
    }
    res.setHeader('Last-Modified', lastModified);
    res.writeHead(200, streamInfo.contentType);
    fs.createReadStream(streamInfo.path).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

const server = http.createServer(async(req, res) => {
  await sendFile(req, res);
});

// 监听 3000 端口（测试环境下不启动）
const PORT = 3000;
if (process.env.VITEST !== 'true') {
  server.listen(PORT, () => {
     
    console.log(new Date().toLocaleString(), `tvn 服务器运行在 http://localhost:${PORT}/`);
  });
}

export { sendFile };