# Image de base fournie par le Supervisor (BUILD_FROM), avec une valeur par défaut.
ARG BUILD_FROM=ghcr.io/home-assistant/base:latest
FROM ${BUILD_FROM}

RUN apk add --no-cache python3 py3-aiohttp tzdata

WORKDIR /app
COPY app /app
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD ["/run.sh"]
