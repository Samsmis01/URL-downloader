const express = require('express');
const path = require('path');
const fs = require('fs');
const ytdlp = require('yt-dlp-exec').create('/usr/local/bin/yt-dlp');
const sanitize = require('sanitize-filename');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const PUBLIC_FOLDER = path.join(__dirname, '../public');
const DOWNLOAD_FOLDER = path.join(PUBLIC_FOLDER, 'downloads');
const INDEX_HTML = path.join(PUBLIC_FOLDER, 'index.html'); // Correction: déplacé vers public
const FILE_LIFETIME = 3600000;

// Middlewares
app.use(cors());
app.use('/downloads', express.static(DOWNLOAD_FOLDER));
app.use(express.static(PUBLIC_FOLDER));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard' }
});
app.use('/api/download', limiter);

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
  fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

// Nettoyage des fichiers (inchangé)
setInterval(cleanOldFiles, 3600000);

// Enhanced Regex pour URLs
const FB_REGEX = /(?:https?:\/\/(?:www\.|m\.|mbasic\.)?(?:facebook\.com|fb\.watch|fb\.com)\/(?:watch\/?\?v=|reel|story\.php\?story_fbid=|.+?\/videos\/|groups\/.+?\/permalink\/|\?v=)|facebook\.com\/video\.php\?v=|\bfacebook\.com\/.+\/videos\/\d+)/i;
const IG_REGEX = /(?:https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/|instagr\.am\/(?:p|reel|tv)\/)/i;

// Enhanced download endpoint
app.post('/api/download', async (req, res) => {
  const { url } = req.body;
  const requestId = uuidv4();
  const tempPath = path.join(DOWNLOAD_FOLDER, `${requestId}.tmp`);

  try {
    // Validation améliorée
    if (!url?.match(FB_REGEX) && !url?.match(IG_REGEX)) {
      return res.status(400).json({ 
        success: false,
        message: 'URL non supportée. Seuls Facebook et Instagram sont autorisés.'
      });
    }

    // Configuration dynamique
    const options = {
      output: tempPath,
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      noCheckCertificates: true,
      retries: 5, // Augmenté
      socketTimeout: 60000, // Augmenté
      addHeader: [
        `referer:${url.match(FB_REGEX) ? 'https://www.facebook.com/' : 'https://www.instagram.com/'}`,
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      ],
      verbose: true // Logs détaillés
    };

    console.log(`[${requestId}] Téléchargement: ${url}`);
    const output = await ytdlp(url, options);
    console.log(`[${requestId}] Sortie yt-dlp:`, output.stdout);

    // Vérification renforcée
    if (!fs.existsSync(tempPath) {
      throw new Error('Fichier introuvable après téléchargement');
    }

    const filename = sanitize(`${url.match(FB_REGEX) ? 'fb' : 'ig'}_${Date.now()}.mp4`);
    const filepath = path.join(DOWNLOAD_FOLDER, filename);
    fs.renameSync(tempPath, filepath);

    res.json({
      success: true,
      downloadUrl: `/downloads/${filename}`,
      filename
    });

  } catch (error) {
    console.error(`[${requestId}] ERREUR:`, error);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

    res.status(500).json({
      success: false,
      message: 'Échec du téléchargement. Cause possible : ' + 
        (error.message.includes('Unsupported URL') ? 'URL privée/bloquée' : 
         'Problème réseau. Réessayez avec un VPN.'),
      debug: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Gestion des erreurs globale (améliorée)
app.use((err, req, res, next) => {
  console.error('ERREUR SERVEUR:', err);
  res.status(500).json({ 
    success: false,
    message: 'Erreur interne. Contactez l\'administrateur avec l\'ID: ' + uuidv4()
  });
});

app.listen(PORT, () => console.log(`Serveur démarré sur http://localhost:${PORT}`));
