const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const ytdlp = require('yt-dlp-exec').create('/usr/local/bin/yt-dlp');
const sanitize = require('sanitize-filename');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Initialisation de l'application
const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const PUBLIC_FOLDER = path.join(__dirname, '../public');
const DOWNLOAD_FOLDER = path.join(PUBLIC_FOLDER, 'downloads');
const INDEX_HTML = path.join(PUBLIC_FOLDER, 'index.html'); // Correction du chemin
const FILE_LIFETIME = 3600000; // 1 heure en ms

// Middlewares
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 'https://votre-domaine.com' : '*'
}));
app.use('/downloads', express.static(DOWNLOAD_FOLDER));
app.use(express.static(PUBLIC_FOLDER));
app.use(express.json());

// Rate limiting amélioré
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    success: false,
    error: 'Trop de requêtes, veuillez réessayer plus tard' 
  }
});
app.use('/api/download', limiter);

// Vérification du dossier de téléchargement (version async)
async function ensureDownloadDir() {
  try {
    await fs.access(DOWNLOAD_FOLDER);
  } catch {
    await fs.mkdir(DOWNLOAD_FOLDER, { recursive: true });
  }
}

// Nettoyage des fichiers anciens (version optimisée)
async function cleanOldFiles() {
  try {
    const files = await fs.readdir(DOWNLOAD_FOLDER);
    const now = Date.now();
    
    await Promise.all(files.map(async (file) => {
      const filePath = path.join(DOWNLOAD_FOLDER, file);
      const stat = await fs.stat(filePath);
      
      if (now - stat.birthtimeMs > FILE_LIFETIME) {
        await fs.unlink(filePath);
        console.log(`Fichier nettoyé: ${file}`);
      }
    }));
  } catch (error) {
    console.error('Erreur lors du nettoyage:', error.message);
  }
}

// Statistiques améliorées
const stats = {
  totalDownloads: 0,
  todayDownloads: 0,
  lastReset: new Date().toDateString(),
  visitors: new Map() // Utilisation de Map pour de meilleures performances
};

function updateStats(ip) {
  const today = new Date().toDateString();
  
  // Réinitialisation quotidienne
  if (stats.lastReset !== today) {
    stats.todayDownloads = 0;
    stats.lastReset = today;
  }
  
  // Mise à jour des visiteurs
  if (!stats.visitors.has(ip)) {
    stats.visitors.set(ip, { count: 0, lastVisit: new Date() });
  }
  
  const visitor = stats.visitors.get(ip);
  visitor.count++;
  visitor.lastVisit = new Date();
  
  // Mise à jour des compteurs
  stats.totalDownloads++;
  stats.todayDownloads++;
}

function getActiveUsers() {
  const now = new Date();
  return Array.from(stats.visitors.values()).filter(v => 
    (now - v.lastVisit) < 300000 // 5 minutes
  ).length;
}

// Regex améliorés pour Facebook/Instagram
const PLATFORM_REGEX = {
  facebook: /(?:(?:https?:\/\/(?:www\.|m\.|mbasic\.)?(?:facebook\.com|fb\.watch|fb\.com)\/(?:watch\/?\?v=|reel|story\.php\?story_fbid=|.+\/videos\/|groups\/.+\/permalink\/|\?v=)|facebook\.com\/video\.php\?v=|\bfacebook\.com\/.+\/videos\/\d+)/i,
  instagram: /(?:https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/|instagr\.am\/(?:p|reel|tv)\/)/i
};

// Endpoint de téléchargement professionnalisé
app.post('/api/download', async (req, res) => {
  const { url } = req.body;
  const requestId = uuidv4();
  const clientIp = req.ip;
  const startTime = Date.now();
  
  if (!url) {
    return res.status(400).json({ 
      success: false,
      message: 'URL est requise'
    });
  }

  // Détection de plateforme améliorée
  const platform = PLATFORM_REGEX.facebook.test(url) ? 'facebook' 
                : PLATFORM_REGEX.instagram.test(url) ? 'instagram' 
                : null;

  if (!platform) {
    return res.status(400).json({ 
      success: false,
      message: 'Seules les URLs Facebook et Instagram sont supportées'
    });
  }

  const filename = sanitize(`${platform}_${Date.now()}.mp4`);
  const filepath = path.join(DOWNLOAD_FOLDER, filename);
  const tempPath = `${filepath}.download`;

  // Configuration avancée par plateforme
  const options = {
    output: tempPath,
    format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    noCheckCertificates: true,
    preferFreeFormats: true,
    retries: 5, // Augmenté à 5 tentatives
    socketTimeout: 60000, // 60 secondes
    addHeader: [
      `referer:https://www.${platform}.com/`,
      'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    ],
    verbose: true // Logs détaillés
  };

  try {
    console.log(`[${requestId}] Début du téléchargement (${platform}): ${url}`);
    await ytdlp(url, options);

    // Vérification renforcée
    try {
      await fs.access(tempPath);
      await fs.rename(tempPath, filepath);
    } catch (fsError) {
      throw new Error(`Échec du traitement du fichier: ${fsError.message}`);
    }

    updateStats(clientIp);
    console.log(`[${requestId}] Téléchargement réussi en ${((Date.now() - startTime)/1000).toFixed(2)}s`);

    return res.json({
      success: true,
      downloadUrl: `/downloads/${filename}`,
      filename,
      processingTime: `${((Date.now() - startTime)/1000).toFixed(2)}s`
    });

  } catch (error) {
    console.error(`[${requestId}] Échec du téléchargement:`, error.message);
    
    // Nettoyage sécurisé
    try {
      if (fsSync.existsSync(tempPath)) {
        await fs.unlink(tempPath);
      }
    } catch (cleanError) {
      console.error(`[${requestId}] Échec du nettoyage:`, cleanError.message);
    }

    return res.status(500).json({
      success: false,
      message: 'Échec du téléchargement. Veuillez essayer une autre vidéo.',
      ...(process.env.NODE_ENV === 'development' && {
        error: error.message,
        stack: error.stack
      })
    });
  }
});

// Endpoint de statistiques optimisé
app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      totalDownloads: stats.totalDownloads,
      todayDownloads: stats.todayDownloads,
      totalVisitors: stats.visitors.size,
      activeUsers: getActiveUsers(),
      chartData: generateChartData()
    },
    server: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    }
  });
});

// Génération des données de graphique
function generateChartData() {
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (11 - i));
    return date;
  });

  return {
    labels: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'],
    datasets: {
      downloads: months.map(() => Math.floor(stats.totalDownloads / 12 * (0.8 + Math.random() * 0.4))),
      visitors: months.map(() => Math.floor(stats.visitors.size / 12 * (1.2 + Math.random() * 0.6)))
    }
  };
}

// Gestion des erreurs centralisée
app.use((err, req, res, next) => {
  const errorId = uuidv4();
  console.error(`[${errorId}] Erreur serveur:`, err.stack || err);
  
  res.status(500).json({
    success: false,
    message: 'Erreur interne du serveur',
    errorId,
    timestamp: new Date().toISOString()
  });
});

// Initialisation et démarrage du serveur
async function startServer() {
  await ensureDownloadDir();
  await cleanOldFiles();
  setInterval(cleanOldFiles, 3600000); // Nettoyage horaire

  app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
    console.log(`Environnement: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Dossier de téléchargement: ${DOWNLOAD_FOLDER}`);
  });
}

startServer().catch(err => {
  console.error('Échec du démarrage du serveur:', err);
  process.exit(1);
});
