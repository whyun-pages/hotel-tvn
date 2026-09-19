import { ParsedChannel, Channel } from '../types';
import {
  fetchAndParseJson,
  testStreamSpeed,
  getValidJsonUrlsFromLocalUrls,
  genLiveFiles,
} from './utils';
import { runWithConcurrency } from './concurrency';

export async function build() {
  console.log('开始收集有效 JSON 地址...');
  const validJsonUrls = await getValidJsonUrlsFromLocalUrls();
  console.log(`找到 ${validJsonUrls.length} 个可能有效的 JSON`);

  const allChannels: ParsedChannel[] = [];
  await runWithConcurrency(validJsonUrls, 20, async (jsonUrl) => {
    const chans = await fetchAndParseJson(jsonUrl);
    allChannels.push(...chans);
    console.log(`从 ${jsonUrl} 获得 ${chans.length} 个频道`);
  });

  console.log(`共收集到 ${allChannels.length} 个原始频道，开始测速...`);

  const tested: Channel[] = [];
  await runWithConcurrency(allChannels, 15, async (ch) => {
    const result = await testStreamSpeed(ch);
    if (result) {
      tested.push(result);
      console.log(
        `可用 ${tested.length} | ${result.name} → ${result.speed!.toFixed(2)} MB/s`,
        process.memoryUsage()
      );
    }
  });

  await genLiveFiles(tested);

  console.log('完成！生成 lives.txt 和 lives.m3u8');
}
