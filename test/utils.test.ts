import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  fetchAndParseJson,
  generateModifiedIPs,
  parseM3u8,
  testStreamSpeed,
  toBaseUrl,
} from '../lib/utils';

const mockFetch = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.restoreAllMocks();
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
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
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({
        data: [
          { name: '央视 1 综合 高清', url: 'hls/cctv1.m3u8', typename: '央视频道' },
          { name: 'CCTV5+体育赛事', url: 'http://example.com/cctv5plus.m3u8', typename: '体育' },
          { name: '湖南卫视', url: 'first.m3u8,second.m3u8', typename: '卫视' },
          { name: '', url: 'hls/empty-name.m3u8', typename: '其他' },
          { name: '东方卫视', url: '', typename: '卫视' },
        ],
      }),
    } as Response);

    const channels = await fetchAndParseJson('http://192.168.1.1:9901/iptv/live/1000.json?key=txiptv');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://192.168.1.1:9901/iptv/live/1000.json?key=txiptv',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
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

describe('parseM3u8', () => {
  it('parses segments, media sequence, target duration and live flag', () => {
    const playlist = parseM3u8(
      [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:4',
        '#EXT-X-MEDIA-SEQUENCE:100',
        '#EXTINF:3.5,',
        'seg100.ts',
        '#EXTINF:4,',
        '/media/seg101.ts',
        'seg102.ts',
      ].join('\n'),
      'http://example.com/live/index.m3u8'
    );

    expect(playlist).toEqual({
      isLive: true,
      mediaSequence: 100,
      targetDuration: 4,
      segments: [
        { url: 'http://example.com/live/seg100.ts', duration: 3.5 },
        { url: 'http://example.com/media/seg101.ts', duration: 4 },
        { url: 'http://example.com/live/seg102.ts', duration: undefined },
      ],
    });
  });

  it('marks playlist as VOD when ENDLIST is present', () => {
    const playlist = parseM3u8(
      '#EXTM3U\n#EXTINF:3,\na.ts\n#EXT-X-ENDLIST\n',
      'http://example.com/live/index.m3u8'
    );
    expect(playlist.isLive).toBe(false);
    expect(playlist.segments).toHaveLength(1);
  });
});

describe('testStreamSpeed', () => {
  const m3u8Url = 'http://example.com/live/index.m3u8';
  const channel = { name: 'CCTV1', url: m3u8Url };

  function playlistText(seq: number, segments: Array<[number, string]>, live = true) {
    const lines = ['#EXTM3U', '#EXT-X-TARGETDURATION:4', `#EXT-X-MEDIA-SEQUENCE:${seq}`];
    for (const [duration, file] of segments) {
      lines.push(`#EXTINF:${duration},`, file);
    }
    if (!live) {
      lines.push('#EXT-X-ENDLIST');
    }
    return lines.join('\n') + '\n';
  }

  function mockClock() {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    return (ms: number) => {
      now += ms;
    };
  }

  function playlistResponse(text: string) {
    return { status: 200, text: async () => text } as Response;
  }

  function tsResponse(advance: (ms: number) => void, ms: number, bytes: number) {
    return async () => {
      advance(ms);
      return { status: 200, arrayBuffer: async () => new Uint8Array(bytes).buffer } as Response;
    };
  }

  it('samples three segments ending at the second-to-last one and uses the median ratio', async () => {
    const advance = mockClock();
    const segments: Array<[number, string]> = [
      [4, 'seg100.ts'],
      [4, 'seg101.ts'],
      [4, 'seg102.ts'],
      [4, 'seg103.ts'],
      [4, 'seg104.ts'],
    ];
    mockFetch
      .mockResolvedValueOnce(playlistResponse(playlistText(100, segments)))
      .mockImplementationOnce(tsResponse(advance, 1000, 1024 * 1024)) // ratio 4
      .mockImplementationOnce(tsResponse(advance, 2000, 1024 * 1024)) // ratio 2
      .mockImplementationOnce(tsResponse(advance, 4000, 1024 * 1024)) // ratio 1
      .mockResolvedValueOnce(
        playlistResponse(playlistText(101, segments.slice(1).concat([[4, 'seg105.ts']])))
      );

    const result = await testStreamSpeed(channel);

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      m3u8Url,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://example.com/live/seg101.ts',
      expect.anything()
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'http://example.com/live/seg102.ts',
      expect.anything()
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      'http://example.com/live/seg103.ts',
      expect.anything()
    );
    expect(mockFetch).toHaveBeenNthCalledWith(5, m3u8Url, expect.anything());
    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(result).toEqual({
      name: 'CCTV1',
      url: m3u8Url,
      speed: (3 / 7).toFixed(2),
      segmentDuration: 4,
      timeRatio: '2.00',
    });
  });

  it('rejects a live playlist whose media sequence does not advance', async () => {
    const advance = mockClock();
    const segments: Array<[number, string]> = [
      [2, 'seg1.ts'],
      [2, 'seg2.ts'],
      [2, 'seg3.ts'],
    ];
    mockFetch
      .mockResolvedValueOnce(playlistResponse(playlistText(1, segments)))
      .mockImplementationOnce(tsResponse(advance, 2000, 1024))
      .mockImplementationOnce(tsResponse(advance, 2000, 1024))
      .mockResolvedValueOnce(playlistResponse(playlistText(1, segments)));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await testStreamSpeed(channel);

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('请求失败'),
      'Error',
      'playlist not advancing'
    );
  });

  it('falls back to comparing the last segment when media sequence is missing', async () => {
    const advance = mockClock();
    mockFetch
      .mockResolvedValueOnce(
        playlistResponse('#EXTM3U\n#EXTINF:3,\nseg1.ts\n#EXTINF:2,\nseg2.ts\n')
      )
      .mockImplementationOnce(tsResponse(advance, 2000, 1024))
      .mockResolvedValueOnce(
        playlistResponse('#EXTM3U\n#EXTINF:2,\nseg2.ts\n#EXTINF:2,\nseg3.ts\n')
      );

    const result = await testStreamSpeed(channel);

    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://example.com/live/seg1.ts',
      expect.anything()
    );
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result?.timeRatio).toBe('1.50');
  });

  it('skips the advance check for VOD playlists', async () => {
    const advance = mockClock();
    mockFetch
      .mockResolvedValueOnce(
        playlistResponse(
          playlistText(
            0,
            [
              [3, 'a.ts'],
              [3, 'b.ts'],
            ],
            false
          )
        )
      )
      .mockImplementationOnce(tsResponse(advance, 1000, 1024));

    const result = await testStreamSpeed(channel);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result?.timeRatio).toBe('3.00');
  });

  it('returns null when the median ratio is below the tolerance', async () => {
    const advance = mockClock();
    const segments: Array<[number, string]> = [
      [2, 'seg1.ts'],
      [2, 'seg2.ts'],
      [2, 'seg3.ts'],
      [2, 'seg4.ts'],
    ];
    mockFetch
      .mockResolvedValueOnce(playlistResponse(playlistText(1, segments)))
      .mockImplementationOnce(tsResponse(advance, 1000, 1024))
      .mockImplementationOnce(tsResponse(advance, 4000, 1024))
      .mockImplementationOnce(tsResponse(advance, 5000, 1024));

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await testStreamSpeed(channel);

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});
