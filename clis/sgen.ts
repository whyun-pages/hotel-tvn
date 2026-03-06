#!/usr/bin/env node
/**
 * 解析 dist/result.json，提取为 { baseUrl, province, city } 并保存为 tv_service.json
 * baseUrl = ip:port，ip 取自 host.host.ip，port 从 highlights[1].json_path 中的 host.services[$index] 得到 index，再取 host.services[index].port
 */
import { TvServiceGenOptions } from '../types';
import { program } from 'commander';
import { genServiceJson } from '../scripts/gen-service-json';

program
  .command('parse-result-json')
  .description('解析 dist/result.json，提取为 { baseUrl, province, city } 并保存为 tv_service.json')
  .option('-i, --input-json-path <path>', '输入 JSON 文件路径（默认为 dist/result.json）')
  .option('-o, --output-json-path <path>', '输出 JSON 文件路径（默认为 tv_service.json）')
  .action((options: TvServiceGenOptions) => {
    genServiceJson(options);
  });
