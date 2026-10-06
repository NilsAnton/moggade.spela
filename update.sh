#!/bin/sh
# Användning: ./update.sh 1.0.1   (bara om du kör via SSH)
set -e
[ -z "$1" ] && echo "Användning: ./update.sh <version>" && exit 1
sed -i "s/^APP_VERSION=.*/APP_VERSION=$1/" .env
sudo docker compose up -d --build
echo "Kör nu version $1"
