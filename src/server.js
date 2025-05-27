const express = require('express');
const path = require('path');
const fs = require('fs');
const youtubedl = require('yt-dlp-exec');
const sanitize = require('sanitize-filename');
const rateLimit = require('express-rate-limit');

const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const PUBLIC_FOLDER = path.join(__dirname, 'public');
const DOWNLOAD_FOLDER = path.join(PUBLIC_FOLDER, 'downloads');
const FILE_LIFETIME = 58000; // 58 secondes

// Middlewares
app.use(express.static(PUBLIC_FOLDER));
app.use(express.json());

// Limiteur anti-abus
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/download', limiter);

// Créer dossier de téléchargement si absent
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
  fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

// Nettoyage des fichiers anciens
setInterval(() => {
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
}, 60000);

// Route GET / pour afficher index.html (protection anti Cannot GET /)
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_FOLDER, 'index.html'));
});

// Route de téléchargement
app.post('/download', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.match(/(facebook\.com|instagram\.com)/i)) {
      return res.status(400).json({ error: 'URL Facebook ou Instagram invalide' });
    }

    const filename = sanitize(`video_${Date.now()}.mp4`);
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
      ]
    };

    await youtubedl(url, options);

    res.json({
      success: true,
      downloadUrl: `/downloads/${filename}`,
      filename
    });

  } catch (error) {
    console.error('Erreur téléchargement:', error);
    res.status(500).json({ error: 'Téléchargement échoué', details: error.message });
  }
});

// Lancer serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
