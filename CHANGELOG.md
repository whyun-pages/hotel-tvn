## v0.2.0
- Add Docker-based runtime with scheduled generation, built-in HTTP serving for `lives.txt` and `lives.m3u`, request headers support, and stdout-friendly container logging
- Add a lives review page, EPG support, and Cloudflare Pages upload for generated channel artifacts
- Improve stream validation with playback URL fixes, speed testing, `timeRatio` filtering via `MIN_RATIO_TOLERANCE`, and configurable `CONCURRENCY_STREAM`
- Improve performance by increasing default JSON scan concurrency and speeding up candidate JSON checking
- Add tests and docs updates for Docker usage, stream testing, and server behavior

## v0.1.1
- Add tv_service.json, lives.txt, lives.m3u to package files
## v0.1.0
- Initial release