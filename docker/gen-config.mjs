import fs from 'node:fs';
import process from 'node:process';
const ENV = process.env;
fs.writeFileSync('schedule-config.json', JSON.stringify({
  dataJsonPath: ENV.DATA_JSON_PATH,
  liveResultDir: ENV.LIVE_RESULT_DIR,
  concurrencyJson: ENV.CONCURRENCY_JSON,
  concurrencyStream: ENV.CONCURRENCY_STREAM,
}));