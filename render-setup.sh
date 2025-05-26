#!/bin/bash
set -e

echo "🔧 Installation des dépendances système..."
sudo apt-get update
sudo apt-get install -y ffmpeg python3

echo "📦 Installation de yt-dlp..."
sudo python3 -m pip install --upgrade yt-dlp

echo "✅ Vérification des versions:"
echo "Node: $(node -v)"
echo "npm: $(npm -v)"
echo "Python: $(python3 --version)"
echo "yt-dlp: $(yt-dlp --version)"
