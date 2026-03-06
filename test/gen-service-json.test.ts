import * as fs from 'fs';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { genServiceJson } from '../scripts/gen-service-json';
import type { TvServiceItem } from '../types';

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const INPUT_JSON = path.join(FIXTURE_DIR, 'result-sample.json');

describe('genServiceJson', () => {
  let tmpDir: string;
  let outputPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(__dirname, 'tmp-'));
    outputPath = path.join(tmpDir, 'tv_service.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  it('reads fixture result.json and writes tv_service.json with baseUrl, province, city', () => {
    genServiceJson({ inputJsonPath: INPUT_JSON, outputJsonPath: outputPath });

    expect(fs.existsSync(outputPath)).toBe(true);
    const content = fs.readFileSync(outputPath, 'utf-8');
    const items: TvServiceItem[] = JSON.parse(content);
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(2);

    expect(items[0]).toEqual({
      baseUrl: 'http://192.168.1.100:9901',
      province: 'Guangdong',
      city: 'Shenzhen',
    });
    expect(items[1]).toEqual({
      baseUrl: 'http://10.0.0.50:9901',
      province: 'Beijing',
      city: '',
    });
  });

  it('skips hits without ip', () => {
    const inputNoIp = path.join(tmpDir, 'no-ip.json');
    const noIpJson = {
      results: {
        hits: [{ host: { host: { location: { province: 'A', city: 'B' } } } }],
      },
    };
    fs.writeFileSync(inputNoIp, JSON.stringify(noIpJson), 'utf-8');
    genServiceJson({ inputJsonPath: inputNoIp, outputJsonPath: outputPath });
    const items: TvServiceItem[] = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(items).toHaveLength(0);
  });

  it('skips hits without highlights[1].json_path', () => {
    const inputNoPath = path.join(tmpDir, 'no-path.json');
    const noPathJson = {
      results: {
        hits: [
          {
            host: {
              host: {
                ip: '1.2.3.4',
                location: {} as { province?: string; city?: string },
                services: [{ port: 80 }],
              },
            },
            highlights: [null, {}],
          },
        ],
      },
    };
    fs.writeFileSync(inputNoPath, JSON.stringify(noPathJson), 'utf-8');
    genServiceJson({ inputJsonPath: inputNoPath, outputJsonPath: outputPath });
    const items: TvServiceItem[] = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(items).toHaveLength(0);
  });

  it('skips when json_path does not match host.services[N]', () => {
    const inputBadPath = path.join(tmpDir, 'bad-path.json');
    const badPathJson = {
      results: {
        hits: [
          {
            host: {
              host: {
                ip: '1.2.3.4',
                location: {},
                services: [{ port: 80 }],
              },
            },
            highlights: [null, { json_path: 'other.path[0].value' }],
          },
        ],
      },
    };
    fs.writeFileSync(inputBadPath, JSON.stringify(badPathJson), 'utf-8');
    genServiceJson({ inputJsonPath: inputBadPath, outputJsonPath: outputPath });
    const items: TvServiceItem[] = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(items).toHaveLength(0);
  });
});
