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
  speed?: number;
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
