import fs from 'node:fs';
import process from 'node:process';
const ENV = process.env;
let oldJson
try {
  oldJson = JSON.parse(fs.readFileSync('schedule-config.json', 'utf-8'));
} catch (_error) {
  oldJson = {};
}
const newJson = {
  ...oldJson,
  dataJsonPath: ENV.DATA_JSON_PATH || oldJson.dataJsonPath,
  liveResultDir: ENV.LIVE_RESULT_DIR || oldJson.liveResultDir,
  concurrencyJson: ENV.CONCURRENCY_JSON || oldJson.concurrencyJson,
  concurrencyStream: ENV.CONCURRENCY_STREAM || oldJson.concurrencyStream,
};
fs.writeFileSync('schedule-config.json', JSON.stringify(newJson, undefined, 2));