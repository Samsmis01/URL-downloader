#!/bin/bash
set -e

echo "🛠️ Installation de yt-dlp..."
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

echo "✅ Vérification :"
yt-dlp --version
