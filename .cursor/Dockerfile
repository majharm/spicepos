FROM node:20-bookworm-slim

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      git \
      curl \
      mariadb-server \
      mariadb-client \
    && rm -rf /var/lib/apt/lists/*

USER node
