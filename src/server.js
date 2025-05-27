const express = require('express');
const path = require('path');
const fs = require('fs');
const youtubedl = require('yt-dlp-exec');
const sanitize = require('sanitize-filename');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const history = require('connect-history-api-fallback');

const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const PUBLIC_FOLDER = path.join(__dirname, 'public');
const DOWNLOAD_FOLDER = path.join(PUBLIC_FOLDER, 'downloads');
const FILE_LIFETIME = 60 * 1000; // 1 minute

// Middlewares sécurisés
app.use(helmet());
app.use(express.json());
app.use(history()); // Middleware pour les SPA

// Configuration robuste des fichiers statiques
app.use(express.static(PUBLIC_FOLDER, {
  dotfiles: 'ignore',
  extensions: ['html'],
  index: 'index.html',
  fallthrough: false
}));

// Limiteur anti-abus
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard' }
});
app.use('/download', limiter);

// Gestion des dossiers
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  }
};
ensureDir(DOWNLOAD_FOLDER);

// Nettoyage automatique des fichiers
const cleanOldFiles = () => {
  fs.readdir(DOWNLOAD_FOLDER, (err, files) => {
    if (err) return console.error('Erreur lecture dossier:', err);
    
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(DOWNLOAD_FOLDER, file);
      fs.stat(filePath, (err, stat) => {
        if (!err && now - stat.birthtimeMs > FILE_LIFETIME) {
          fs.unlink(filePath, err => {
            console.log(err || `Fichier supprimé: ${file}`);
          });
        }
      });
    });
  });
};
setInterval(cleanOldFiles, FILE_LIFETIME);

// Route GET sécurisée
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_FOLDER, 'index.html'), (err) => {
    if (err) {
      res.status(404).send('Fichier index non trouvé');
      console.error('Erreur chargement index:', err);
    }
  });
});

// Route de téléchargement sécurisée
app.post('/download', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.match(/(facebook\.com|instagram\.com)/i)) {
      return res.status(400).json({ error: 'URL invalide - Seuls Facebook et Instagram sont autorisés' });
    }

    const filename = sanitize(`video_${Date.now()}.mp4`);
    const filepath = path.join(DOWNLOAD_FOLDER, filename);

    const options = {
      output: filepath,
      format: 'best[ext=mp4]',
      noCheckCertificates: false, // Toujours vérifier les certificats
      restrictFilenames: true,
      referer: 'https://www.facebook.com/',
      userAgent: 'Mozilla/5.0'
    };

    await youtubedl(url, options);

    // Vérification que le fichier existe
    if (!fs.existsSync(filepath)) {
      throw new Error('Le fichier n\'a pas été créé');
    }

    res.json({
      success: true,
      downloadUrl: `/downloads/${filename}`,
      expiresAt: Date.now() + FILE_LIFETIME
    });

  } catch (error) {
    console.error('Erreur téléchargement:', error);
    res.status(500).json({ 
      error: 'Échec du téléchargement',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Gestion des routes inexistantes
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_FOLDER, '404.html'), (err) => {
    if (err) res.status(404).send('Page non trouvée');
  });
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);
  res.status(500).send('Erreur interne du serveur');
});

// Lancer le serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
})
