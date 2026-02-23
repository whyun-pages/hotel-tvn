import { build } from './lib/build';

build().catch(err => {
  console.error("程序执行出错:", err);
  process.exit(1);
});