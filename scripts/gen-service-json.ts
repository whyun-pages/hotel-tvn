import * as fs from 'fs';
import * as path from 'node:path';
import { TvServiceGenOptions, TvServiceItem } from '../types';

interface ResultJson {
  results?: {
    hits?: Array<{
      host?: {
        host?: {
          ip?: string;
          location?: { province?: string; city?: string; };
          services?: Array<{ port?: number; }>;
        };
      };
      highlights?: Array<{ json_path?: string; }>;
    }>;
  };
}
const ROOT = __dirname;
const RESULT_PATH = path.join(ROOT, '../dist/result.json');
const OUTPUT_PATH = path.join(ROOT, '../tv_service.json');
/** 从 json_path 如 "host.services[4].endpoints[0].http.body" 中提取 services 的索引 */
function extractServiceIndex(jsonPath: string): number | null {
  const m = jsonPath.match(/host\.services\[(\d+)\]/);
  return m ? parseInt(m[1], 10) : null;
}

export function genServiceJson(options: TvServiceGenOptions = {}) {
  const raw = fs.readFileSync(options.inputJsonPath || RESULT_PATH, 'utf-8');
  const data: ResultJson = JSON.parse(raw);

  const hits = data.results?.hits ?? [];
  const items: TvServiceItem[] = [];

  for (const hit of hits) {
    const ip = hit.host?.host?.ip;
    const location = hit.host?.host?.location;
    const province = location?.province ?? '';
    const city = location?.city ?? '';

    if (!ip) {
      continue;
    }

    const highlight = hit.highlights?.[1];
    const jsonPath = highlight?.json_path;
    if (!jsonPath) {
      continue;
    }

    const serviceIndex = extractServiceIndex(jsonPath);
    if (serviceIndex == null) {
      continue;
    }

    const services = hit.host?.host?.services;
    if (!services || serviceIndex >= services.length) {
      continue;
    }

    const port = services[serviceIndex]?.port;
    if (port == null) {
      continue;
    }

    items.push({
      baseUrl: `http://${ip}:${port}`,
      province,
      city,
    });
  }
  const outputPath = options.outputJsonPath || OUTPUT_PATH;
  fs.writeFileSync(outputPath, JSON.stringify(items, null, 2), 'utf-8');
  console.log(`解析完成，共 ${items.length} 条，已写入 ${outputPath}`);
}
