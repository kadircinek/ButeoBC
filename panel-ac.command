#!/bin/bash
# macOS: paneli başlatır ve tarayıcıda açar
cd "$(dirname "$0")"
(sleep 2; open http://localhost:3000) &
node server/index.js
