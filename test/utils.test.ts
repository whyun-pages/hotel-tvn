import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    head: vi.fn(),
  },
}));

import axios from 'axios';
import { fetchAndParseJson, generateModifiedIPs, testStreamSpeed, toBaseUrl } from '../lib/utils';

const mockAxiosGet = vi.mocked(axios.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateModifiedIPs', () => {
  it('generates 255 URLs with last octet 1 to 255', () => {
    const baseUrl = 'http://192.168.1.1:9901';
    const urls = generateModifiedIPs(baseUrl);
    expect(urls).toHaveLength(255);
    expect(urls[0]).toBe('http://192.168.1.1:9901/iptv/live/1000.json?key=txiptv');
    expect(urls[1]).toBe('http://192.168.1.2:9901/iptv/live/1000.json?key=txiptv');
    expect(urls[254]).toBe('http://192.168.1.255:9901/iptv/live/1000.json?key=txiptv');
  });

  it('uses protocol, first three octets and port from baseUrl', () => {
    const baseUrl = 'http://10.0.5.100:8080';
    const urls = generateModifiedIPs(baseUrl);
    expect(urls[0]).toContain('http://10.0.5.1:8080');
    expect(urls[0]).toContain('/iptv/live/1000.json?key=txiptv');
  });
});

describe('toBaseUrl', () => {
  it('converts http://A.B.C.D:port to http://A.B.C.1:port', () => {
    expect(toBaseUrl('http://192.168.1.100:9901')).toBe('http://192.168.1.1:9901');
    expect(toBaseUrl('http://10.0.0.50:8080')).toBe('http://10.0.0.1:8080');
  });

  it('returns null for non-matching URL', () => {
    expect(toBaseUrl('https://192.168.1.1:80')).toBeNull();
    expect(toBaseUrl('http://example.com:80')).toBeNull();
    expect(toBaseUrl('http://192.168.1:80')).toBeNull();
    expect(toBaseUrl('')).toBeNull();
  });
});

describe('fetchAndParseJson', () => {
  it('parses channels, normalizes names, resolves relative URLs and filters invalid items', async () => {
    mockAxiosGet.mockResolvedValue({
      status: 200,
      data: {
        data: [
          { name: '央视 1 综合 高清', url: 'hls/cctv1.m3u8', typename: '央视频道' },
          { name: 'CCTV5+体育赛事', url: 'http://example.com/cctv5plus.m3u8', typename: '体育' },
          { name: '湖南卫视', url: 'first.m3u8,second.m3u8', typename: '卫视' },
          { name: '', url: 'hls/empty-name.m3u8', typename: '其他' },
          { name: '东方卫视', url: '', typename: '卫视' },
        ],
      },
    });

    const channels = await fetchAndParseJson('http://192.168.1.1:9901/iptv/live/1000.json?key=txiptv');

    expect(mockAxiosGet).toHaveBeenCalledWith(
      'http://192.168.1.1:9901/iptv/live/1000.json?key=txiptv',
      { timeout: 2000 }
    );
    expect(channels).toEqual([
      {
        name: 'CCTV1',
        url: 'http://192.168.1.1:9901/hls/cctv1.m3u8',
      },
      {
        name: 'CCTV5+',
        url: 'http://example.com/cctv5plus.m3u8',
      },
    ]);
  });
});

describe('testStreamSpeed', () => {
  it('parses first segment duration from m3u8 and returns it with speed', async () => {
    mockAxiosGet
      .mockResolvedValueOnce({
        status: 200,
        data: '#EXTM3U\n#EXTINF:3.5,\nsegment001.ts\n',
      })
      .mockResolvedValueOnce({
        status: 200,
        data: new Uint8Array(1024 * 1024).buffer,
      });

    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(3000);

    const result = await testStreamSpeed({
      name: 'CCTV1',
      url: 'http://example.com/live/index.m3u8',
    });

    expect(mockAxiosGet).toHaveBeenNthCalledWith(1, 'http://example.com/live/index.m3u8', {
      timeout: 1500,
    });
    expect(mockAxiosGet).toHaveBeenNthCalledWith(2, 'http://example.com/live/segment001.ts', {
      responseType: 'arraybuffer',
      timeout: 5000,
    });
    expect(result).toEqual({
      name: 'CCTV1',
      url: 'http://example.com/live/index.m3u8',
      speed: '0.50',
      segmentDuration: 3.5,
      timeRatio: '1.75',
    });
  });

  it('resolves root-relative ts path against origin', async () => {
    mockAxiosGet
      .mockResolvedValueOnce({
        status: 200,
        data: '#EXTM3U\n#EXTINF:4,\n/media/segment001.ts\n',
      })
      .mockResolvedValueOnce({
        status: 200,
        data: new Uint8Array(1024).buffer,
      });

    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);

    await testStreamSpeed({
      name: 'CCTV1',
      url: 'http://example.com/live/index.m3u8',
    });

    expect(mockAxiosGet).toHaveBeenNthCalledWith(2, 'http://example.com/media/segment001.ts', {
      responseType: 'arraybuffer',
      timeout: 5000,
    });
  });
});
