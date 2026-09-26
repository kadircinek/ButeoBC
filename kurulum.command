#!/bin/bash
# macOS: çift tıklayarak kurulum
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then
  echo "Node.js bulunamadı. https://nodejs.org adresinden LTS sürümünü kurun ve tekrar çalıştırın."
  open https://nodejs.org; read -p "Kapatmak için Enter"; exit 1
fi
node -v && npm install && mkdir -p imports reports && echo "Kurulum tamamlandı. Paneli açmak için panel-ac.command dosyasına çift tıklayın."
read -p "Kapatmak için Enter"
