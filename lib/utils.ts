import fs from 'fs-extra';
import Bottleneck from 'bottleneck';
import axios, { AxiosError } from 'axios';
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

const MIN_RATIO_TOLERANCE = Number(process.env.MIN_RATIO_TOLERANCE) || 0.5;

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
/**
 * 从本地获取可用的 JSON 地址，仅作本地测试用
 */
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
 * 处理流程：
 * 1. 拉取远端 JSON 数据
 * 2. 校验响应结构是否符合预期
 * 3. 计算相对播放地址所需的基地址
 * 4. 过滤无效频道项并规范化名称
 * 5. 输出统一格式的频道列表
 */
export async function fetchAndParseJson(url: string): Promise<ParsedChannel[]> {
  try {
    // 第 1 步：请求远端 JSON 数据
    const res = await axios.get(url, { timeout: 2000 });

    // 第 2 步：响应失败，或没有可解析的 data 字段时直接返回空数组
    if (res.status !== 200 || !res.data?.data) {
      return [];
    }

    // 第 3 步：提取当前 JSON 所在目录，用于补全相对地址
    const base = url.replace(/\/iptv\/live\/.*$/, '');
    const items: ParsedChannel[] = [];

    // 第 4 步：遍历原始频道项，逐条过滤并转换为统一结构
    for (const it of (res.data.data as ChannelItem[]) || []) {
      let name = String(it.name || '').trim();
      const urlx = String(it.url || '').trim();

      // 跳过名称或播放地址为空的脏数据
      if (!name || !urlx) {
        continue;
      }
      // 跳过包含多个地址的聚合字段，避免后续解析异常
      if (urlx.includes(',')) {
        continue;
      }

      // 统一频道名称格式，便于后续分组、排序和去重
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

      // 第 5 步：将相对地址补全为绝对地址，并写入最终结果
      let finalUrl = urlx;
      if (urlx.startsWith('http')) {
        finalUrl = urlx;
      } else if (urlx.startsWith('/')) {
        finalUrl = base + urlx;
      } else if (urlx.indexOf('://') !== -1) {
        console.warn(`频道 ${name} 的 URL 字段 ${urlx} 格式异常，无法解析出有效地址，已跳过`);
        continue;
      } else {
        finalUrl = base + '/' + urlx;
      }

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

    let firstTsFile = '';
    let segmentDuration: number | undefined;
    let pendingDuration: number | undefined;

    for (const rawLine of String(m3u8Res.data).split('\n')) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      if (line.startsWith('#EXTINF:')) {
        const durationText = line.slice('#EXTINF:'.length).split(',')[0]?.trim();
        const parsedDuration = Number.parseFloat(durationText);
        pendingDuration = Number.isFinite(parsedDuration) ? parsedDuration : undefined;
        continue;
      }

      if (!line.startsWith('#')) {
        // 取到第一个非注释行即第一个 ts 文件
        firstTsFile = line;
        segmentDuration = pendingDuration;
        break;
      }
    }

    if (!firstTsFile) {
      throw new Error('no ts');
    }
    const firstTs = new URL(firstTsFile, url).toString();

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
    const speedMBps = (sizeKB / duration / 1024).toFixed(2);
    const timeRatio = segmentDuration ? segmentDuration / duration : 0;
    if (timeRatio < MIN_RATIO_TOLERANCE) {
      console.warn(
        `频道 ${name} 的 ts 播放过于卡顿，时间比 ${timeRatio.toFixed(2)} 低于容忍阈值 ${MIN_RATIO_TOLERANCE}，已跳过`
      );
      return null;
    }
    return { name, url, speed: speedMBps, segmentDuration, timeRatio: timeRatio.toFixed(2) };
  } catch (err) {
    if (err instanceof AxiosError) {
      console.warn(`请求失败: ${name} (${url})`, err.code, err.message, err.response?.status);
    } else {
      console.warn(`测速失败: ${name} (${url})`, err);
    }
    return null;
  }
}

function genChannelContent(group: string, ch: Channel) {
  const logo = `https://tv-res.pages.dev/logo/${ch.name?.replaceAll('CCTV', 'cctv')}.png`;

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

    // if (counters[group] >= RESULT_LIMIT_PER_CHANNEL) {
    //   continue;
    // }

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
      return (Number(b.timeRatio) || 0) - (Number(a.timeRatio) || 0);
    });
  }

  // 生成 txt 文件
  const txtStream = fs.createWriteStream(path.join(liveResultDir || '', 'lives.txt'));
  const m3u8Stream = fs.createWriteStream(path.join(liveResultDir || '', 'lives.m3u'));
  const txtStart = '央视频道,#genre#\n';
  txtStream.write(txtStart);
  const m3u8Start = '#EXTM3U x-tvg-url="https://tv.whyun.com/epg/51zmt.xml"\n';
  m3u8Stream.write(m3u8Start);
  for (const ch of groups.CCTV) {
    const { txt, m3u8 } = genChannelContent('央视频道', ch);
    txtStream.write(txt);
    m3u8Stream.write(m3u8);
  }

  txtStream.write('卫视频道,#genre#\n');
  for (const ch of groups.卫视) {
    const { txt, m3u8 } = genChannelContent('卫视频道', ch);
    txtStream.write(txt);
    m3u8Stream.write(m3u8);
  }

  txtStream.write('其他频道,#genre#\n');
  for (const ch of groups.其他) {
    const { txt, m3u8 } = genChannelContent('其他频道', ch);
    txtStream.write(txt);
    m3u8Stream.write(m3u8);
  }
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      txtStream.on('finish', resolve);
      txtStream.on('error', reject);
      txtStream.end();
    }),
    new Promise<void>((resolve, reject) => {
      m3u8Stream.on('finish', resolve);
      m3u8Stream.on('error', reject);
      m3u8Stream.end();
    }),
  ]);
}
/** 转换：http://A.B.C.D:port -> http://A.B.C.1:port */

export function toBaseUrl(u: string): string | null {
  const m = u.match(/http:\/\/(\d+\.\d+\.\d+)\.\d+:\d+/);
  return m ? `http://${m[1]}.1${u.match(/:\d+/)![0]}` : null;
}

export function getMemoryUsage() {
  const memoryUsage = process.memoryUsage();
  return {
    rss: memoryUsage.rss / 1024 / 1024,
    heapTotal: memoryUsage.heapTotal / 1024 / 1024,
    heapUsed: memoryUsage.heapUsed / 1024 / 1024,
  };
}
