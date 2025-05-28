const express = require('express');
const path = require('path');
const fs = require('fs');
const youtubedl = require('yt-dlp-exec').create(process.env.YT_DLP_PATH || 'yt-dlp');
const sanitize = require('sanitize-filename');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();

// Configurations
const PORT = process.env.PORT || 3000;

const PUBLIC_FOLDER = path.join(__dirname, '../public');
const DOWNLOAD_FOLDER = path.join(PUBLIC_FOLDER, 'downloads');
const INDEX_HTML = path.join(__dirname, '../public/downloads/index.html');
const FILE_LIFETIME = 58000; // 58 secondes

// Middlewares
app.use(cors());
app.use('/downloads', express.static(DOWNLOAD_FOLDER));
app.use(express.static(PUBLIC_FOLDER));
app.use(express.json());

// Limiteur anti-abus
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard' }
});
app.use('/api/download', limiter);

// Créer dossier downloads s'il n'existe pas
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
  fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

// Nettoyer les fichiers anciens
function cleanOldFiles() {
  fs.readdir(DOWNLOAD_FOLDER, (err, files) => {
    if (err) return console.error('Erreur lecture dossier:', err);
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(DOWNLOAD_FOLDER, file);
      fs.stat(filePath, (err, stat) => {
        if (err) return console.error('Erreur stat fichier:', err);
        if (now - stat.birthtimeMs > FILE_LIFETIME) {
          fs.unlink(filePath, err => {
            if (err) console.error('Erreur suppression:', err);
            else console.log('Fichier supprimé:', file);
          });
        }
      });
    });
  });
}
setInterval(cleanOldFiles, 60000);
cleanOldFiles();

// Stats en mémoire
let stats = {
  totalDownloads: 0,
  todayDownloads: 0,
  lastReset: new Date().toDateString()
};

function updateStats(increment = 1) {
  if (new Date().toDateString() !== stats.lastReset) {
    stats.todayDownloads = 0;
    stats.lastReset = new Date().toDateString();
  }
  stats.totalDownloads += increment;
  stats.todayDownloads += increment;
}

// API Download - Version améliorée
app.post('/api/download', async (req, res) => {
  try {
    const { url } = req.body;
    console.log('Tentative de téléchargement pour URL:', url);

    if (!url) {
      return res.status(400).json({ 
        success: false,
        message: 'URL requise'
      });
    }

    // Validation améliorée des URLs
    const isFacebook = /(facebook\.com\/(watch|reel)|fb\.watch|fb\.com\/watch\?v=)/i.test(url);
    const isInstagram = /(instagram\.com\/(p|reel)|instagr\.am\/(p|reel))/i.test(url);

    if (!isFacebook && !isInstagram) {
      return res.status(400).json({ 
        success: false,
        message: 'Format URL non supporté. Exemples valides:\nFacebook: https://www.facebook.com/watch/?v=...\nInstagram: https://www.instagram.com/p/...'
      });
    }

    const timestamp = Date.now();
    const platform = isFacebook ? 'facebook' : 'instagram';
    const filename = sanitize(`${platform}-${timestamp}.mp4`);
    const filepath = path.join(DOWNLOAD_FOLDER, filename);

    // Options améliorées
    const options = {
      output: filepath,
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: [
        'referer:https://www.facebook.com/',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      ],
      quiet: true,
      extractorArgs: {
        instagram: {
          force_generic_extractor: true
        },
        facebook: {
          force_generic_extractor: true
        }
      }
    };

    console.log('Options de téléchargement:', options);
    await youtubedl(url, options);

    if (!fs.existsSync(filepath)) {
      throw new Error('Le fichier téléchargé est introuvable');
    }

    updateStats(1);
    console.log('Téléchargement réussi:', filename);

    res.json({
      success: true,
      downloadUrl: `/downloads/${filename}`,
      filename,
      message: 'Téléchargement réussi'
    });

  } catch (error) {
    console.error('Échec du téléchargement:', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      success: false,
      message: 'Échec du téléchargement. Raison: ' + error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// API Stats
app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    stats: {
      totalDownloads: stats.totalDownloads,
      todayDownloads: stats.todayDownloads,
      totalVisitors: stats.totalDownloads + Math.floor(Math.random() * 5000),
      activeUsers: Math.floor(Math.random() * 50) + 20
    }
  });
});

// Route GET / pour envoyer index.html
app.get('*', (req, res) => {
  res.sendFile(INDEX_HTML);
});

// Gestion des erreurs améliorée
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl
  });
  res.status(500).json({ 
    success: false,
    message: 'Erreur interne du serveur',
    ...(process.env.NODE_ENV === 'development' && { debug: err.stack })
  });
});

// Lancer le serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
  console.log('Configuration:', {
    PUBLIC_FOLDER,
    DOWNLOAD_FOLDER,
    INDEX_HTML,
    YT_DLP_PATH: process.env.YT_DLP_PATH || 'yt-dlp (par défaut)'
  });
});
