import axios from 'axios';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchAndParseJson } from '../lib/utils';

const LIVE_JSON_URL = 'http://183.223.157.33:9901/iptv/live/1000.json?key=txiptv';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchAndParseJson live', () => {
  it.runIf(process.env.RUN_LIVE_TESTS === '1')(
    'requests the real JSON endpoint and returns parsed channels',
    async () => {
      const getSpy = vi.spyOn(axios, 'get');

      const channels = await fetchAndParseJson(LIVE_JSON_URL);

      expect(getSpy).toHaveBeenCalledWith(LIVE_JSON_URL, { timeout: 2000 });
      expect(Array.isArray(channels)).toBe(true);

      if (channels.length > 0) {
        expect(channels[0]?.name).toBeTruthy();
        expect(channels[0]?.url).toMatch(/^http/);
      }
    },
    15000
  );
});
