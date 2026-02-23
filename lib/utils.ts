import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import Bottleneck from 'bottleneck';
import * as cheerio from 'cheerio';
import axios from 'axios';
import PQueue from 'p-queue';
import { RegionUrl } from '../types';
import { setTimeout } from 'timers/promises';
import { ParsedChannel } from '../types';
import { Channel } from '../types';

const ENV = process.env
chromium.use(stealth());
function genUrlByRegion(region: string): string {
  const queryString = encodeURIComponent(
    Buffer.from(`"iptv/live/zh_cn.js" && country="CN" && region="${region}"`).toString('base64')
  );
  return `https://fofa.info/result?qbase64=${queryString}`;
}
const provinces = ENV.PROVINCES?.split(',') || [
  '广西',
  '广东',
  '内蒙古',
  '河南',
  '河北',
  '湖南',
  '湖北',
  // '北京',
  // '山东',
  // '四川',
  // '云南',
  // '重庆',
  // '陕西',
  // '吉林',
  // '辽宁',
  // '安徽',
  // '江西',
  // '福建',
  // '浙江',
  // '上海',
  // '江苏',
  // '贵州',
  // '甘肃',
  // '青海',
  // '宁夏',
  // '新疆',
  // '西藏',
  // '海南',
];
const urls: RegionUrl[] = [
  ...provinces.map((region) => ({region, url: genUrlByRegion(region)})),
];

const CONCURRENCY = 60;
const REQUEST_TIMEOUT = 800;
const DOWNLOAD_TIMEOUT = 5000;
export const RESULT_LIMIT_PER_CHANNEL = 8;

// 限流器
const limiter = new Bottleneck({
  maxConcurrent: 30,
  minTime: 150,
});

const jsonUrls = [
  'http://183.223.157.33:9901/iptv/live/1000.json?key=txiptv',
  'http://117.174.99.170:9901/iptv/live/1000.json?key=txiptv',
];

/**
 * 使用 Playwright 获取页面内容
 */
export async function fetchPageWithPlaywright(url: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    bypassCSP: true,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(8000);
    const content = await page.content();
    return content;
  } catch (e) {
    console.error(`Playwright fetch failed: ${url}`, e);
    return "";
  } finally {
    await browser.close();
  }
}

/**
 * 从 HTML 中提取 IP:端口 格式的地址
 */
function extractIPs(html: string): string[] {
  const $ = cheerio.load(html);
  const text = $.text();
  if ($('.errorpage').length > 0) {
    console.warn($('.errorpage').text());
  }
  const ipRegex = /http:\/\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+/g;
  const matches = [...new Set(text.match(ipRegex) || [])];
  return matches;
}

/**
 * 根据基础 IP 生成 1~255 的所有候选地址
 */
function generateModifiedIPs(baseUrl: string): string[] {
  const urlObj = new URL(baseUrl);
  const prefix = `${urlObj.protocol}//${urlObj.host.split(':')[0].split('.').slice(0, 3).join('.')}.`;
  const portPath = urlObj.port ? `:${urlObj.port}` : '';
  const suffix = '/iptv/live/1000.json?key=txiptv';

  const ips: string[] = [];
  for (let i = 1; i <= 255; i++) {
    ips.push(`${prefix}${i}${portPath}${suffix}`);
  }
  return ips;
}

/**
 * 检查单个 URL 是否可访问
 */
async function checkUrlAlive(url: string): Promise<string | null> {
  try {
    const res = await limiter.schedule(() =>
      axios.head(url, { timeout: REQUEST_TIMEOUT })
    );
    if (res.status === 200) {
      return url;
    }
    console.log(`${url} is not alive, status: ${res.status}, ${res.data}`);
  } catch (e) {
    console.log(`${url} is not alive, error: ${e}`);
    // 静默失败
  }
  return null;
}

/**
 * 收集所有有效的 JSON 地址
 */
