# hotel-tvn

[![npm version](https://img.shields.io/npm/v/hotel-tvn.svg)](https://www.npmjs.com/package/hotel-tvn)
[![npm downloads](https://img.shields.io/npm/dm/hotel-tvn.svg)](https://www.npmjs.com/package/hotel-tvn)
[![license](https://img.shields.io/npm/l/hotel-tvn.svg)](https://github.com/whyun-pages/hotel-tvn/blob/main/LICENSE)
[![Docker Image](https://img.shields.io/docker/v/yunnysunny/hotel-tvn?logo=docker)](https://hub.docker.com/r/yunnysunny/hotel-tvn)

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

If you have a **result.json** exported from [Censys](https://platform.censys.io/api/search?q=host.services.endpoints.http.body%3A+%22%2Fiptv%2Flive%2F%22+and+host.location.country_code%3A+%22CN%22&_cb=5f3928&_data=routes%2Fapi.search), use **sgen** to parse it and generate **tv_service.json** for **tvn** (each item is `{ baseUrl, province, city }`).

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

## Docker image usage

The project provides a Docker image to run the **tvn** pipeline and a scheduled task (runs once daily at midnight).

### Pull the image

Pull from Docker Hub:

```bash
docker pull yunnysunny/hotel-tvn:latest
```

### Run the container

**Basic usage**: mount your data file and output directory, then run.

```powershell
# Windows (PowerShell)
docker run -d --name hotel-tvn `
  -p 8080:80 `
  -v ${PWD}/tv_service.json:/app/tv_service.json `
  -v ${PWD}/output:/app/output `
  -e LIVE_RESULT_DIR=/app/output `
  yunnysunny/hotel-tvn:latest
```

```bash
# Linux / macOS
docker run -d --name hotel-tvn \
  -p 8080:80 \
  -v "$(pwd)/tv_service.json:/app/tv_service.json" \
  -v "$(pwd)/output:/app/output" \
  -e LIVE_RESULT_DIR=/app/output \
  yunnysunny/hotel-tvn:latest
```

- First volume: mounts your host `tv_service.json` into the container as the data source.
- Second volume: mounts your host `output` directory to `/app/output` and sets `LIVE_RESULT_DIR=/app/output` so **lives.txt** and **lives.m3u** are written there and visible on the host under `output`.
- `-p 8080:80`: exposes the in-container HTTP server so you can access the channel list via URL (see below).

### Access lives.txt and lives.m3u via HTTP

The container runs an HTTP server on port **8080** that serves the generated channel list files. After starting the container with `-p 8080:80`, you can open or use these URLs:

| File        | URL (local)                          | Usage |
| ----------- | ------------------------------------ | ----- |
| **lives.txt** | `http://localhost:8080/lives.txt`  | Plain list of stream URLs, one per line. |
| **lives.m3u** | `http://localhost:8080/lives.m3u`  | M3U playlist for IPTV players (e.g. VLC, Kodi). |

- **On the same machine**: use `http://localhost:8080/lives.txt` or `http://localhost:8080/lives.m3u`.
- **From another device on the network**: replace `localhost` with the host’s IP (e.g. `http://192.168.1.100:8080/lives.m3u`).

You can paste the **lives.m3u** URL into an IPTV app, or open **lives.txt** in a browser to copy stream links.

### Environment variables

| Variable             | Description                                                                    |
| -------------------- | ------------------------------------------------------------------------------ |
| `DATA_JSON_PATH`     | Path to the data JSON file (default: `/app/tv_service.json` in the container). |
| `LIVE_RESULT_DIR`    | Directory for **lives.txt** and **lives.m3u** (default: `/app`).               |
| `CONCURRENCY_JSON`   | Concurrency for JSON URL checks.                                               |
| `CONCURRENCY_STREAM` | Concurrency for stream speed tests.                                            |

The scheduled task reads `schedule-config.json` generated from these variables (you can generate this config at container startup if needed).

**Example**: custom output directory and concurrency

```bash
docker run -d --name hotel-tvn \
  -p 8080:80 \
  -e LIVE_RESULT_DIR=/app/output \
  -e CONCURRENCY_JSON=128 \
  -e CONCURRENCY_STREAM=32 \
  -v "$(pwd)/tv_service.json:/app/tv_service.json" \
  -v "$(pwd)/output:/app/output" \
  yunnysunny/hotel-tvn:latest
```

### Build the image locally

From the project root:

```bash
docker build -t hotel-tvn:local .
```

Example run with the local image:

```bash
docker run -d --name hotel-tvn \
  -p 8080:80 \
  -v "$(pwd)/tv_service.json:/app/tv_service.json" \
  -v "$(pwd)/output:/app/output" \
  -e LIVE_RESULT_DIR=/app/output \
  hotel-tvn:local
```

## License

MIT
