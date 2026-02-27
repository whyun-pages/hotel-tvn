// import fs from 'fs-extra';
import PQueue from 'p-queue';
import { ParsedChannel, Channel } from '../types';
import {
  getValidJsonUrls,
  fetchAndParseJson,
  testStreamSpeed,
  getValidJsonUrlsFromLocalUrls,
  genLiveFiles,
} from './utils';
const ENV = process.env;

export async function build() {
  console.log("开始收集有效 JSON 地址...");
  const validJsonUrls = ENV.USE_LOCAL_URLS === 'true' 
    ? await getValidJsonUrlsFromLocalUrls()
    : await getValidJsonUrls();
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

  await genLiveFiles(tested);

  console.log("完成！生成 lives.txt 和 lives.m3u8");
}




