
// ==================== 类型定义 ====================
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
