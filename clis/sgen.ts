#!/usr/bin/env node
/**
 * 解析 Censys / Quake 的搜索结果，提取为 { baseUrl, province, city } 并保存为 tv_service.json
 * Censys: baseUrl = ip:port，ip 取自 host.host.ip，port 从 highlights[1].json_path 中的 host.services[$index] 得到 index，再取 host.services[index].port
 * Quake: baseUrl = ip:port，ip 和 port 取自 id（形如 ip_port_tcp），因为低权限账号下 ip 字段会被打码
 */
import { QuakeFetchOptions, QuakeGenOptions, TvServiceGenOptions } from '../types';
import { genServiceJson } from '../scripts/gen-service-json';
import {
  DEFAULT_QUAKE_QUERY,
  fetchQuakeServiceJson,
  genServiceJsonFromQuake,
} from '../scripts/gen-service-json-quake';
import { parseArgs, parseOptionalInt } from '../lib/cli';

const ROOT_HELP = `Usage: sgen [options] [command]

Commands:
  parse-result-json [options]  解析 Censys 的 dist/result.json，提取为 { baseUrl, province, city } 并保存为 tv_service.json
  parse-quake-json [options]   解析 Quake 的搜索结果 JSON，提取为 { baseUrl, province, city } 并保存为 tv_service.json
  fetch-quake [options]        调用 Quake API 拉取搜索结果并保存为 tv_service.json

Options:
  -h, --help                   display help for command`;

const PARSE_HELP = `Usage: sgen parse-result-json [options]

解析 dist/result.json，提取为 { baseUrl, province, city } 并保存为 tv_service.json

Options:
  -i, --input-json-path <path>   输入 JSON 文件路径（默认为 dist/result.json）
  -o, --output-json-path <path>  输出 JSON 文件路径（默认为 tv_service.json）
  -h, --help                     display help for command`;

const PARSE_QUAKE_HELP = `Usage: sgen parse-quake-json [options] [paths...]

解析 Quake 搜索结果 JSON，提取为 { baseUrl, province, city } 并保存为 tv_service.json
多个输入文件可用逗号分隔，或作为位置参数传入，结果会合并去重

Options:
  -i, --input-json-path <paths>  输入 JSON 文件路径（默认为 dist/quake-result.json）
  -o, --output-json-path <path>  输出 JSON 文件路径（默认为 tv_service.json）
  -h, --help                     display help for command`;

const FETCH_QUAKE_HELP = `Usage: sgen fetch-quake [options]

调用 Quake API 拉取搜索结果，提取为 { baseUrl, province, city } 并保存为 tv_service.json

Options:
  -t, --token <token>            Quake API token（默认读取环境变量 QUAKE_TOKEN）
  -q, --query <query>            查询语句（默认为 ${DEFAULT_QUAKE_QUERY}）
  --start <n>                    起始偏移（默认为 0）
  --size <n>                     每页条数（默认为 100）
  --max <n>                      最多拉取条数（默认为 100）
  --max-pages <n>                最多请求页数（默认不限制）
  -r, --raw-output-path <path>   保存原始 Quake 结果的路径
  -o, --output-json-path <path>  输出 JSON 文件路径（默认为 tv_service.json）
  -h, --help                     display help for command`;

function fail(message: string, help: string) {
  console.error(`error: ${message}`);
  console.error(help);
  process.exitCode = 1;
}

function runParseResultJson(args: string[]) {
  const parsed = parseArgs(args, [
    { long: '--input-json-path', short: '-i' },
    { long: '--output-json-path', short: '-o' },
  ]);
  if (parsed.help) {
    console.log(PARSE_HELP);
    return;
  }
  if (parsed.error != null) {
    fail(parsed.error, PARSE_HELP);
    return;
  }

  const options: TvServiceGenOptions = {};
  const inputJsonPath = parsed.values['--input-json-path'];
  const outputJsonPath = parsed.values['--output-json-path'];
  if (typeof inputJsonPath === 'string') {
    options.inputJsonPath = inputJsonPath;
  }
  if (typeof outputJsonPath === 'string') {
    options.outputJsonPath = outputJsonPath;
  }

  genServiceJson(options);
}

function runParseQuakeJson(args: string[]) {
  const parsed = parseArgs(args, [
    { long: '--input-json-path', short: '-i' },
    { long: '--output-json-path', short: '-o' },
  ]);
  if (parsed.help) {
    console.log(PARSE_QUAKE_HELP);
    return;
  }
  if (parsed.error != null) {
    fail(parsed.error, PARSE_QUAKE_HELP);
    return;
  }

  const options: QuakeGenOptions = {};
  const inputJsonPath = parsed.values['--input-json-path'];
  const outputJsonPath = parsed.values['--output-json-path'];
  const inputJsonPaths = [...parsed.positionals];
  if (typeof inputJsonPath === 'string') {
    inputJsonPaths.push(...inputJsonPath.split(',').filter((p) => p.length > 0));
  }
  if (inputJsonPaths.length > 0) {
    options.inputJsonPaths = inputJsonPaths;
  }
  if (typeof outputJsonPath === 'string') {
    options.outputJsonPath = outputJsonPath;
  }

  genServiceJsonFromQuake(options);
}

async function runFetchQuake(args: string[]) {
  const parsed = parseArgs(args, [
    { long: '--token', short: '-t' },
    { long: '--query', short: '-q' },
    { long: '--start' },
    { long: '--size' },
    { long: '--max' },
    { long: '--max-pages' },
    { long: '--raw-output-path', short: '-r' },
    { long: '--output-json-path', short: '-o' },
  ]);
  if (parsed.help) {
    console.log(FETCH_QUAKE_HELP);
    return;
  }
  if (parsed.error != null) {
    fail(parsed.error, FETCH_QUAKE_HELP);
    return;
  }

  const options: QuakeFetchOptions = {};
  const token = parsed.values['--token'];
  const query = parsed.values['--query'];
  const rawOutputPath = parsed.values['--raw-output-path'];
  const outputJsonPath = parsed.values['--output-json-path'];
  if (typeof token === 'string') {
    options.token = token;
  }
  if (typeof query === 'string') {
    options.query = query;
  }
  if (typeof rawOutputPath === 'string') {
    options.rawOutputPath = rawOutputPath;
  }
  if (typeof outputJsonPath === 'string') {
    options.outputJsonPath = outputJsonPath;
  }
  const intOptions: Array<
    [
      '--start' | '--size' | '--max' | '--max-pages',
      'start' | 'size' | 'max' | 'maxPages',
    ]
  > = [
    ['--start', 'start'],
    ['--size', 'size'],
    ['--max', 'max'],
    ['--max-pages', 'maxPages'],
  ];
  for (const [flag, key] of intOptions) {
    const result = parseOptionalInt(parsed.values[flag], flag);
    if (result.error != null) {
      fail(result.error, FETCH_QUAKE_HELP);
      return;
    }
    if (result.value != null) {
      options[key] = result.value;
    }
  }

  await fetchQuakeServiceJson(options);
}

async function main(args: string[]): Promise<void> {
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    console.log(ROOT_HELP);
    return;
  }

  const command = args[0];
  switch (command) {
    case 'parse-result-json':
      runParseResultJson(args.slice(1));
      return;
    case 'parse-quake-json':
      runParseQuakeJson(args.slice(1));
      return;
    case 'fetch-quake':
      await runFetchQuake(args.slice(1));
      return;
    default:
      fail(`unknown command '${command}'`, ROOT_HELP);
  }
}

main(process.argv.slice(2)).catch((err) => {
  console.error('程序执行出错:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
