#!/bin/bash
set -euo pipefail

echo "🔧 Configuration initiale du projet..."

# Création des dossiers nécessaires
mkdir -p public/downloads tmp logs
chmod -R 755 public/downloads tmp logs

# Détection de l'environnement Render
if [ -n "${RENDER:-}" ]; then
  echo "🛠 Environnement Render détecté"
  
  # Solution optimisée pour Render
  echo "📦 Vérification des dépendances sur Render..."
  
  if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg non trouvé - Configurez-le dans les Build Settings de Render"
    exit 1
  fi
  
  if ! command -v yt-dlp &> /dev/null; then
    echo "⬇️ Installation sécurisée de yt-dlp..."
    # Création du répertoire si inexistant
    mkdir -p "$HOME/.local/bin"
    
    # Méthode recommandée: Téléchargement direct
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "$HOME/.local/bin/yt-dlp"
    chmod a+rx "$HOME/.local/bin/yt-dlp"
    
    # Ajout au PATH
    export PATH="$HOME/.local/bin:$PATH"
    
    # Alternative commentée (si jamais la méthode curl échoue)
    # python3 -m pip install --user yt-dlp
    # export PATH="$HOME/.local/bin:$PATH"
  fi
else
  # Solution pour environnement local
  echo "🖥 Environnement local détecté"
  
  echo "🔄 Mise à jour des paquets système..."
  if command -v apt-get &> /dev/null; then
    sudo apt-get update -y
    echo "📦 Installation des dépendances système..."
    sudo apt-get install -y ffmpeg python3 python3-pip curl
  elif command -v brew &> /dev/null; then
    brew update
    brew install ffmpeg python curl
  fi

  echo "⬇️ Installation de yt-dlp..."
  sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
  sudo chmod a+rx /usr/local/bin/yt-dlp
fi

# Vérification explicite
echo "✅ Vérification finale :"
echo "Node: $(node -v || echo 'Non installé')"
echo "npm: $(npm -v || echo 'Non installé')"
echo "Python: $(python3 --version || echo 'Non installé')"
echo "FFmpeg: $(ffmpeg -version | head -n 1 || echo 'Non installé')"
echo "yt-dlp: $(yt-dlp --version || echo 'Non installé')"
echo "Chemin yt-dlp: $(which yt-dlp || echo 'Non trouvé')"

if ! command -v yt-dlp &> /dev/null; then
  echo "❌ Échec critique: yt-dlp non installé"
  exit 1
fi

echo "🎉 Configuration terminée avec succès !"
