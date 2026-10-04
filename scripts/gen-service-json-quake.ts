import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  QuakeFetchOptions,
  QuakeGenOptions,
  TvServiceItem,
} from '../types';

export interface QuakeServiceItem {
  /** 形如 "36.136.38.87_9901_tcp"，ip 被打码时真实 ip 只能从这里取 */
  id?: string;
  /** 低权限账号下可能被打码，如 "36.*.*.*" */
  ip?: string;
  port?: number;
  location?: {
    province_cn?: string;
    city_cn?: string;
  };
}

export interface QuakeResultJson {
  code?: number | string;
  message?: string;
  data?: QuakeServiceItem[];
  meta?: {
    pagination?: {
      count?: number;
      page_index?: number;
      page_size?: number;
      total?: number;
    };
  };
}

const ROOT = __dirname;
const RESULT_PATH = path.join(ROOT, '../dist/quake-result.json');
const OUTPUT_PATH = path.join(ROOT, '../tv_service.json');

const QUAKE_API_URL = 'https://quake.360.net/api/v3/search/quake_service';
export const DEFAULT_QUAKE_QUERY =
  'response:"/iptv/live/" AND country:"China"';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX = 100;
const PAGE_INTERVAL = 3000;
const REQUEST_TIMEOUT = 30000;

const ID_REGEXP = /^(\d+\.\d+\.\d+\.\d+)_(\d+)_/;
const IPV4_REGEXP = /^\d+\.\d+\.\d+\.\d+$/;

function parseHost(item: QuakeServiceItem): { ip: string; port: number } | null {
  const m = item.id?.match(ID_REGEXP);
  if (m) {
    return { ip: m[1], port: parseInt(m[2], 10) };
  }
  if (item.ip && IPV4_REGEXP.test(item.ip) && item.port != null) {
    return { ip: item.ip, port: item.port };
  }
  return null;
}

function assertQuakeOk(data: QuakeResultJson) {
  if (data.code !== 0) {
    throw new Error(`Quake 返回错误: code=${data.code}, message=${data.message}`);
  }
}

/** 将 Quake 的 data 列表转为 TvServiceItem，按 baseUrl 去重 */
export function parseQuakeItems(list: QuakeServiceItem[]): TvServiceItem[] {
  const items: TvServiceItem[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const host = parseHost(item);
    if (!host) {
      continue;
    }
    const baseUrl = `http://${host.ip}:${host.port}`;
    if (seen.has(baseUrl)) {
      continue;
    }
    seen.add(baseUrl);
    items.push({
      baseUrl,
      province: item.location?.province_cn ?? '',
      city: item.location?.city_cn ?? '',
    });
  }
  return items;
}

function writeItems(items: TvServiceItem[], outputJsonPath?: string) {
  if (items.length === 0) {
    // 避免用空列表覆盖已有的 tv_service.json
    throw new Error('Quake 结果中没有可用数据，未写入输出文件');
  }
  const outputPath = outputJsonPath || OUTPUT_PATH;
  fs.writeFileSync(outputPath, JSON.stringify(items, null, 2), 'utf-8');
  console.log(`解析完成，共 ${items.length} 条，已写入 ${outputPath}`);
}

/** 解析一个或多个离线保存的 Quake 搜索结果文件，生成 tv_service.json */
export function genServiceJsonFromQuake(options: QuakeGenOptions = {}) {
  const inputPaths = options.inputJsonPaths?.length
    ? options.inputJsonPaths
    : [RESULT_PATH];
  const list: QuakeServiceItem[] = [];
  for (const inputPath of inputPaths) {
    const data: QuakeResultJson = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    assertQuakeOk(data);
    list.push(...(data.data ?? []));
  }
  writeItems(parseQuakeItems(list), options.outputJsonPath);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchQuakePage(
  token: string,
  query: string,
  start: number,
  size: number
): Promise<QuakeResultJson> {
  // Perry 运行时可能没有 AbortController，此时不设超时
  const controller =
    typeof AbortController === 'undefined' ? undefined : new AbortController();
  const timer = setTimeout(() => controller?.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(QUAKE_API_URL, {
      method: 'POST',
      headers: {
        'X-QuakeToken': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, start, size }),
      signal: controller?.signal,
    });
    if (!res.ok) {
      throw new Error(`Quake 请求失败: HTTP ${res.status}`);
    }
    const data = (await res.json()) as QuakeResultJson;
    assertQuakeOk(data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** 调用 Quake API 拉取搜索结果，生成 tv_service.json */
export async function fetchQuakeServiceJson(options: QuakeFetchOptions = {}) {
  const token = options.token || process.env.QUAKE_TOKEN;
  if (!token) {
    throw new Error('缺少 Quake token，请通过 --token 或环境变量 QUAKE_TOKEN 指定');
  }
  const query = options.query || DEFAULT_QUAKE_QUERY;
  const size = options.size || DEFAULT_PAGE_SIZE;
  const max = options.max || DEFAULT_MAX;
  const maxPages = options.maxPages || Infinity;
  let start = options.start || 0;

  const list: QuakeServiceItem[] = [];
  let total = Infinity;
  let pages = 0;
  while (list.length < max && start < total && pages < maxPages) {
    const pageSize = Math.min(size, max - list.length);
    if (list.length > 0) {
      await sleep(PAGE_INTERVAL);
    }
    const data = await fetchQuakePage(token, query, start, pageSize);
    pages += 1;
    const page = data.data ?? [];
    total = data.meta?.pagination?.total ?? 0;
    console.log(`Quake 拉取 start=${start} 得到 ${page.length} 条，共 ${total} 条`);
    if (page.length === 0) {
      break;
    }
    list.push(...page);
    start += page.length;
    if (page.length < pageSize) {
      break;
    }
  }

  if (options.rawOutputPath) {
    const raw: QuakeResultJson = { code: 0, message: 'Successful.', data: list };
    fs.writeFileSync(options.rawOutputPath, JSON.stringify(raw), 'utf-8');
    console.log(`原始结果已写入 ${options.rawOutputPath}`);
  }
  writeItems(parseQuakeItems(list), options.outputJsonPath);
}
