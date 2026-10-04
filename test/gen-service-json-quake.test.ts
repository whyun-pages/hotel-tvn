import * as fs from 'fs';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchQuakeServiceJson,
  genServiceJsonFromQuake,
  parseQuakeItems,
} from '../scripts/gen-service-json-quake';
import type { TvServiceItem } from '../types';

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const INPUT_JSON = path.join(FIXTURE_DIR, 'quake-sample.json');

function readItems(file: string): TvServiceItem[] {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function mockResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('parseQuakeItems', () => {
  it('takes ip/port from id when ip is masked, falls back to plain ip, dedupes and skips masked-only items', () => {
    const data = JSON.parse(fs.readFileSync(INPUT_JSON, 'utf-8'));
    expect(parseQuakeItems(data.data)).toEqual([
      { baseUrl: 'http://192.168.1.100:9901', province: '广西壮族自治区', city: '南宁市' },
      { baseUrl: 'http://10.0.0.50:8181', province: '陕西省', city: '西安市' },
    ]);
  });
});

describe('genServiceJsonFromQuake', () => {
  let tmpDir: string;
  let outputPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(__dirname, 'tmp-'));
    outputPath = path.join(tmpDir, 'tv_service.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('merges multiple input files and dedupes by baseUrl', () => {
    const second = path.join(tmpDir, 'page2.json');
    fs.writeFileSync(
      second,
      JSON.stringify({
        code: 0,
        data: [
          { id: '192.168.1.100_9901_tcp', location: {} },
          { id: '10.1.1.1_9901_tcp', location: { province_cn: '北京市', city_cn: '北京市' } },
        ],
      }),
      'utf-8'
    );
    genServiceJsonFromQuake({ inputJsonPaths: [INPUT_JSON, second], outputJsonPath: outputPath });
    expect(readItems(outputPath).map((item) => item.baseUrl)).toEqual([
      'http://192.168.1.100:9901',
      'http://10.0.0.50:8181',
      'http://10.1.1.1:9901',
    ]);
  });

  it('throws when quake code is not 0', () => {
    const input = path.join(tmpDir, 'error.json');
    fs.writeFileSync(input, JSON.stringify({ code: 'u3004', message: '权限不足' }), 'utf-8');
    expect(() =>
      genServiceJsonFromQuake({ inputJsonPaths: [input], outputJsonPath: outputPath })
    ).toThrow(/u3004/);
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('does not overwrite output when no usable item', () => {
    const input = path.join(tmpDir, 'empty.json');
    fs.writeFileSync(input, JSON.stringify({ code: 0, data: [{ ip: '1.*.*.*', port: 80 }] }), 'utf-8');
    fs.writeFileSync(outputPath, '[]', 'utf-8');
    expect(() =>
      genServiceJsonFromQuake({ inputJsonPaths: [input], outputJsonPath: outputPath })
    ).toThrow();
  });
});

describe('fetchQuakeServiceJson', () => {
  let tmpDir: string;
  let outputPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(__dirname, 'tmp-'));
    outputPath = path.join(tmpDir, 'tv_service.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('posts query with token and writes tv_service.json', async () => {
    const body = JSON.parse(fs.readFileSync(INPUT_JSON, 'utf-8'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(body));

    await fetchQuakeServiceJson({
      token: 'test-token',
      query: 'response:"/iptv/live/" AND country:"China"',
      size: 100,
      max: 100,
      outputJsonPath: outputPath,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://quake.360.net/api/v3/search/quake_service');
    expect((init?.headers as Record<string, string>)['X-QuakeToken']).toBe('test-token');
    expect(JSON.parse(init?.body as string)).toEqual({
      query: 'response:"/iptv/live/" AND country:"China"',
      start: 0,
      size: 100,
    });
    expect(readItems(outputPath)).toHaveLength(2);
  });

  it('requests only once when maxPages is 1', async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({ id: `10.0.${i}.1_9901_tcp` }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ code: 0, data: page, meta: { pagination: { total: 6942 } } })
    );
    await fetchQuakeServiceJson({
      token: 't',
      size: 100,
      max: 1000,
      maxPages: 1,
      outputJsonPath: outputPath,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readItems(outputPath)).toHaveLength(100);
  });

  it('stops when a page returns fewer items than requested', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({
        code: 0,
        data: [{ id: '10.0.0.1_9901_tcp' }],
        meta: { pagination: { total: 6942 } },
      })
    );
    await fetchQuakeServiceJson({ token: 't', size: 100, max: 100, outputJsonPath: outputPath });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws without token', async () => {
    vi.stubEnv('QUAKE_TOKEN', '');
    await expect(fetchQuakeServiceJson({ outputJsonPath: outputPath })).rejects.toThrow(/token/);
    vi.unstubAllEnvs();
  });

  it('throws on quake error code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ code: 'q3005', message: '调用API频率超过限制' })
    );
    await expect(
      fetchQuakeServiceJson({ token: 't', outputJsonPath: outputPath })
    ).rejects.toThrow(/q3005/);
    expect(fs.existsSync(outputPath)).toBe(false);
  });
});
