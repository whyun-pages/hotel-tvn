# hotel-tvn

Generate hotel TV / IPTV channel lists from a data JSON. The tool reads a list of service URLs, probes JSON endpoints on the local network, parses channel lists, tests stream availability and speed, then writes **lives.txt** and **lives.m3u**.

> **Disclaimer:** This project is for learning purposes only. Please delete any generated live source files (e.g. `lives.txt`, `lives.m3u`) within 24 hours.

## What it does

1. Reads a data JSON file (e.g. `tv_service.json`) containing service base URLs.
2. Expands each base URL into candidate JSON URLs (e.g. scanning last octet 1–255).
3. Checks which JSON URLs are reachable.
4. Fetches and parses channel lists from each available JSON endpoint.
5. Tests each channel stream and measures speed.
6. Writes the playable channels to **lives.txt** and **lives.m3u** in the chosen output directory.

## Requirements

- Node.js (recommended v18+)
- pnpm (or npm / yarn)

## Install

Install globally with npm:

```bash
npm install -g hotel-tvn
```

The **tvn** command will be available on your PATH.

## Command-line usage

### Run with defaults

Uses `tv_service.json` in the current directory and default concurrency:

```bash
tvn
```

### Options

| Option | Short | Description |
|--------|--------|-------------|
| `--data-json-path <path>` | `-d` | Path to the data JSON file (default: `tv_service.json`). |
| `--live-result-dir <dir>` | `-o` | Directory for **lives.txt** and **lives.m3u** (default: current directory). |
| `--concurrency-json <n>` | — | Concurrency for JSON URL checks. |
| `--concurrency-stream <n>` | — | Concurrency for stream speed tests. |

### Examples

```bash
# Custom data file and output directory
tvn -d ./my-services.json -o ./output

# Limit concurrency
tvn --concurrency-json 128 --concurrency-stream 32

# Help
tvn --help
```

## Use as a JavaScript / TypeScript library

Install in your project:

```bash
pnpm add hotel-tvn
# or: npm install hotel-tvn
```

The package supports both **CommonJS** and **ESM** and exports types.

### ESM

```js
import { build, GenOptions } from 'hotel-tvn';

const options: GenOptions = {
  dataJsonPath: './tv_service.json',
  liveResultDir: './output',
  concurrencyJson: 256,
  concurrencyStream: 64,
};

await build(options);
```

### CommonJS

```js
const { build } = require('hotel-tvn');

await build({
  dataJsonPath: './tv_service.json',
  liveResultDir: './output',
});
```

### Exported API and types

- **`build(options?: GenOptions): Promise<void>`**  
  Runs the full pipeline (read data JSON → probe URLs → parse channels → test streams → write lives.txt and lives.m3u). Options match the CLI:

  - `dataJsonPath` – path to the data JSON file  
  - `liveResultDir` – directory for **lives.txt** and **lives.m3u**  
  - `concurrencyJson` – concurrency for JSON checks  
  - `concurrencyStream` – concurrency for stream tests  

- **Types**: `GenOptions`, `Channel`, `ParsedChannel`, `RegionUrl`, `TvServiceItem` (see `types.ts`).

## Data JSON format

The data JSON is an array of entries. Each entry can be a URL string or an object with at least a `baseUrl` (used for `TvServiceItem`). Example:

```json
[
  "http://192.168.1.1:8080/api/channels.json",
  { "baseUrl": "http://10.0.0.1:8080", "province": "Guangdong", "city": "Shenzhen" }
]
```

## License

MIT
