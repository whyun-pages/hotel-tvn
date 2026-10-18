import { build } from './scripts/check-data-json';

build()
  .then(() => {
    console.log('完成');
    // 显式退出，避免残留的 keep-alive 连接等句柄让进程空转
    process.exit(0);
  })
  .catch((err) => {
    console.error('程序执行出错:', err);
    process.exit(1);
  });
