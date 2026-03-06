import { describe, it, expect } from 'vitest';
import { generateModifiedIPs, toBaseUrl } from '../lib/utils';

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
