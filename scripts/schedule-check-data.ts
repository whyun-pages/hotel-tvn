import fs from 'node:fs/promises';
import { GenOptions } from '../types';
import { build } from './check-data-json';
async function main() {
  let configJson: string | undefined;
  try {
    configJson = await fs.readFile('schedule-config.json', 'utf-8');
  } catch (error) {
    console.warn('读取 schedule-config.json 失败', error);
  }
  const config: GenOptions = configJson ? JSON.parse(configJson) : {};
  await build(config);
}
main().then(() => {
  console.log('完成');
  process.exit(0);
}).catch((error) => {
  console.error('程序执行出错:', error);
  process.exit(1);
});