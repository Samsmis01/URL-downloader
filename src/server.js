// ======================================
// Vérification et installation des dépendances critiques
// ======================================
const REQUIRED_MODULES = [
  'express', 'path', 'fs', 'yt-dlp-exec', 'sanitize-filename', 
  'express-rate-limit', 'cors', 'uuid', 'path-to-regexp'
];

for (const module of REQUIRED_MODULES) {
  try {
    require.resolve(module);
  } catch (e) {
    console.error(`[INIT] Module manquant détecté: ${module}`);
    const { execSync } = require('child_process');
    try {
      execSync(`npm install ${module} --save`, { stdio: 'inherit' });
      console.log(`[INIT] ${module} installé avec succès`);
    } catch (installError) {
      console.error(`[INIT] Échec de l'installation de ${module}:`, installError);
      process.exit(1);
    }
  }
}

// ======================================
// Import des dépendances
// ======================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const ytdlp = require('yt-dlp-exec').exec;
const sanitize = require('sanitize-filename');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// ======================================
// Correctif path-to-regexp (version sécurisée)
// ======================================
let pathToRegexp;
try {
  pathToRegexp = require('path-to-regexp');
} catch (e) {
  console.error('Erreur de chargement de path-to-regexp:', e.message);
  pathToRegexp = (path, keys, options) => {
    if (typeof path === 'string') {
      path = path.replace(/\*/g, '(.*)')
                .replace(/[()|+?]/g, '\\$&');
    }
    return new RegExp(path, options);
  };
}

// ======================================
// Configuration de l'application
// ======================================
const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_FOLDER = path.join(__dirname, '../public');
const DOWNLOAD_FOLDER = path.join(PUBLIC_FOLDER, 'downloads');
const INDEX_HTML = path.join(PUBLIC_FOLDER, 'index.html');
const FILE_LIFETIME = 3600000; // 1 heure

// ======================================
// Middlewares (votre code existant inchangé)
// ======================================
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 'https://votre-site.onrender.com' : '*',
  methods: ['GET', 'POST']
}));
app.use('/downloads', express.static(DOWNLOAD_FOLDER));
app.use(express.static(PUBLIC_FOLDER));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard' }
});
app.use('/api/download', limiter);

// ======================================
// Gestion des fichiers (code existant inchangé)
// ======================================
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
  fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

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
setInterval(cleanOldFiles, 3600000);
cleanOldFiles();

// ======================================
// Statistiques (code existant inchangé)
// ======================================
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
    (now - new Date(v.lastVisit)) < 300000
  ).length;
}

// ======================================
// Validation des URLs (code existant inchangé)
// ======================================
function validateUrl(url) {
  const platforms = {
    facebook: /^(https?:\/\/)?(www\.|m\.|mbasic\.)?(facebook\.com|fb\.watch|fb\.com)\/(watch\/?\?v=|reel|story\.php\?story_fbid=|.+\/videos\/|groups\/.+\/permalink\/|\?v=|video\.php\?v=|\b.+\/videos\/\d+)/i,
    instagram: /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\/(p|reel|tv)\/.+/i,
    youtube: /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/(watch\?v=|embed\/|v\/|shorts\/|playlist\?list=|@[^\/]+\/videos\/|live\/|channel\/[^\/]+\/videos\/).+/i,
    tiktok: /^(https?:\/\/)?(www\.|vm\.|vt\.)?(tiktok\.com)\/(@[^\/]+\/video\/|v\/|embed\/|t\/|[\w-]+\/video\/\d+)/i,
    twitter: /^(https?:\/\/)?(www\.|mobile\.)?(twitter\.com|x\.com)\/([^\/]+\/status\/\d+|i\/web\/status\/\d+)/i,
    soundcloud: /^(https?:\/\/)?(www\.)?(soundcloud\.com)\/[^\/]+\/[^\/]+/i,
    vimeo: /^(https?:\/\/)?(www\.)?(vimeo\.com)\/(\d+|groups\/[^\/]+\/videos\/\d+|channels\/[^\/]+\/\d+)/i,
    dailymotion: /^(https?:\/\/)?(www\.)?(dailymotion\.com|dai\.ly)\/(video|embed\/video|hub)\/([^_]+|[^\/]+\/[^_]+)/i
  };

  for (const [platform, regex] of Object.entries(platforms)) {
    if (regex.test(url)) return platform;
  }
  return null;
}

