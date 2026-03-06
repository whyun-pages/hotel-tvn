#!/usr/bin/env node

import { program } from 'commander';
import { build } from '../scripts/check-data-json';
import type { GenOptions } from '../types';

program
  .name('tvn')
  .description('酒店 TV 源生成：从 data JSON 检测可用链接并生成 lives.txt / lives.m3u')
  .option(
    '-d, --data-json-path <path>',
    'data JSON 文件路径（默认为 tv_service.json）'
  )
  .option(
    '-o, --live-result-dir <dir>',
    '直播结果输出目录（lives.txt、lives.m3u 写入目录）'
  )
  .option(
    '--concurrency-json <n>',
    'JSON 链接检测并发数',
    (v) => parseInt(v, 10),
    undefined
  )
  .option(
    '--concurrency-stream <n>',
    '流测速并发数',
    (v) => parseInt(v, 10),
    undefined
  )
  .action(async (cliOpts: Record<string, unknown>) => {
    const options: GenOptions = {};
    if (cliOpts.dataJsonPath != null) {
      options.dataJsonPath = String(cliOpts.dataJsonPath);
    }
    if (cliOpts.liveResultDir != null) {
      options.liveResultDir = String(cliOpts.liveResultDir);
    }
    if (typeof cliOpts.concurrencyJson === 'number') {
      options.concurrencyJson = cliOpts.concurrencyJson;
    }
    if (typeof cliOpts.concurrencyStream === 'number') {
      options.concurrencyStream = cliOpts.concurrencyStream;
    }

    await build(options);
  });

program.parse();
