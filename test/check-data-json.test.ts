import * as fs from 'fs';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { build } from '../scripts/check-data-json';
import type { ParsedChannel } from '../types';

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const DATA_JSON_PATH = path.join(FIXTURE_DIR, 'tv_service-sample.json');

vi.mock('../lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/utils')>();
  return {
    ...actual,
    checkUrlAlive: vi.fn(),
    fetchAndParseJson: vi.fn(),
    testStreamSpeed: vi.fn(),
  };
});

import {
  checkUrlAlive,
  fetchAndParseJson,
  testStreamSpeed,
} from '../lib/utils';

describe('check-data-json build', () => {
  let tmpDir: string;
  let liveResultDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(__dirname, 'tmp-build-'));
    liveResultDir = tmpDir;
    vi.mocked(checkUrlAlive).mockResolvedValue(null);
    vi.mocked(fetchAndParseJson).mockResolvedValue([]);
    vi.mocked(testStreamSpeed).mockResolvedValue(null);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch {
      // ignore
    }
    vi.clearAllMocks();
  });

  it('returns early when data JSON is empty array', async () => {
    const emptyPath = path.join(tmpDir, 'empty.json');
    fs.writeFileSync(emptyPath, '[]', 'utf-8');

    await build({ dataJsonPath: emptyPath, liveResultDir });

    expect(fs.existsSync(path.join(liveResultDir, 'lives.txt'))).toBe(false);
    expect(fs.existsSync(path.join(liveResultDir, 'lives.m3u'))).toBe(false);
  });

  it('returns early when data JSON is not an array', async () => {
    const invalidPath = path.join(tmpDir, 'invalid.json');
    fs.writeFileSync(invalidPath, '{}', 'utf-8');

    await build({ dataJsonPath: invalidPath, liveResultDir });

    expect(fs.existsSync(path.join(liveResultDir, 'lives.txt'))).toBe(false);
    expect(fs.existsSync(path.join(liveResultDir, 'lives.m3u'))).toBe(false);
  });

  it('returns early when no JSON URLs are alive', async () => {
    vi.mocked(checkUrlAlive).mockResolvedValue(null);

    await build({ dataJsonPath: DATA_JSON_PATH, liveResultDir });

    expect(fs.existsSync(path.join(liveResultDir, 'lives.txt'))).toBe(false);
    expect(fs.existsSync(path.join(liveResultDir, 'lives.m3u'))).toBe(false);
  });

  it('returns early when alive JSON returns no channels', async () => {
    vi.mocked(checkUrlAlive).mockResolvedValue('http://192.168.1.1:9901/iptv/live/1000.json?key=txiptv');
    vi.mocked(fetchAndParseJson).mockResolvedValue([]);

    await build({ dataJsonPath: DATA_JSON_PATH, liveResultDir });

    expect(fs.existsSync(path.join(liveResultDir, 'lives.txt'))).toBe(false);
    expect(fs.existsSync(path.join(liveResultDir, 'lives.m3u'))).toBe(false);
  });

  it('writes lives.txt and lives.m3u when channels pass speed test', async () => {
    const mockJsonUrl = 'http://192.168.1.1:9901/iptv/live/1000.json?key=txiptv';
    const parsed: ParsedChannel[] = [
      { name: 'CCTV1', url: 'http://example.com/cctv1.m3u8' },
      { name: '湖南卫视', url: 'http://example.com/hunan.m3u8' },
    ];
    vi.mocked(checkUrlAlive).mockImplementation(async (url: string) => {
      return url === mockJsonUrl ? url : null;
    });
    vi.mocked(fetchAndParseJson).mockResolvedValue(parsed);
    vi.mocked(testStreamSpeed).mockImplementation(async (ch: ParsedChannel) => {
      return ch.name === 'CCTV1' ? { ...ch, speed: 1.5 } : null;
    });

    await build({ dataJsonPath: DATA_JSON_PATH, liveResultDir });

    const txtPath = path.join(liveResultDir, 'lives.txt');
    const m3uPath = path.join(liveResultDir, 'lives.m3u');
    expect(fs.existsSync(txtPath)).toBe(true);
    expect(fs.existsSync(m3uPath)).toBe(true);

    const txtContent = fs.readFileSync(txtPath, 'utf-8');
    expect(txtContent).toContain('央视频道,#genre#');
    expect(txtContent).toContain('CCTV1,http://example.com/cctv1.m3u8');

    const m3uContent = fs.readFileSync(m3uPath, 'utf-8');
    expect(m3uContent).toContain('#EXTM3U');
    expect(m3uContent).toContain('CCTV1');
    expect(m3uContent).toContain('http://example.com/cctv1.m3u8');
  });
});
