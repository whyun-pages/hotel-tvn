import { build } from './scripts/check-data-json';

build().catch(err => {
  console.error("程序执行出错:", err);
  process.exit(1);
});