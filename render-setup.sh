#!/bin/bash
set -e

echo "🔧 Mise à jour des paquets système..."
sudo apt-get update -y

echo "📦 Installation des dépendances : ffmpeg, python3, python3-pip, curl..."
sudo apt-get install -y ffmpeg python3 python3-pip curl

echo "⬇️ Téléchargement et installation de yt-dlp..."
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

echo "✅ Vérification des versions installées :"
echo "Node : $(node -v || echo 'Node non installé')"
echo "npm  : $(npm -v || echo 'npm non installé')"
echo "Python : $(python3 --version)"
echo "yt-dlp : $(yt-dlp --version)"

echo "🎉 Installation terminée avec succès.
