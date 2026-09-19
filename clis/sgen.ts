#!/usr/bin/env node
/**
 * 解析 dist/result.json，提取为 { baseUrl, province, city } 并保存为 tv_service.json
 * baseUrl = ip:port，ip 取自 host.host.ip，port 从 highlights[1].json_path 中的 host.services[$index] 得到 index，再取 host.services[index].port
 */
import { TvServiceGenOptions } from '../types';
import { genServiceJson } from '../scripts/gen-service-json';
import { parseArgs } from '../lib/cli';

const ROOT_HELP = `Usage: sgen [options] [command]

Commands:
  parse-result-json [options]  解析 dist/result.json，提取为 { baseUrl, province, city } 并保存为 tv_service.json

Options:
  -h, --help                   display help for command`;

const PARSE_HELP = `Usage: sgen parse-result-json [options]

解析 dist/result.json，提取为 { baseUrl, province, city } 并保存为 tv_service.json

Options:
  -i, --input-json-path <path>   输入 JSON 文件路径（默认为 dist/result.json）
  -o, --output-json-path <path>  输出 JSON 文件路径（默认为 tv_service.json）
  -h, --help                     display help for command`;

function main(args: string[]): void {
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    console.log(ROOT_HELP);
    return;
  }

  const command = args[0];
  if (command !== 'parse-result-json') {
    console.error(`error: unknown command '${command}'`);
    console.error(ROOT_HELP);
    process.exitCode = 1;
    return;
  }

  const parsed = parseArgs(args.slice(1), [
    { long: '--input-json-path', short: '-i' },
    { long: '--output-json-path', short: '-o' },
  ]);
  if (parsed.help) {
    console.log(PARSE_HELP);
    return;
  }
  if (parsed.error != null) {
    console.error(`error: ${parsed.error}`);
    console.error(PARSE_HELP);
    process.exitCode = 1;
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

main(process.argv.slice(2));
