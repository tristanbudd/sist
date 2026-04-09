#!/usr/bin/env sh
set -eu

cd /var/www/html

mkdir -p \
	storage/logs \
	storage/framework/cache \
	storage/framework/sessions \
	storage/framework/views \
	storage/app/public \
	bootstrap/cache

chown -R www-data:www-data storage bootstrap/cache

find storage bootstrap/cache -type d -exec chmod 775 {} \;
find storage bootstrap/cache -type f -exec chmod 664 {} \;

exec "$@"