// ======================================
// Endpoints (code existant inchangé)
// ======================================
app.post('/api/download', async (req, res) => {
  const { url } = req.body;
  const requestId = uuidv4();
  const clientIp = req.ip.replace(/^::ffff:/, '');

  if (!url) {
    return res.status(400).json({ 
      success: false,
      message: 'URL est requise',
      type: 'MISSING_URL'
    });
  }

  const platform = validateUrl(url);
  if (!platform) {
    return res.status(400).json({ 
      success: false,
      message: 'URL non supportée',
      type: 'UNSUPPORTED_PLATFORM'
    });
  }

  try {
    const filename = sanitize(`${platform}_${Date.now()}.mp4`);
    const filepath = path.join(DOWNLOAD_FOLDER, filename);
    const tempPath = `${filepath}.download`;

    const options = {
      output: tempPath,
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      noCheckCertificates: true,
      noWarnings: true,
      retries: 3,
      socketTimeout: 30000,
      quiet: true,
      addHeader: [
        `referer:${new URL(url).origin}`,
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      ]
    };

    if (platform === 'youtube') {
      options.extractAudio = false;
      options.mergeOutputFormat = 'mp4';
    } else if (platform === 'soundcloud') {
      options.extractAudio = true;
      options.audioFormat = 'mp3';
      options.output = tempPath.replace('.mp4', '.mp3');
    }

    console.log(`[${requestId}] Début du téléchargement: ${url}`);
    const result = await ytdlp(url, options);

    const finalPath = platform === 'soundcloud' ? tempPath.replace('.mp4', '.mp3') : tempPath;
    if (!fs.existsSync(finalPath)) {
      throw new Error('Fichier introuvable');
    }

    const stats = fs.statSync(finalPath);
    if (stats.size < 1024) {
      fs.unlinkSync(finalPath);
      throw new Error('Fichier corrompu');
    }

    fs.renameSync(finalPath, filepath);
    updateStats(clientIp);

    res.json({
      success: true,
      downloadUrl: `/downloads/${filename}`,
      filename,
      platform,
      fileSize: stats.size,
      duration: result.duration || null
    });

  } catch (error) {
    console.error(`[${requestId}] Erreur:`, error.message);
    let errorType = 'DOWNLOAD_FAILED';
    if (error.message.includes('Private video')) errorType = 'PRIVATE_CONTENT';
    if (error.message.includes('Unsupported URL')) errorType = 'UNSUPPORTED_URL';
    if (error.message.includes('429')) errorType = 'RATE_LIMITED';

    res.status(500).json({
      success: false,
      message: `Échec: ${error.message}`,
      type: errorType,
      platform
    });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const activeUsers = getActiveUsers();
    res.json({
      success: true,
      stats: {
        totalDownloads: stats.totalDownloads,
        todayDownloads: stats.todayDownloads,
        activeUsers
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Erreur des statistiques'
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(INDEX_HTML);
});

app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err.stack);
  res.status(500).json({ 
    success: false,
    message: 'Erreur interne'
  });
});

// ======================================
// Démarrage du serveur
// ======================================
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
  console.log(`Dossier de téléchargement: ${DOWNLOAD_FOLDER}`);
  console.log('Vérification des dépendances:');
  REQUIRED_MODULES.forEach(m => {
    try {
      const version = require(m).version || 'OK';
      console.log(`- ${m}: ${version}`);
    } catch (e) {
      console.error(`- ${m}: ERREUR`);
    }
  });
})
