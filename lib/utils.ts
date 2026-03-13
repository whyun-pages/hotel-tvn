import fs from 'fs-extra';
import Bottleneck from 'bottleneck';
import axios from 'axios';
import { ParsedChannel } from '../types';
import { Channel } from '../types';
import path from 'path';

const REQUEST_TIMEOUT = 800;
const DOWNLOAD_TIMEOUT = 5000;
export const RESULT_LIMIT_PER_CHANNEL = 1024;

// 限流器
const limiter = new Bottleneck({
  maxConcurrent: 30,
  minTime: 150,
});

const jsonUrls = [
  'http://183.223.157.33:9901/iptv/live/1000.json?key=txiptv',
  'http://117.174.99.170:9901/iptv/live/1000.json?key=txiptv',
];
interface ChannelItem {
  name: string;
  url: string;
  typename: string;
}
type ChannelGroup = 'CCTV' | '卫视' | '其他';

/**
 * 根据基础 IP 生成 1~255 的所有候选地址
 */
export function generateModifiedIPs(baseUrl: string): string[] {
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
export async function checkUrlAlive(url: string): Promise<string | null> {
  try {
    const res = await limiter.schedule(() => axios.head(url, { timeout: REQUEST_TIMEOUT }));
    if (res.status === 200) {
      return url;
    }
    console.log(`${url} is not alive, status: ${res.status}, ${res.data}`);
  } catch (_e) {
    // console.log(`${url} is not alive, error: ${e}`);
    // 静默失败
  }
  return null;
}

export async function getValidJsonUrlsFromLocalUrls(): Promise<string[]> {
  const okUrls: string[] = [];
  await Promise.all(
    jsonUrls.map(async (url) => {
      const res = await checkUrlAlive(url);
      if (res) {
        okUrls.push(res);
      }
    })
  );
  return okUrls;
}

/**
 * 从 JSON 地址获取并解析频道列表
 */
export async function fetchAndParseJson(url: string): Promise<ParsedChannel[]> {
  try {
    const res = await axios.get(url, { timeout: 2000 });
    if (res.status !== 200 || !res.data?.data) {
return [];
}

    const base = url.replace(/\/iptv\/live\/.*$/, '/');
    const items: ParsedChannel[] = [];

    for (const it of (res.data.data as ChannelItem[]) || []) {
      let name = String(it.name || '').trim();
      const urlx = String(it.url || '').trim();

      if (!name || !urlx) {
continue;
}
      if (urlx.includes(',')) {
continue;
}

      // 清洗名称
      name = name
        .replace(/cctv/gi, 'CCTV')
        .replace(/(中央|央视)/g, 'CCTV')
        .replace(/高清|超高|HD|标清|频道|-|—|\s/g, '')
        .replace(/[＋()]/g, (s) => (s === '＋' ? '+' : ''))
        .replace(/PLUS/gi, '+')
        .replace(/CCTV(\d+)台/, 'CCTV$1')
        .replace(/CCTV5\+体育(?:赛事|赛视)?/, 'CCTV5+')
        .replace('CCTV1综合', 'CCTV1')
        .replace('CCTV2财经', 'CCTV2')
        .replace('CCTV3综艺', 'CCTV3')
        .replace('CCTV4国际', 'CCTV4')
        .replace('CCTV4中文国际', 'CCTV4')
        .replace('CCTV4欧洲', 'CCTV4')
        .replace('CCTV5体育', 'CCTV5')
        .replace('CCTV6电影', 'CCTV6')
        .replace('CCTV7军事', 'CCTV7')
        .replace('CCTV7军农', 'CCTV7')
        .replace('CCTV7农业', 'CCTV7')
        .replace('CCTV7国防军事', 'CCTV7')
        .replace('CCTV8电视剧', 'CCTV8')
        .replace('CCTV9记录', 'CCTV9')
        .replace('CCTV9纪录', 'CCTV9')
        .replace('CCTV10科教', 'CCTV10')
        .replace('CCTV11戏曲', 'CCTV11')
        .replace('CCTV12社会与法', 'CCTV12')
        .replace('CCTV13新闻', 'CCTV13')
        .replace('CCTV新闻', 'CCTV13')
        .replace('CCTV14少儿', 'CCTV14')
        .replace('CCTV少儿', 'CCTV14')
        .replace('CCTV15音乐', 'CCTV15')
        .replace('CCTV音乐', 'CCTV15')
        .replace('CCTV16奥林匹克', 'CCTV16')
        .replace('CCTV17农业农村', 'CCTV17')
        .replace('CCTV17农村农业', 'CCTV17')
        .replace('CCTV17农业', 'CCTV17')
        .replace('CCTVCCTV台球', 'CCTV台球')
        .replace('上海卫视', '东方卫视');

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
    if (m3u8Res.status !== 200) {
throw new Error('m3u8 failed');
}

    const lines = m3u8Res.data.split('\n').map((l: string) => l.trim());
    const tsFiles = lines.filter((l: string) => !l.startsWith('#') && l);

    if (tsFiles.length === 0) {
throw new Error('no ts');
}

    const base = url.substring(0, url.lastIndexOf('/') + 1);
    const firstTs = base + tsFiles[0];

    const start = Date.now();
    const tsRes = await axios.get(firstTs, {
      responseType: 'arraybuffer',
      timeout: DOWNLOAD_TIMEOUT,
    });
    const duration = (Date.now() - start) / 1000;

    if (duration < 0.05) {
throw new Error('too fast');
}

    const sizeKB = tsRes.data.byteLength / 1024;
    const speedMBps = sizeKB / duration / 1024;

    return { name, url, speed: speedMBps };
  } catch {
    return null;
  }
}

function genChannelContent(group: string, ch: Channel) {
  const logo = `https://tv-res.pages.dev/logo/${ch.name}.png`;

  return {
    txt: `${ch.name},${ch.url}\n`,
    m3u8: `#EXTINF:-1 tvg-id="${ch.name}" tvg-name="${ch.name}" tvg-logo="${logo}" group-title="${group}",${ch.name}\n${ch.url}\n`,
  };
}
export async function genLiveFiles(tested: Channel[], liveResultDir?: string) {
  // 分组
  const groups: Record<ChannelGroup, Channel[]> = {
    CCTV: [],
    卫视: [],
    其他: [],
  };

  const counters: Record<ChannelGroup, number> = {
    CCTV: 0,
    卫视: 0,
    其他: 0,
  };

  for (const ch of tested) {
    let group: ChannelGroup = '其他';
    if (ch.name.includes('CCTV')) {
group = 'CCTV';
} else if (ch.name.includes('卫视')) {
group = '卫视';
}

    if (counters[group] >= RESULT_LIMIT_PER_CHANNEL) {
continue;
}

    groups[group].push(ch);
    counters[group]++;
  }
  for (const group of Object.keys(groups) as ChannelGroup[]) {
    groups[group as ChannelGroup].sort((a, b) => {
      if (group === 'CCTV') {
        const channelIdA = a.name.match(/\d+/)?.[0] ?? '9999';
        const channelIdB = b.name.match(/\d+/)?.[0] ?? '9999';
        if (channelIdA !== channelIdB) {
          return parseInt(channelIdA, 10) - parseInt(channelIdB, 10);
        }
      } else {
        const nameCompare = a.name.localeCompare(b.name);
        if (nameCompare !== 0) {
          return nameCompare;
        }
      }
      return (b.speed ?? 0) - (a.speed ?? 0);
    });
  }

  // 生成 txt 文件
  let txtContent = '央视频道,#genre#\n';
  let m3u8Content = '#EXTM3U x-tvg-url="https://tv.whyun.com/epg/51zmt.xml"\n';
  for (const ch of groups.CCTV) {
    const { txt, m3u8 } = genChannelContent('央视频道', ch);
    txtContent += txt;
    m3u8Content += m3u8;
  }

  txtContent += '卫视频道,#genre#\n';
  for (const ch of groups.卫视) {
    const { txt, m3u8 } = genChannelContent('卫视频道', ch);
    txtContent += txt;
    m3u8Content += m3u8;
  }

  txtContent += '其他频道,#genre#\n';
  for (const ch of groups.其他) {
    const { txt, m3u8 } = genChannelContent('其他频道', ch);
    txtContent += txt;
    m3u8Content += m3u8;
  }

  await fs.writeFile(path.join(liveResultDir || '', 'lives.txt'), txtContent, 'utf-8');
  await fs.writeFile(path.join(liveResultDir || '', 'lives.m3u'), m3u8Content, 'utf-8');
}
/** 转换：http://A.B.C.D:port -> http://A.B.C.1:port */

export function toBaseUrl(u: string): string | null {
  const m = u.match(/http:\/\/(\d+\.\d+\.\d+)\.\d+:\d+/);
  return m ? `http://${m[1]}.1${u.match(/:\d+/)![0]}` : null;
}
