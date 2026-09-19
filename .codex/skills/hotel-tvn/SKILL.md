---
name: hotel-tvn
description: Project-specific guidance for the hotel-tvn TypeScript repository. Use when modifying this project, especially Perry local compilation, CLI entrypoints, runtime dependencies, native Node API replacements, tests, lockfile changes, or generated build artifacts.
---

# Hotel TVN

## Core Rules

- Keep runtime dependencies Perry-friendly. Prefer project-local code and Node built-in APIs over npm packages in executable paths.
- Do not reintroduce `fs-extra`, `p-queue`, `axios`, or `commander` without first checking Perry compile and runtime behavior.
- Avoid `fs/promises` and `node:fs/promises`; use `node:fs` sync or callback APIs in code that Perry compiles.
- Use `lib/concurrency.ts` for concurrency control instead of queue packages.
- Use native `fetch` and existing timeout handling instead of `axios`.
- Use `lib/cli.ts` for CLI argument parsing instead of `commander`.
- Keep Perry-generated files ignored: `.perry-cache/`, `*.o`, `*.exp`, and `*.lib`.

## Perry Notes

- Perry 0.5.1025 previously hung at `Collecting modules...` with `axios`.
- Long chained `.replace(...).replace(...)` in `fetchAndParseJson` also caused slow or stuck module collection. Keep channel-name normalization table-driven with `CHANNEL_NAME_REPLACEMENTS` and `normalizeChannelName()`.
- `commander` can compile under Perry but the generated executable may not execute CLI help/action correctly. Keep CLI entrypoints dependency-free.
- `tvn` may still print many `LNK4006` / `LNK4088` linker warnings and a `js_stdlib_init_dispatch` runtime warning. Treat these as Perry prebuilt runtime/stdlib behavior unless the executable fails.

## Validation

After touching Perry-relevant code, run:

```powershell
rg "commander|axios|p-queue|fs-extra|fs/promises|node:fs/promises" -n package.json pnpm-lock.yaml clis lib scripts test
pnpm build:cjs
pnpm build:esm
pnpm test -- test/utils.test.ts test/check-data-json.test.ts
perry compile clis\tvn.ts -o dist\perry\tvn.exe -v
dist\perry\tvn.exe --help
perry compile clis\sgen.ts -o dist\perry\sgen.exe -v
dist\perry\sgen.exe --help
dist\perry\sgen.exe parse-result-json --help
```

Expected Perry shape:

- `tvn`: native modules only, 0 JavaScript modules, compile around a few seconds locally.
- `sgen`: native modules only, 0 JavaScript modules, compile around a few seconds locally.
- `--help` must print the project CLI help text, not only Perry runtime warnings.

## Diagnostics

- If Perry appears stuck, use `--no-link` to separate module collection/codegen from linker work.
- Use timed `Start-Process` wrappers for Perry commands so runaway processes can be killed.
- Before finishing after interrupted Perry runs, check for leftover processes matching `perry|clang|lld|link|rustc|cargo|tsgo`.
- If adding a new dependency, test a minimal Perry compile before wiring it into `clis/tvn.ts` or `clis/sgen.ts`.

## Documentation

For the full migration record and command outputs summarized for humans, see `docs/perry-local-compile-migration.md`.
