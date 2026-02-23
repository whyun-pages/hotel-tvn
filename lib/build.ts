import fs from 'fs-extra';
import PQueue from 'p-queue';
import { ParsedChannel, Channel } from '../types';
import { getValidJsonUrls, fetchAndParseJson, testStreamSpeed, RESULT_LIMIT_PER_CHANNEL } from './utils';
const ENV = process.env;

export async function build() {
  console.log("开始收集有效 JSON 地址...");
  const validJsonUrls = await getValidJsonUrls();
  console.log(`找到 ${validJsonUrls.length} 个可能有效的 JSON`);

  const allChannels: ParsedChannel[] = [];
  const queue = new PQueue({ concurrency: 20 });

  for (const jsonUrl of validJsonUrls) {
    queue.add(async () => {
      const chans = await fetchAndParseJson(jsonUrl);
      allChannels.push(...chans);
      console.log(`从 ${jsonUrl} 获得 ${chans.length} 个频道`);
    });
  }

  await queue.onIdle();

  console.log(`共收集到 ${allChannels.length} 个原始频道，开始测速...`);

  const tested: Channel[] = [];
  const testQueue = new PQueue({ concurrency: 15 });

  for (const ch of allChannels) {
    testQueue.add(async () => {
      const result = await testStreamSpeed(ch);
      if (result) {
        tested.push(result);
        console.log(`可用 ${tested.length} | ${result.name} → ${result.speed!.toFixed(2)} MB/s`);
      }
    });
  }

  await testQueue.onIdle();

  // 排序：先按频道编号，再按速度降序
  tested.sort((a, b) => {
    const na = parseInt(a.name.match(/\d+/)?.[0] ?? '9999');
    const nb = parseInt(b.name.match(/\d+/)?.[0] ?? '9999');
    if (na !== nb) return na - nb;
    return (b.speed ?? 0) - (a.speed ?? 0);
  });

  // 分组
  const groups: Record<'CCTV' | '卫视' | '其他', Channel[]> = {
    CCTV: [],
    卫视: [],
    其他: [],
  };

  const counters: Record<'CCTV' | '卫视' | '其他', number> = {
    CCTV: 0,
    卫视: 0,
    其他: 0,
  };

  for (const ch of tested) {
    let group: 'CCTV' | '卫视' | '其他' = '其他';
    if (ch.name.includes('CCTV')) group = 'CCTV';
    else if (ch.name.includes('卫视')) group = '卫视';

    if (counters[group] >= RESULT_LIMIT_PER_CHANNEL) continue;

    groups[group].push(ch);
    counters[group]++;
  }

  // 生成 txt 文件
  let txtContent = '央视频道,#genre#\n';
  let m3u8Content = '#EXTM3U\n';
  for (const ch of groups.CCTV) {
    txtContent += `${ch.name},${ch.url}\n`;
    m3u8Content += `#EXTINF:-1 group-title="央视频道",${ch.name}\n${ch.url}\n`;
  }

  txtContent += '卫视频道,#genre#\n';
  for (const ch of groups.卫视) {
    txtContent += `${ch.name},${ch.url}\n`;
    m3u8Content += `#EXTINF:-1 group-title="卫视频道",${ch.name}\n${ch.url}\n`;
  }

  txtContent += '其他频道,#genre#\n';
  for (const ch of groups.其他) {
    txtContent += `${ch.name},${ch.url}\n`;
    m3u8Content += `#EXTINF:-1 tv-logo="https://tv-res.pages.dev/logo/${ch.name}.png" group-title="其他频道",${ch.name}\n${ch.url}\n`;
  }

  await fs.writeFile('lives.txt', txtContent, 'utf-8');
  await fs.writeFile('lives.m3u', m3u8Content, 'utf-8');

  console.log("完成！生成 lives.txt 和 lives.m3u8");
}




