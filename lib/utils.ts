import fs from 'node:fs';
// import Bottleneck from 'bottleneck';
import { ParsedChannel } from '../types';
import { Channel } from '../types';
import path from 'node:path';

const REQUEST_TIMEOUT = 800;
const DOWNLOAD_TIMEOUT = 5000;
export const RESULT_LIMIT_PER_CHANNEL = 1024;

type AbortControllerConstructor = new () => AbortController;

function createTimeoutSignal(timeout: number) {
  const AbortControllerCtor = (globalThis as typeof globalThis & {
    AbortController?: AbortControllerConstructor;
  }).AbortController;
  if (!AbortControllerCtor) {
    return undefined;
  }

  const controller = new AbortControllerCtor();
  const timer = setTimeout(() => controller.abort(), timeout);
  timer.unref?.();
  return controller.signal;
}

function fetchWithTimeout(url: string, init: RequestInit | undefined, timeout: number) {
  return fetch(url, {
    ...init,
    signal: createTimeoutSignal(timeout),
  });
}

// 限流器
// const limiter = new Bottleneck({
//   maxConcurrent: 30,
//   minTime: 150,
// });

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

const CHANNEL_NAME_REPLACEMENTS: Array<[RegExp | string, string]> = [
  [/cctv/gi, 'CCTV'],
  [/(中央|央视)/g, 'CCTV'],
  [/高清|超高|HD|标清|频道|-|—|\s/g, ''],
  [/＋/g, '+'],
  [/[()]/g, ''],
  [/PLUS/gi, '+'],
  [/CCTV(\d+)台/, 'CCTV$1'],
  [/CCTV5\+体育(?:赛事|赛视)?/, 'CCTV5+'],
  ['CCTV1综合', 'CCTV1'],
  ['CCTV2财经', 'CCTV2'],
  ['CCTV3综艺', 'CCTV3'],
  ['CCTV4国际', 'CCTV4'],
  ['CCTV4中文国际', 'CCTV4'],
  ['CCTV4欧洲', 'CCTV4'],
  ['CCTV5体育', 'CCTV5'],
  ['CCTV6电影', 'CCTV6'],
  ['CCTV7军事', 'CCTV7'],
  ['CCTV7军农', 'CCTV7'],
  ['CCTV7农业', 'CCTV7'],
  ['CCTV7国防军事', 'CCTV7'],
  ['CCTV8电视剧', 'CCTV8'],
  ['CCTV9记录', 'CCTV9'],
  ['CCTV9纪录', 'CCTV9'],
  ['CCTV10科教', 'CCTV10'],
  ['CCTV11戏曲', 'CCTV11'],
  ['CCTV12社会与法', 'CCTV12'],
  ['CCTV13新闻', 'CCTV13'],
  ['CCTV新闻', 'CCTV13'],
  ['CCTV14少儿', 'CCTV14'],
  ['CCTV少儿', 'CCTV14'],
  ['CCTV15音乐', 'CCTV15'],
  ['CCTV音乐', 'CCTV15'],
  ['CCTV16奥林匹克', 'CCTV16'],
  ['CCTV17农业农村', 'CCTV17'],
  ['CCTV17农村农业', 'CCTV17'],
  ['CCTV17农业', 'CCTV17'],
  ['CCTVCCTV台球', 'CCTV台球'],
  ['上海卫视', '东方卫视'],
];

