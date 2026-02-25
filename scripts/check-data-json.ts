/**
 * 脚本流程：
 * 1. 读取 data.json，按 utils 中的规则将每个 URL 转为 baseUrl（x.x.x.1:port）
 * 2. 用 generateModifiedIPs 生成内网 JSON 链接（1~255）
 * 3. 用 checkUrlAlive 检测每个 JSON 链接可用性
 * 4. 对可用 JSON 用 fetchAndParseJson 获取频道列表
 * 5. 用 testStreamSpeed 检测每个频道链接是否可访问
 * 6. 生成 lives.txt 和 lives.m3u8
 */
import * as fs from 'fs';
import * as path from 'path';
import PQueue from 'p-queue';
import {
  generateModifiedIPs,
  checkUrlAlive,
  fetchAndParseJson,
  testStreamSpeed,
  toBaseUrl,
  genLiveFiles,
} from '../lib/utils';
import { Channel } from '../types';

const DATA_JSON_PATH = path.join(__dirname, '../data.json');
const CONCURRENCY_JSON = 60;
const CONCURRENCY_STREAM = 16;

export async function build() {
  const raw = fs.readFileSync(DATA_JSON_PATH, 'utf-8');
  const urls: string[] = JSON.parse(raw);
  if (!Array.isArray(urls) || urls.length === 0) {
    console.log('data.json 为空或格式不正确');
    return;
  }

  // 1. 转为 baseUrl 并去重
  const baseUrls = [...new Set(
    urls
      .map(toBaseUrl)
      .filter((v): v is string => !!v)
  )];
  console.log(`data.json 共 ${urls.length} 条 URL，得到 ${baseUrls.length} 个 baseUrl`);

  // 2. 生成所有候选 JSON 链接
  const allJsonCandidates: string[] = [];
  for (const base of baseUrls) {
    allJsonCandidates.push(...generateModifiedIPs(base));
  }
  console.log(`共生成 ${allJsonCandidates.length} 个 JSON 候选链接`);

  // 3. 检测 JSON 链接可用性
  const queueJson = new PQueue({ concurrency: CONCURRENCY_JSON });
  const aliveJsonUrls: string[] = [];
  const settled = await Promise.allSettled(
    allJsonCandidates.map((url) =>
      queueJson.add(async () => {
        const res = await checkUrlAlive(url);
        if (res) {
          aliveJsonUrls.push(res);
          console.log(`[可用] ${res}`);
        }
      })
    )
  );
  console.log(`\n可用 JSON 链接数: ${aliveJsonUrls.length}`);

  if (aliveJsonUrls.length === 0) {
    console.log('没有可用的 JSON 链接，结束');
    return;
  }

  // 4. 获取每个 JSON 的频道列表（去重频道名 + url）
  const channelMap = new Map<string, { name: string; url: string }>();
  for (const jsonUrl of aliveJsonUrls) {
    const channels = await fetchAndParseJson(jsonUrl);
    for (const ch of channels) {
      const key = `${ch.name}|${ch.url}`;
      if (!channelMap.has(key)) channelMap.set(key, ch);
    }
  }
  const allChannels = [...channelMap.values()];
  console.log(`\n共解析到 ${allChannels.length} 个不重复频道`);

  if (allChannels.length === 0) {
    console.log('没有解析到频道，结束');
    return;
  }

  // 5. 测速检测频道是否可访问
  const queueStream = new PQueue({ concurrency: CONCURRENCY_STREAM });
  const okChannels: Channel[] = [];
  let done = 0;
  await Promise.all(
    allChannels.map((ch) =>
      queueStream.add(async () => {
        const result = await testStreamSpeed(ch);
        if (result) {
          okChannels.push(result);
          console.log(`[可播] ${result.name} (${(result.speed! * 1024).toFixed(2)} MB/s)`);
        }
        done++;
        if (done % 50 === 0) console.log(`测速进度: ${done}/${allChannels.length}`);
      })
    )
  );

  console.log(`\n可播放频道数: ${okChannels.length}/${allChannels.length}`);
  // // 可选：把结果写到文件
  // const outPath = path.join(__dirname, '../data-check-result.json');
  // fs.writeFileSync(
  //   outPath,
  //   JSON.stringify(
  //     {
  //       aliveJsonUrls,
  //       channelCount: allChannels.length,
  //       playableCount: okChannels.length,
  //       playableChannels: okChannels,
  //     },
  //     null,
  //     2
  //   ),
  //   'utf-8'
  // );
  // console.log(`结果已写入 ${outPath}`);
  await genLiveFiles(okChannels);
}

// build().catch((e) => {
//   console.error(e);
//   process.exit(1);
// });
