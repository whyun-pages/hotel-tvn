# Perry 本地编译改造总结

## 背景

本次改造目标是让项目可以在本地使用 Perry 编译，并定位 Perry 编译耗时过长的问题。检查过程中发现，Perry 对部分 npm 包和写法的模块收集/运行时支持不稳定，因此将相关运行时依赖逐步替换为项目内代码或 Node 内置 API。

## 主要改动

### 移除第三方运行时依赖

- 移除 `fs-extra`，改用 `node:fs` 和 `node:path`。
- 移除 `p-queue`，新增 `lib/concurrency.ts`，用 `runWithConcurrency` 实现本地并发控制。
- 移除 `axios`，改用原生 `fetch`，并在 `lib/utils.ts` 中实现 `fetchWithTimeout`。
- 移除 `commander`，新增 `lib/cli.ts`，用项目内轻量参数解析替代 CLI 依赖。

目前 `package.json` 中已没有运行时 dependencies。

### Perry 兼容性调整

- 移除了 `package.json` 中 Perry 的 `compilePackages` / `allow.compilePackages` 配置。
- 避免使用 `fs/promises` 和 `node:fs/promises`，统一改为同步或 callback 风格的 `node:fs` API。
- 将 `fetchAndParseJson` 中连续链式 `.replace(...).replace(...)` 改为 `CHANNEL_NAME_REPLACEMENTS` 表驱动的 `normalizeChannelName()`，避免 Perry 在模块收集阶段长时间卡住。
- 将 `clis/tvn.ts` 和 `clis/sgen.ts` 改为本地 CLI 解析，避免 `commander` 在 Perry 下“编译成功但运行不执行 CLI”的问题。
- 为 Perry 生成物更新 `.gitignore`：`.perry-cache/`、`*.o`、`*.exp`、`*.lib`。

### 测试适配

- 测试中原先对 `axios` 的 mock 已改为 mock `globalThis.fetch`。
- 相关 live/fetch 测试也同步适配原生 `fetch` 返回结构。

## Perry 慢编译诊断结论

编译慢的主要原因不是 `p-queue`。

排查过程中的关键结论：

- `axios` 会导致 Perry 卡在 `Collecting modules...`。
- 替换 `axios` 后，`fetchAndParseJson` 中长链式 `.replace()` 仍会让 Perry 模块收集变慢或卡住。
- 将频道名称规范化逻辑改为替换表后，`tvn` 的 Perry 模块收集恢复到数秒级。
- `commander` 不再导致编译卡住，但 Perry 生成的可执行文件不会正常触发 CLI 行为，因此也替换为本地实现。

## 当前验证结果

已执行并通过：

```powershell
pnpm build:cjs
pnpm build:esm
pnpm test -- test/utils.test.ts test/check-data-json.test.ts
```

测试结果：

- 21 passed
- 1 skipped

依赖残留检查：

```powershell
rg "commander|axios|p-queue|fs-extra|fs/promises|node:fs/promises" -n package.json pnpm-lock.yaml clis lib scripts test
```

结果：无匹配。

Perry 编译验证：

```powershell
perry compile clis\tvn.ts -o dist\perry\tvn.exe -v
dist\perry\tvn.exe --help

perry compile clis\sgen.ts -o dist\perry\sgen.exe -v
dist\perry\sgen.exe --help
dist\perry\sgen.exe parse-result-json --help
```

当前结果：

- `tvn`：6 native modules，0 JavaScript modules，约 4 秒完成编译。
- `sgen`：4 native modules，0 JavaScript modules，约 3 秒完成编译。
- 两个可执行文件的 `--help` 均可正常输出。

## 已知剩余问题

`tvn` 链接时仍会输出大量 `LNK4006` / `LNK4088` 警告，运行 `--help` 末尾也可能出现：

```text
[perry] warning: `js_stdlib_init_dispatch` is a no-op stub on this platform
```

这来自 Perry 0.5.1025 当前使用预编译 `perry_runtime.lib + perry_stdlib.lib` 的链接方式，不是项目依赖残留导致的模块收集慢问题。当前可执行文件已经可以运行 CLI 入口。

## 后续建议

- 后续新增 CLI 选项时，优先扩展 `lib/cli.ts`，不要重新引入 `commander`。
- 后续新增网络请求时，优先使用原生 `fetch` 和现有 `fetchWithTimeout`。
- 后续新增文件操作时，优先使用 `node:fs`，避免重新引入 `fs-extra` 或 `fs/promises`。
- 如果升级 Perry，建议重新验证 `tvn` 和 `sgen` 的完整编译与 `--help` 输出，确认链接警告是否已有官方修复。
