import { Readable, PassThrough } from 'node:stream';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  default: {
    promises: {
      stat: vi.fn(),
    },
    createReadStream: vi.fn(),
  },
}));

const fs = await import('node:fs');
const { sendFile } = (await import('../docker/server.mjs')) as {
  sendFile: (
    req: { url: string; method: string; headers: Record<string, string> },
    res: Response,
    streamInfoMap?: Record<string, { path: string; contentType: string }>) => Promise<void>
};

const mockStat = vi.mocked(fs.default.promises.stat);
const mockCreateReadStream = vi.mocked(fs.default.createReadStream);

function createMockRes() {
  const chunks: Buffer[] = [];
  const res = new PassThrough() as ReturnType<typeof createMockRes>['res'];
  res.writeHead = vi.fn();
  res.setHeader = vi.fn();
  res.end = vi.fn(function (this: PassThrough, chunk?: unknown) {
    if (chunk !== undefined) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    PassThrough.prototype.end.call(this);
  });
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  return { res, chunks, writeHead: res.writeHead, setHeader: res.setHeader, end: res.end };
}

describe('docker/server sendFile', () => {
  const fixturePath = '/tmp/fixture/lives.txt';
  const streamInfoMap: Record<string, { path: string; contentType: string }> = {
    '/lives.txt': { path: fixturePath, contentType: 'text/plain; charset=utf-8' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const lastModified = 'Wed, 01 Jan 2025 00:00:00 GMT';
    mockStat.mockResolvedValue({
      mtime: new Date(lastModified),
      size: 5,
    } as ReturnType<typeof mockStat> extends Promise<infer T> ? T : never);
    const readable = new Readable({ read() {
 this.push('hello'); this.push(null); 
} });
    mockCreateReadStream.mockReturnValue(readable as ReturnType<typeof mockCreateReadStream>);
  });

  it('GET /lives.txt 返回 200 并设置 Last-Modified 和 Content-Type', async () => {
    const { res, writeHead, setHeader } = createMockRes();
    const req = { url: '/lives.txt', method: 'GET', headers: {} };

    await sendFile(req, res, streamInfoMap);

    expect(mockStat).toHaveBeenCalledWith(fixturePath);
    expect(writeHead).toHaveBeenCalledWith(200, 'text/plain; charset=utf-8');
    expect(setHeader).toHaveBeenCalledWith('Last-Modified', 'Wed, 01 Jan 2025 00:00:00 GMT');
    expect(mockCreateReadStream).toHaveBeenCalledWith(fixturePath);
  });

  it('HEAD /lives.txt 返回 200、Last-Modified、Content-Length 且不写入 body', async () => {
    const { res, writeHead, end } = createMockRes();
    const req = { url: '/lives.txt', method: 'HEAD', headers: {} };

    await sendFile(req, res, streamInfoMap);

    expect(writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'text/plain; charset=utf-8' }));
    expect(res.setHeader).toHaveBeenCalledWith('Last-Modified', 'Wed, 01 Jan 2025 00:00:00 GMT');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 5);
    expect(end).toHaveBeenCalled();
    expect(mockCreateReadStream).not.toHaveBeenCalled();
  });

  it('当 If-Modified-Since 与 Last-Modified 一致时返回 304', async () => {
    const { res, writeHead } = createMockRes();
    const lastModified = 'Wed, 01 Jan 2025 00:00:00 GMT';
    const req = { url: '/lives.txt', method: 'GET', headers: { 'if-modified-since': lastModified } };

    await sendFile(req, res, streamInfoMap);

    expect(writeHead).toHaveBeenCalledWith(304, { 'Content-Type': 'text/plain; charset=utf-8' });
    expect(mockCreateReadStream).not.toHaveBeenCalled();
  });

  it('未知路径返回 404', async () => {
    const { res, writeHead, end } = createMockRes();
    const req = { url: '/unknown', method: 'GET', headers: {} };

    await sendFile(req, res, streamInfoMap);

    expect(writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    expect(end).toHaveBeenCalledWith('Not Found');
    expect(mockStat).not.toHaveBeenCalled();
  });

  it('url 带 query 时仍按路径匹配', async () => {
    const { res, writeHead } = createMockRes();
    const req = { url: '/lives.txt?foo=1', method: 'GET', headers: {} };

    await sendFile(req, res, streamInfoMap);

    expect(writeHead).toHaveBeenCalledWith(200, expect.any(String));
    expect(mockStat).toHaveBeenCalledWith(fixturePath);
  });
});