function normalizeChannelName(name: string) {
  let normalized = name;
  for (const [pattern, replacement] of CHANNEL_NAME_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

const MIN_RATIO_TOLERANCE = Number(process.env.MIN_RATIO_TOLERANCE) || 0.99;

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
    const res = await fetchWithTimeout(
      url,
      {
      method: 'HEAD',
      },
      REQUEST_TIMEOUT
    );
    if (res.status === 200) {
      return url;
    }
    console.log(`${url} is not alive, status: ${res.status}`);
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
    const res = await fetchWithTimeout(url, undefined, 2000);
    const data = (await res.json()) as { data?: ChannelItem[] };

    // 第 2 步：响应失败，或没有可解析的 data 字段时直接返回空数组
    if (res.status !== 200 || !data.data) {
      return [];
    }

    // 第 3 步：提取当前 JSON 所在目录，用于补全相对地址
    const base = url.replace(/\/iptv\/live\/.*$/, '');
    const items: ParsedChannel[] = [];

    // 第 4 步：遍历原始频道项，逐条过滤并转换为统一结构
    for (const it of data.data || []) {
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
      name = normalizeChannelName(name);

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
 * 直播源深度检测的采样分片数（从倒数第二个分片往前取）
 */
const DEEP_CHECK_SEGMENTS = Number(process.env.DEEP_CHECK_SEGMENTS) || 3;
/**
 * 单个分片下载超时的下限，实际超时按分片时长动态放大
 */
const DOWNLOAD_TIMEOUT_MIN = DOWNLOAD_TIMEOUT;
/**
 * 等待 m3u8 列表前进的最长时间
 */
const PLAYLIST_ADVANCE_WAIT_MAX = 10000;

interface PlaylistSegment {
  url: string;
  duration?: number;
}

export interface ParsedPlaylist {
  segments: PlaylistSegment[];
  mediaSequence?: number;
  targetDuration?: number;
  isLive: boolean;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function parseM3u8(text: string, baseUrl: string): ParsedPlaylist {
  const playlist: ParsedPlaylist = { segments: [], isLive: true };
  let pendingDuration: number | undefined;

  for (const rawLine of text.split('\n')) {
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

    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      const seq = Number.parseInt(line.slice('#EXT-X-MEDIA-SEQUENCE:'.length).trim(), 10);
      if (Number.isFinite(seq)) {
        playlist.mediaSequence = seq;
      }
      continue;
    }

    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      const target = Number.parseFloat(line.slice('#EXT-X-TARGETDURATION:'.length).trim());
      if (Number.isFinite(target)) {
        playlist.targetDuration = target;
      }
      continue;
    }

    if (line.startsWith('#EXT-X-ENDLIST')) {
      playlist.isLive = false;
      continue;
    }

    if (line.startsWith('#')) {
      continue;
    }

    playlist.segments.push({
      url: new URL(line, baseUrl).toString(),
      duration: pendingDuration,
    });
    pendingDuration = undefined;
  }

  return playlist;
}

async function fetchPlaylist(url: string): Promise<ParsedPlaylist> {
  const res = await fetchWithTimeout(url, undefined, 1500);
  if (res.status !== 200) {
    throw new Error('m3u8 failed');
  }
  return parseM3u8(await res.text(), url);
}

/**
 * 判断第二次拉取的 m3u8 相对第一次是否有前进（直播源仍在持续产流）
 */
function hasPlaylistAdvanced(before: ParsedPlaylist, after: ParsedPlaylist) {
  if (before.mediaSequence !== undefined && after.mediaSequence !== undefined) {
    return after.mediaSequence > before.mediaSequence;
  }
  const lastBefore = before.segments[before.segments.length - 1]?.url;
  const lastAfter = after.segments[after.segments.length - 1]?.url;
  return lastBefore !== lastAfter;
}

/**
 * 深度检测单个直播源
 * 处理流程：
 * 1. 拉取 m3u8，从倒数第二个分片往前连续取 DEEP_CHECK_SEGMENTS 个分片
 * 2. 逐个下载分片，超时按分片时长动态计算，记录每个分片的时间比
 * 3. 取时间比的中位数与 MIN_RATIO_TOLERANCE 比较
 * 4. 直播列表等待至少一个分片时长后再拉一次 m3u8，确认列表有前进
 */
export async function testStreamSpeed(channel: ParsedChannel): Promise<Channel | null> {
  const { name, url } = channel;

  try {
    const startedAt = Date.now();
    const playlist = await fetchPlaylist(url);

    if (playlist.segments.length === 0) {
      throw new Error('no ts');
    }

    // 倒数第二个分片最接近直播边缘，又不至于还在写入中
    const endIndex = playlist.segments.length >= 2 ? playlist.segments.length - 2 : 0;
    const startIndex = Math.max(0, endIndex - DEEP_CHECK_SEGMENTS + 1);
    const samples = playlist.segments.slice(startIndex, endIndex + 1);

    const ratios: number[] = [];
    const segmentDurations: number[] = [];
    let totalSizeKB = 0;
    let totalSeconds = 0;

    for (const segment of samples) {
      const timeout = segment.duration
        ? Math.max(DOWNLOAD_TIMEOUT_MIN, (segment.duration / MIN_RATIO_TOLERANCE) * 1.2 * 1000)
        : DOWNLOAD_TIMEOUT_MIN;

      const start = Date.now();
      const tsRes = await fetchWithTimeout(segment.url, undefined, timeout);
      const sizeKB = (await tsRes.arrayBuffer()).byteLength / 1024;
      const duration = (Date.now() - start) / 1000;

      if (duration < 0.05) {
        throw new Error('too fast');
      }

      totalSizeKB += sizeKB;
      totalSeconds += duration;
      ratios.push(segment.duration ? segment.duration / duration : 0);
      if (segment.duration) {
        segmentDurations.push(segment.duration);
      }
    }

    const timeRatio = median(ratios);
    const segmentDuration = segmentDurations.length ? median(segmentDurations) : undefined;
    const speedMBps = (totalSizeKB / totalSeconds / 1024).toFixed(2);

    if (timeRatio < MIN_RATIO_TOLERANCE) {
      console.warn(
        `频道 ${name} 的 ts 播放过于卡顿，时间比 ${timeRatio.toFixed(2)} 低于容忍阈值 ${MIN_RATIO_TOLERANCE}，已跳过`
      );
      return null;
    }

    if (playlist.isLive) {
      const lastSegment = playlist.segments[playlist.segments.length - 1];
      const refreshSeconds =
        playlist.targetDuration ?? lastSegment.duration ?? segmentDuration ?? 0;
      const waitMs = Math.min(
        PLAYLIST_ADVANCE_WAIT_MAX,
        refreshSeconds * 1000 - (Date.now() - startedAt)
      );
      if (waitMs > 0) {
        await sleep(waitMs);
      }

      const refreshed = await fetchPlaylist(url);
      if (!hasPlaylistAdvanced(playlist, refreshed)) {
        throw new Error('playlist not advancing');
      }
    }

    return { name, url, speed: speedMBps, segmentDuration, timeRatio: timeRatio.toFixed(2) };
  } catch (err) {
    if (err instanceof Error) {
      console.warn(`请求失败: ${name} (${url})`, err.name, err.message);
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
    new Promise<void>((resolve, reject) => {
      fs.writeFile(
        path.join(liveResultDir || '', 'channels.json'),
        JSON.stringify(groups, null, 2),
        'utf-8',
        (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        }
      );
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
