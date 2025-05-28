const express = require('express');
const path = require('path');
const fs = require('fs');
const youtubedl = require('yt-dlp-exec');
const sanitize = require('sanitize-filename');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();

// Configurations
const PORT = process.env.PORT || 3000;
// Correction du chemin pour Render
const PUBLIC_FOLDER = path.join(__dirname, '../public');
const DOWNLOAD_FOLDER = path.join(PUBLIC_FOLDER, 'downloads');
const FILE_LIFETIME = 58000; // 58 secondes

// Middlewares
app.use(cors());
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
cleanOldFiles(); // Nettoyage au démarrage

// Stats en mémoire
let stats = {
  totalDownloads: 0,
  todayDownloads: 0,
  lastReset: new Date().toDateString()
};

function updateStats(increment = 1) {
  // Réinitialiser si nouveau jour
  if (new Date().toDateString() !== stats.lastReset) {
    stats.todayDownloads = 0;
    stats.lastReset = new Date().toDateString();
  }
  stats.totalDownloads += increment;
  stats.todayDownloads += increment;
}

// API Download
app.post('/api/download', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ 
        success: false,
        message: 'URL requise'
      });
    }

    // Validation des URLs
    const isFacebook = /(facebook\.com|fb\.watch|fb\.com)/i.test(url);
    const isInstagram = /(instagram\.com|instagr\.am)/i.test(url);

    if (!isFacebook && !isInstagram) {
      return res.status(400).json({ 
        success: false,
        message: 'Seules les URLs Facebook et Instagram sont supportées'
      });
    }

    const timestamp = Date.now();
    const platform = isFacebook ? 'facebook' : 'instagram';
    const filename = sanitize(`${platform}-${timestamp}.mp4`);
    const filepath = path.join(DOWNLOAD_FOLDER, filename);

    const options = {
      output: filepath,
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: [
        'referer:youtube.com',
        'user-agent:googlebot'
      ],
      quiet: true
    };

    console.log(`Début du téléchargement: ${url}`);
    await youtubedl(url, options);

    if (!fs.existsSync(filepath)) {
      throw new Error('Le fichier n\'a pas été créé');
    }

    updateStats(1);

    res.json({
      success: true,
      downloadUrl: `/downloads/${filename}`,
      filename,
      message: 'Téléchargement réussi'
    });

  } catch (error) {
    console.error('Erreur téléchargement:', error);
    res.status(500).json({ 
      success: false,
      message: 'Échec du téléchargement',
      details: error.message
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
  res.sendFile(path.join(PUBLIC_FOLDER, 'index.html'));
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);
  res.status(500).json({ 
    success: false,
    message: 'Erreur interne du serveur'
  });
});

// Lancer le serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
})
