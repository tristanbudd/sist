FROM composer:2 AS composer_deps
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --prefer-dist --no-interaction --no-scripts --optimize-autoloader

FROM node:20-alpine AS frontend_build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY resources ./resources
COPY public ./public
COPY vite.config.js tsconfig.json jsconfig.json eslint.config.js tailwind.config.js ./
RUN pnpm run build

FROM php:8.3-fpm-alpine AS app

RUN apk add --no-cache \
    nginx \
    supervisor \
    bash \
    icu-dev \
    libzip-dev \
    oniguruma-dev \
    curl-dev \
    unzip \
    git \
    mysql-client \
    && docker-php-ext-install pdo pdo_mysql mbstring intl zip opcache

WORKDIR /var/www/html

COPY . .
COPY --from=composer_deps /app/vendor ./vendor
COPY --from=frontend_build /app/public/build ./public/build

COPY docker/nginx/default.conf /etc/nginx/http.d/default.conf
COPY docker/supervisord/supervisord.conf /etc/supervisord.conf
COPY docker/entrypoint/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

RUN mkdir -p /var/log/supervisor /run/nginx /var/lib/nginx/tmp \
    && chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache /run/nginx /var/lib/nginx /var/log/nginx

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/start.sh"]
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
