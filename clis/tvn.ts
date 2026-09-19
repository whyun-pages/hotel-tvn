#!/usr/bin/env node

import { build } from '../scripts/check-data-json';
import { parseArgs, parseOptionalInt } from '../lib/cli';
import type { GenOptions } from '../types';

const HELP = `Usage: tvn [options]

酒店 TV 源生成：从 data JSON 检测可用链接并生成 lives.txt / lives.m3u

Options:
  -d, --data-json-path <path>  data JSON 文件路径（默认为 tv_service.json）
  -o, --live-result-dir <dir>  直播结果输出目录（lives.txt、lives.m3u 写入目录）
  --concurrency-json <n>       JSON 链接检测并发数
  --concurrency-stream <n>     流测速并发数
  -h, --help                   display help for command`;

async function main(args: string[]): Promise<void> {
  const parsed = parseArgs(args, [
    { long: '--data-json-path', short: '-d' },
    { long: '--live-result-dir', short: '-o' },
    { long: '--concurrency-json' },
    { long: '--concurrency-stream' },
  ]);

  if (parsed.help) {
    console.log(HELP);
    return;
  }
  if (parsed.error != null) {
    console.error(`error: ${parsed.error}`);
    console.error(HELP);
    process.exitCode = 1;
    return;
  }

  const concurrencyJson = parseOptionalInt(
    parsed.values['--concurrency-json'],
    '--concurrency-json'
  );
  const concurrencyStream = parseOptionalInt(
    parsed.values['--concurrency-stream'],
    '--concurrency-stream'
  );
  const parseError = concurrencyJson.error ?? concurrencyStream.error;
  if (parseError != null) {
    console.error(`error: ${parseError}`);
    process.exitCode = 1;
    return;
  }

  const options: GenOptions = {};
  const dataJsonPath = parsed.values['--data-json-path'];
  const liveResultDir = parsed.values['--live-result-dir'];
  if (typeof dataJsonPath === 'string') {
    options.dataJsonPath = dataJsonPath;
  }
  if (typeof liveResultDir === 'string') {
    options.liveResultDir = liveResultDir;
  }
  if (concurrencyJson.value != null) {
    options.concurrencyJson = concurrencyJson.value;
  }
  if (concurrencyStream.value != null) {
    options.concurrencyStream = concurrencyStream.value;
  }

  await build(options);
}

void main(process.argv.slice(2));
