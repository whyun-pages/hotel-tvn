#!/bin/bash

# 配置变量
PROJECT_NAME="hotel-tvn"
DIRECTORY="../output"

# 1. 生成 manifest (文件名: 哈希值)
# 使用 sha256sum 计算并构建 JSON
MANIFEST="{"
for file in $(ls $DIRECTORY); do
  HASH=$(sha256sum "$DIRECTORY/$file" | awk '{print $1}')
  MANIFEST="$MANIFEST\"/$file\":\"$HASH\","
done
# 去掉最后一个逗号并闭合 JSON
MANIFEST="${MANIFEST%,}}"

# 2. 调用 API 上传
# 我们需要同时发送 manifest 字符串和每个文件本身
# 注意：-F 参数后的名称必须和 manifest 里的文件名（不带斜杠）对应
curl -X POST "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/deployments" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -F "manifest=$MANIFEST" \
  -F "lives.txt=@$DIRECTORY/lives.txt" \
  -H "Content-Type: multipart/form-data" \
  -F "lives.m3u=@$DIRECTORY/lives.m3u"