export async function getValidJsonUrls(): Promise<string[]> {
  const allValid: string[] = [];

  for (const {url: sourceUrl, region } of urls) {
    console.log(`Processing regin: ${region} source: ${sourceUrl}`);
    let html: string;

    if (sourceUrl.includes('raw.githubusercontent')) {
      try {
        const res = await axios.get(sourceUrl, { timeout: 10000 });
        html = res.data;
      } catch (e) {
        console.error(`Raw url failed: ${sourceUrl}`);
        continue;
      }
    } else {
      html = await fetchPageWithPlaywright(sourceUrl);
    }

    const ipUrls = extractIPs(html);
    if (ipUrls.length === 0) {
      console.log(`No valid IPs found in region: ${region} ${html}`);
      continue;
    }
    console.log(`Found ${ipUrls.length} valid IPs in region: ${region}`);
    const baseIPs = [...new Set(
      ipUrls
        .map(u => {
          const m = u.match(/http:\/\/(\d+\.\d+\.\d+)\.\d+:\d+/);
          return m ? `http://${m[1]}.1${u.match(/:\d+/)![0]}` : null;
        })
        .filter((v): v is string => !!v)
    )];

    const queue = new PQueue({ concurrency: CONCURRENCY });

    const promises = baseIPs.flatMap(base => {
      const candidates = generateModifiedIPs(base);
      return candidates.map(cand => queue.add(() => checkUrlAlive(cand)));
    });

    const results = await Promise.allSettled(promises);
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        allValid.push(r.value);
        console.log(`Found valid JSON: ${r.value} in region: ${region}`);
      }
    }
    console.log(`Waiting for 30 seconds...`);
    await setTimeout(30_000);
  }

  return [...new Set(allValid)];
}

export async function getValidJsonUrlsFromLocalUrls(): Promise<string[]> {
  const okUrls: string[] = [];
  jsonUrls.map(async (url) => {
    const res = await checkUrlAlive(url);
    if (res) {
      okUrls.push(res);
    }
  })
  return okUrls;
}

/**
 * 从 JSON 地址获取并解析频道列表
 */
export async function fetchAndParseJson(url: string): Promise<ParsedChannel[]> {
  try {
    const res = await axios.get(url, { timeout: 2000 });
    if (res.status !== 200 || !res.data?.data) return [];

    const base = url.replace(/\/iptv\/live\/.*$/, '/');
    const items: ParsedChannel[] = [];

    for (const it of (res.data.data as any[]) || []) {
      let name = String(it.name || '').trim();
      let urlx = String(it.url || '').trim();

      if (!name || !urlx) continue;
      if (urlx.includes(',')) continue;

      // 清洗名称
      name = name
        .replace(/cctv/gi, 'CCTV')
        .replace(/[中央|央视]/g, 'CCTV')
        .replace(/高清|超高|HD|标清|频道|-| /g, '')
        .replace(/[＋()]/g, s => (s === '＋' ? '+' : ''))
        .replace(/PLUS/gi, '+')
        .replace(/CCTV(\d+)台/, 'CCTV$1')
        .replace(/CCTV1综合/, 'CCTV1')
        .replace(/CCTV5\+体育(?:赛事|赛视)?/, 'CCTV5+');

      const finalUrl = urlx.startsWith('http') ? urlx : base + urlx;

      items.push({ name, url: finalUrl });
    }

    return items;
  } catch {
    return [];
  }
}

/**
 * 测试单个直播源的速度
 */
export async function testStreamSpeed(channel: ParsedChannel): Promise<Channel | null> {
  const { name, url } = channel;

  try {
    const m3u8Res = await axios.get(url, { timeout: 1500 });
    if (m3u8Res.status !== 200) throw new Error('m3u8 failed');

    const lines = m3u8Res.data.split('\n').map((l: string) => l.trim());
    const tsFiles = lines.filter((l: string) => !l.startsWith('#') && l);

    if (tsFiles.length === 0) throw new Error('no ts');

    const base = url.substring(0, url.lastIndexOf('/') + 1);
    const firstTs = base + tsFiles[0];

    const start = Date.now();
    const tsRes = await axios.get(firstTs, {
      responseType: 'arraybuffer',
      timeout: DOWNLOAD_TIMEOUT,
    });
    const duration = (Date.now() - start) / 1000;

    if (duration < 0.05) throw new Error('too fast');

    const sizeKB = tsRes.data.byteLength / 1024;
    const speedMBps = sizeKB / duration / 1024;

    return { name, url, speed: speedMBps };
  } catch {
    return null;
  }
}