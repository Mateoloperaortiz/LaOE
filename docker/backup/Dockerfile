FROM postgres:18-alpine

RUN apk add --no-cache bash age rclone zstd jq
COPY --chmod=755 scripts/backup.sh /usr/local/bin/casa-digital-backup

USER postgres
ENTRYPOINT ["/usr/local/bin/casa-digital-backup"]
