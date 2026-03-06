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

The **tvn** and **sgen** commands will be available on your PATH.

## Command-line usage (tvn)

### Run with defaults

Uses `tv_service.json` in the current directory and default concurrency:

```bash
tvn
```

**Options**:

| Option                     | Short | Description                                                                 |
| -------------------------- | ----- | --------------------------------------------------------------------------- |
| `--data-json-path <path>`  | `-d`  | Path to the data JSON file (default: `tv_service.json`).                    |
| `--live-result-dir <dir>`  | `-o`  | Directory for **lives.txt** and **lives.m3u** (default: current directory). |
| `--concurrency-json <n>`   | —     | Concurrency for JSON URL checks.                                            |
| `--concurrency-stream <n>` | —     | Concurrency for stream speed tests.                                         |

### More Examples

```bash
# Custom data file and output directory
tvn -d ./my-services.json -o ./output

# Limit concurrency
tvn --concurrency-json 128 --concurrency-stream 32

# Help
tvn --help
```

### How to get tv_service.json

The tv_service.json can be generated from result.json using the **sgen** command.

If you have a **result.json** exported from [Censys](https://platform.censys.io/api/search?q=host.services.endpoints.http.body%3A+%22%2Fiptv%2Flive%2F%22+and+host.location.country_code%3A+%22CN%22&_cb=5f3928&_data=routes%2Fapi.search), use **genServiceJson** to parse it and generate **tv_service.json** for **tvn** (each item is `{ baseUrl, province, city }`).

```bash
# Use default paths: input dist/result.json, output tv_service.json
sgen parse-result-json

# Specify input and output paths
sgen parse-result-json -i ./my_result.json -o ./my_tv_service.json
```

| Option                      | Short | Description                                                  |
| --------------------------- | ----- | ------------------------------------------------------------ |
| `--input-json-path <path>`  | `-i`  | Path to input result.json (default: `dist/result.json`).     |
| `--output-json-path <path>` | `-o`  | Path to output tv_service.json (default: `tv_service.json`). |

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

## License

MIT
