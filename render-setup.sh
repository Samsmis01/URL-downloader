#!/bin/bash
set -e

# Vérifie si on est sur Render
if [ "$RENDER" = "true" ]; then
  echo "🔧 Installation des dépendances système sur Render..."
  sudo apt-get update -y
  sudo apt-get install -y python3-pip ffmpeg
  pip3 install yt-dlp
fi
