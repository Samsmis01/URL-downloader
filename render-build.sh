#!/bin/bash
echo "🔧 Fix spécifique pour Render..."
rm -rf node_modules/path-to-regexp
npm install path-to-regexp@6.2.1 --no-package-loc
