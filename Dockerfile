# --- 第一阶段：获取静态二进制文件 ---
FROM busybox:stable-musl AS toolchain

FROM yunnysunny/node AS prod-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --production

FROM prod-deps AS builder
RUN pnpm install
COPY . .
RUN pnpm build:cjs

FROM node:slim AS runner
WORKDIR /app
# 从第一阶段只拷贝那一个 1MB 左右的二进制文件
COPY --from=toolchain /bin/busybox /usr/local/bin/busybox
RUN mkdir -p /var/spool/cron/crontabs && \
    echo "0 0 * * * . /etc/environment; /usr/local/bin/node /app/dist/cjs/scripts/schedule-check-data.js >> /var/log/cron.log 2>&1" \
    > /var/spool/cron/crontabs/root
COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/tv_service.json \
/app/lives.txt \
/app/lives.m3u \
/app/package.json \
/app/docker \
./
COPY --from=prod-deps /app/node_modules ./node_modules/

ENTRYPOINT ["/app/entrypoint.sh"]
