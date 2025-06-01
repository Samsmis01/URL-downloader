#!/bin/bash
set -euo pipefail

echo "🔧 Configuration initiale du projet..."

# Création des dossiers nécessaires (avec permissions adaptées)
mkdir -p public/downloads tmp logs
chmod -R 755 public/downloads tmp logs

echo "📦 Vérification des dépendances..."

# Vérification de Node.js
NODE_VERSION=$(node -v)
REQUIRED_VERSION="v18.12.0"
if [[ "$NODE_VERSION" < "$REQUIRED_VERSION" ]]; then
  echo "⚠️  Node $REQUIRED_VERSION+ requis. Version actuelle: $NODE_VERSION"
  exit 1
fi

# Vérification de FFmpeg (solution cloud-compatible)
if ! command -v ffmpeg &> /dev/null; then
  echo "⚠️  FFmpeg n'est pas installé"
  echo "ℹ️  Sur Render, ajoutez 'ffmpeg' dans vos Build Packages"
  echo "ℹ️  Localement, installez-le via: sudo apt-get install ffmpeg"
  exit 1
fi

# Installation de yt-dlp sans sudo (version locale)
if ! command -v yt-dlp &> /dev/null; then
  echo "⬇️  Installation de yt-dlp (version locale)..."
  curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./yt-dlp
  chmod a+rx ./yt-dlp
  export PATH=$PATH:$(pwd)
fi

echo "✅ Vérification finale :"
echo "Node : $(node -v)"
echo "npm  : $(npm -v)"
echo "FFmpeg : $(ffmpeg -version | head -n1)"
echo "yt-dlp : $(yt-dlp --version || echo 'utilisera la version npm')"

echo "🎉 Configuration terminée avec succès !"
