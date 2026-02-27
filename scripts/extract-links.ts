/**
 * 使用类 jQuery 语法从 link.html 提取所有
 * ._highlightListSection ._highlightList ._highlightItem 第二项中 dd a 的 href，
 * 格式化为 http://ip:port 并保存为 data.json
 */
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';

const HTML_PATH = path.join(__dirname, '../dist/link.html');
const OUT_PATH = path.join(__dirname, '../data.json');

function hrefToHttpUrl(href: string): string | null {
  // href 形如: /hosts/115.58.217.130#HTTP-19901-TCP 或 /hosts/202.96.141.110?isCollapsed=true#HTTP-51276-TCP
  const match = href.match(/\/hosts\/([^?#]+).*?#(\w+)-(\d+)-/);
  if (!match) return null;
  const [, ip, _protocol, port] = match;
  return `http://${ip}:${port}`;
}

function main() {
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  const $ = cheerio.load(html);

  const results: string[] = [];

  // 遍历每个 highlightListSection
  $('._highlightListSection_mmisv_12').each((_, section) => {
    const $section = $(section);
    // 在该 section 内找 ._highlightList_mmisv_12 ._highlightItem_1hehs_2 的第二个（eq(1)）
    const $secondItem = $section
      .find('._highlightList_mmisv_12 ._highlightItem_1hehs_2')
      .eq(1);
    // 在第二个 item 内找 dd a，取每个 a 的 href
    $secondItem.find('dd a').each((__, anchor) => {
      const href = $(anchor).attr('href');
      if (href) {
        const url = hrefToHttpUrl(href);
        if (url) results.push(url);
      }
    });
  });

  const unique = [...new Set(results)];
  fs.writeFileSync(OUT_PATH, JSON.stringify(unique, null, 2), 'utf-8');
  console.log(`已提取 ${unique.length} 条唯一 URL，已写入 ${OUT_PATH}`);
}

main();
