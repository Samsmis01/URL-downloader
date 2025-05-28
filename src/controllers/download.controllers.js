const path = require('path');
const fs = require('fs');
const ytdlp = require('../utils/yt-dlp-wrapper');
const sanitize = require('sanitize-filename');
const { performance } = require('perf_hooks');

// Config
const DOWNLOAD_FOLDER = path.join(__dirname, '../../public/downloads');
const MAX_RETRIES = 3;
const DOWNLOAD_TIMEOUT = 300000; // 5 minutes

exports.downloadVideo = async (req, res) => {
  const startTime = performance.now();
  let attempt = 0;
  let result;

  try {
    // Validation
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ 
        success: false,
        message: 'URL is required'
      });
    }

    // Créer le dossier si inexistant
    if (!fs.existsSync(DOWNLOAD_FOLDER)) {
      fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
    }

    // Configuration
    const filename = sanitize(`video-${Date.now()}.mp4`);
    const filepath = path.join(DOWNLOAD_FOLDER, filename);
    const tempPath = filepath + '.tmp';

    // Options avancées
    const options = {
      output: tempPath,
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      noCheckCertificates: true,
      noWarnings: true,
      timeout: DOWNLOAD_TIMEOUT,
      retries: MAX_RETRIES,
      addHeader: [
        'referer:https://www.facebook.com/',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      ]
    };

    // Téléchargement avec réessais
    while (attempt < MAX_RETRIES) {
      attempt++;
      try {
        console.log(`Attempt ${attempt} for URL: ${url}`);
        result = await ytdlp.download(url, options);
        
        // Renommer le fichier temporaire
        if (fs.existsSync(tempPath)) {
          fs.renameSync(tempPath, filepath);
        }

        break;
      } catch (err) {
        if (attempt >= MAX_RETRIES) throw err;
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Backoff
      }
    }

    // Vérification finale
    if (!fs.existsSync(filepath)) {
      throw new Error('Downloaded file not found');
    }

    // Log réussi
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`Download completed in ${duration}s: ${filename}`);

    // Réponse
    res.json({ 
      success: true,
      filename,
      downloadUrl: `/downloads/${filename}`,
      metadata: {
        size: fs.statSync(filepath).size,
        duration: duration + 's',
        attempts: attempt
      }
    });

  } catch (error) {
    // Nettoyage en cas d'erreur
    if (result?.tempPath && fs.existsSync(result.tempPath)) {
      fs.unlinkSync(result.tempPath);
    }

    // Log d'erreur détaillé
    console.error('Download failed:', {
      url: req.body.url,
      attempt,
      error: error.message,
      stack: error.stack
    });

    // Réponse d'erreur
    res.status(500).json({
      success: false,
      message: 'Download failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? {
        attempts: attempt,
        stack: error.stack
      } : undefined
    });
  }
};
