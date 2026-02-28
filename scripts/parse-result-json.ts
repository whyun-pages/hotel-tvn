/**
 * 解析 dist/result.json，提取为 { baseUrl, province, city } 并保存为 tv_service.json
 * baseUrl = ip:port，ip 取自 host.host.ip，port 从 highlights[1].json_path 中的 host.services[$index] 得到 index，再取 host.services[index].port
 */
import * as fs from "fs";
import * as path from "path";
import { TvServiceItem } from "../types";

interface ResultJson {
  results?: {
    hits?: Array<{
      host?: {
        host?: {
          ip?: string;
          location?: { province?: string; city?: string };
          services?: Array<{ port?: number }>;
        };
      };
      highlights?: Array<{ json_path?: string }>;
    }>;
  };
}

const ROOT = process.cwd();
const RESULT_PATH = path.join(ROOT, "dist/result.json");
const OUTPUT_PATH = path.join(ROOT, "../tv_service.json");

/** 从 json_path 如 "host.services[4].endpoints[0].http.body" 中提取 services 的索引 */
function extractServiceIndex(jsonPath: string): number | null {
  const m = jsonPath.match(/host\.services\[(\d+)\]/);
  return m ? parseInt(m[1], 10) : null;
}

function main() {
  const raw = fs.readFileSync(RESULT_PATH, "utf-8");
  const data: ResultJson = JSON.parse(raw);

  const hits = data.results?.hits ?? [];
  const items: TvServiceItem[] = [];

  for (const hit of hits) {
    const ip = hit.host?.host?.ip;
    const location = hit.host?.host?.location;
    const province = location?.province ?? "";
    const city = location?.city ?? "";

    if (!ip) continue;

    const highlight = hit.highlights?.[1];
    const jsonPath = highlight?.json_path;
    if (!jsonPath) continue;

    const serviceIndex = extractServiceIndex(jsonPath);
    if (serviceIndex == null) continue;

    const services = hit.host?.host?.services;
    if (!services || serviceIndex >= services.length) continue;

    const port = services[serviceIndex]?.port;
    if (port == null) continue;

    items.push({
      baseUrl: `${ip}:${port}`,
      province,
      city,
    });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(items, null, 2), "utf-8");
  console.log(`解析完成，共 ${items.length} 条，已写入 ${OUTPUT_PATH}`);
}

main();
