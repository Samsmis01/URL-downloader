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
const INDEX_HTML = path.join(PUBLIC_FOLDER, 'index.html');
const FILE_LIFETIME = 3600000; // 1 heure

// Middlewares
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 'https://votre-site.onrender.com' : '*',
  methods: ['GET', 'POST']
}));
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

// Clean old files
function cleanOldFiles() {
  fs.readdir(DOWNLOAD_FOLDER, (err, files) => {
    if (err) return console.error('Error cleaning files:', err);
    
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(DOWNLOAD_FOLDER, file);
      fs.stat(filePath, (err, stat) => {
        if (!err && (now - stat.birthtimeMs > FILE_LIFETIME)) {
          fs.unlink(filePath, err => {
            if (!err) console.log('Cleaned old file:', file);
          });
        }
      });
    });
  });
}
setInterval(cleanOldFiles, 3600000); // Run hourly
cleanOldFiles();

// Stats tracking
const stats = {
  totalDownloads: 0,
  todayDownloads: 0,
  lastReset: new Date().toDateString(),
  visitors: new Map()
};

function updateStats(ip) {
  const today = new Date().toDateString();
  if (stats.lastReset !== today) {
    stats.todayDownloads = 0;
    stats.lastReset = today;
  }
  
  if (!stats.visitors.has(ip)) {
    stats.visitors.set(ip, { count: 0, lastVisit: new Date() });
  }
  const visitor = stats.visitors.get(ip);
  visitor.count++;
  visitor.lastVisit = new Date();
  
  stats.totalDownloads++;
  stats.todayDownloads++;
}

function getActiveUsers() {
  const now = new Date();
  return Array.from(stats.visitors.values()).filter(v => 
    (now - v.lastVisit) < 300000 // 5 minutes
  ).length;
}

// Enhanced download endpoint
app.post('/api/download', async (req, res) => {
  const { url } = req.body;
  const requestId = uuidv4();
  const clientIp = req.ip.replace(/^::ffff:/, '');
  const startTime = Date.now();

  if (!url) {
    return res.status(400).json({ 
      success: false,
      message: 'URL est requise'
    });
  }

  // Enhanced URL validation
  const isFacebook = /^(https?:\/\/)?(www\.|m\.|mbasic\.)?(facebook\.com|fb\.watch|fb\.com)\/(watch\/?\?v=|reel|story\.php\?story_fbid=|.+\/videos\/|groups\/.+\/permalink\/|\?v=|video\.php\?v=|\b.+\/videos\/\d+)/i.test(url);
  const isInstagram = /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\/(p|reel|tv)\/.+/i.test(url);

  if (!isFacebook && !isInstagram) {
    return res.status(400).json({ 
      success: false,
      message: 'Seuls les liens Facebook et Instagram sont supportés'
    });
  }

  const filename = sanitize(`${isFacebook ? 'fb' : 'ig'}_${Date.now()}.mp4`);
  const filepath = path.join(DOWNLOAD_FOLDER, filename);
  const tempPath = `${filepath}.download`;

  try {
    const options = {
      output: tempPath,
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      noCheckCertificates: true,
      noWarnings: true,
      retries: 5, // Augmenté à 5 tentatives
      socketTimeout: 60000, // 60 secondes
      quiet: true,
      addHeader: [
        `referer:${isFacebook ? 'https://www.facebook.com/' : 'https://www.instagram.com/'}`,
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      ],
      ...(isInstagram && {
        forceIpv4: true,
        proxy: process.env.INSTAGRAM_PROXY || '' // Optionnel pour contourner les blocages
      })
    };

    console.log(`[${requestId}] Début du téléchargement: ${url}`);
    const result = await ytdlp(url, options);
    console.log(`[${requestId}] Sortie yt-dlp:`, result.stdout);

    if (!fs.existsSync(tempPath)) {
      throw new Error('Fichier non trouvé après téléchargement');
    }

    fs.renameSync(tempPath, filepath);
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
    
    // Nettoyage en cas d'erreur
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch (cleanError) {
      console.error(`[${requestId}] Échec du nettoyage:`, cleanError.message);
    }

    return res.status(500).json({
      success: false,
      message: 'Échec du téléchargement. Raisons possibles :',
      details: [
        'La vidéo est privée ou supprimée',
        'Problème de connexion avec Instagram/Facebook',
        'Serveur surchargé (réessayez plus tard)'
      ],
      ...(process.env.NODE_ENV === 'development' && {
        error: error.message,
        stack: error.stack
      })
    });
  }
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
  try {
    const activeUsers = getActiveUsers();
    const totalVisitors = stats.visitors.size;
    
    const months = Array.from({ length: 12 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (11 - i));
      return date;
    });

    res.json({
      success: true,
      stats: {
        totalDownloads: stats.totalDownloads,
        todayDownloads: stats.todayDownloads,
        totalVisitors,
        activeUsers,
        serverUptime: process.uptime()
      },
      chartData: {
        labels: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'],
        downloads: months.map(() => Math.floor(stats.totalDownloads / 12 * (0.8 + Math.random() * 0.4))),
        visitors: months.map(() => Math.floor(totalVisitors / 12 * (0.8 + Math.random() * 0.6)))
      }
    });
  } catch (error) {
    console.error('Erreur stats:', error);
    res.status(500).json({ success: false, message: 'Erreur des statistiques' });
  }
});

// Serve index.html
app.get('*', (req, res) => {
  res.sendFile(INDEX_HTML);
});

// Error handling
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

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
  console.log(`Environnement: ${process.env.NODE_ENV || 'development'}`);
});
