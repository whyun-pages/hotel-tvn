// ==================== 类型定义 ====================
export interface GenOptions {
  /**
   * data JSON path
   */
  dataJsonPath?: string;
  /**
   * live result dir
   */
  liveResultDir?: string;
  /**
   * concurrency for json check
   */
  concurrencyJson?: number;
  /**
   * concurrency for stream test
   */
  concurrencyStream?: number;
}
export interface Channel {
  name: string;
  url: string;
  speed?: string;
  segmentDuration?: number;
  /**
   * 下载时长 / ts 文件时长
   */
  timeRatio?: string;
}
// interface ValidJsonResult {
//   url: string;
// }
export interface ParsedChannel {
  name: string;
  url: string;
}
export interface RegionUrl {
  region: string;
  url: string;
}
export interface TvServiceItem {
  baseUrl: string;
  province: string;
  city: string;
}

export interface TvServiceGenOptions {
  inputJsonPath?: string;
  outputJsonPath?: string;
}

export interface QuakeGenOptions {
  /**
   * Quake 搜索结果 JSON 路径，可传多个（如分页导出的多个文件）
   */
  inputJsonPaths?: string[];
  outputJsonPath?: string;
}

export interface QuakeFetchOptions {
  /**
   * Quake API token，默认读取环境变量 QUAKE_TOKEN
   */
  token?: string;
  query?: string;
  /**
   * 起始偏移
   */
  start?: number;
  /**
   * 每页条数
   */
  size?: number;
  /**
   * 最多拉取条数
   */
  max?: number;
  /**
   * 最多请求页数
   */
  maxPages?: number;
  outputJsonPath?: string;
  /**
   * 保存原始 Quake 结果的路径，可再用 parse-quake-json 解析
   */
  rawOutputPath?: string;
}
