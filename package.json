// ======================================
// Vérification des dépendances critiques
// ======================================
console.log('🔍 Vérification des dépendances...');
const REQUIRED_MODULES = [
  'express', 'path', 'fs', 'yt-dlp-exec', 'sanitize-filename', 
  'express-rate-limit', 'cors', 'uuid'
];

REQUIRED_MODULES.forEach(module => {
  try {
    require.resolve(module);
    console.log(`✅ ${module}`);
  } catch (e) {
    console.error(`❌ ${module} - MANQUANT`);
    console.error(`Veuillez exécuter: npm install ${module}`);
    process.exit(1);
  }
});

// ======================================
// Import des dépendances
// ======================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const ytdlp = require('yt-dlp-exec');
const sanitize = require('sanitize-filename');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// ======================================
// Configuration de l'application
// ======================================
const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_FOLDER = path.join(__dirname, 'public');
const DOWNLOAD_FOLDER = path.join(__dirname, 'downloads');
const INDEX_HTML = path.join(PUBLIC_FOLDER, 'index.html');
const FILE_LIFETIME = 60000; // 1 minute (réduit pour les tests)

// ======================================
// Vérification des permissions
// ======================================
try {
  if (!fs.existsSync(DOWNLOAD_FOLDER)) {
    fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
    console.log('✅ Dossier downloads créé');
  }
  
  if (!fs.existsSync(PUBLIC_FOLDER)) {
    fs.mkdirSync(PUBLIC_FOLDER, { recursive: true });
    console.log('✅ Dossier public créé');
  }
  
  // Test des permissions d'écriture
  const testFile = path.join(DOWNLOAD_FOLDER, 'test_permission.txt');
  fs.writeFileSync(testFile, 'test');
  fs.unlinkSync(testFile);
  console.log('✅ Permissions d\'écriture OK');
} catch (error) {
  console.error('❌ Erreur de permissions:', error.message);
  process.exit(1);
}

// ======================================
// Middlewares
// ======================================
app.use(cors());
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
// Gestion des fichiers
// ======================================
function cleanOldFiles() {
  fs.readdir(DOWNLOAD_FOLDER, (err, files) => {
    if (err) return console.error('Error cleaning files:', err);
    
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(DOWNLOAD_FOLDER, file);
      fs.stat(filePath, (err, stat) => {
        if (!err && (now - stat.mtimeMs > FILE_LIFETIME)) {
          fs.unlink(filePath, err => {
            if (!err) console.log('Cleaned old file:', file);
          });
        }
      });
    });
  });
}
setInterval(cleanOldFiles, 30000);
cleanOldFiles();

// ======================================
// Statistiques
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
    (now - v.lastVisit) < 300000
  ).length;
}

// ======================================
// Validation des URLs
// ======================================
function validateUrl(url) {
  try {
    const platforms = {
      facebook: [
        /facebook\.com\/.*\/video(s)?\//i,
        /facebook\.com\/watch\/?/i,
        /facebook\.com\/reel\//i,
        /fb\.watch/i
      ],
      instagram: [
        /instagram\.com\/(p|reel|tv)\//i,
        /instagr\.am\/(p|reel|tv)\//i
      ],
      youtube: [
        /youtube\.com\/watch\?v=/i,
        /youtu\.be\//i,
        /youtube\.com\/shorts\//i
      ],
      tiktok: [
        /tiktok\.com\/.*\/video\//i,
        /tiktok\.com\/t\//i
      ]
    };

    for (const [platform, patterns] of Object.entries(platforms)) {
      for (const pattern of patterns) {
        if (pattern.test(url)) {
          return platform;
        }
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// ======================================
// Endpoints
// ======================================
app.post('/api/download', async (req, res) => {
  const { url } = req.body;
  const requestId = uuidv4();
  const clientIp = req.ip || req.connection.remoteAddress;

  console.log(`[${requestId}] Requête reçue pour: ${url}`);

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
      message: 'URL non supportée. Formats acceptés: Facebook, Instagram, YouTube, TikTok',
      type: 'UNSUPPORTED_PLATFORM'
    });
  }

  try {
    const filename = sanitize(`${platform}_${Date.now()}.mp4`);
    const filepath = path.join(DOWNLOAD_FOLDER, filename);

    console.log(`[${requestId}] Début du téléchargement depuis: ${platform}`);

    // Configuration simplifiée pour yt-dlp
    const options = [
      '-o', filepath,
      '--no-check-certificates',
      '--force-overwrites',
      '--rm-cache-dir',
      '--format', 'best[ext=mp4]',
      '--merge-output-format', 'mp4'
    ];

    await ytdlp(url, options);

    // Vérification que le fichier existe
    if (!fs.existsSync(filepath)) {
      throw new Error('Fichier introuvable après téléchargement');
    }

    const fileStats = fs.statSync(filepath);
    if (fileStats.size < 1024) {
      fs.unlinkSync(filepath);
      throw new Error('Fichier trop petit, probablement corrompu');
    }

    updateStats(clientIp);

    res.json({
      success: true,
      downloadUrl: `/downloads/${filename}`,
      filename: filename,
      platform: platform,
      fileSize: fileStats.size
    });

    console.log(`[${requestId}] Téléchargement réussi: ${filename}`);

  } catch (error) {
    console.error(`[${requestId}] Erreur:`, error.message);
    
    let errorMessage = 'Échec du téléchargement';
    let errorType = 'DOWNLOAD_FAILED';

    if (error.message.includes('Private') || error.message.includes('private')) {
      errorMessage = 'Vidéo privée - impossible de télécharger';
      errorType = 'PRIVATE_CONTENT';
    } else if (error.message.includes('Unsupported') || error.message.includes('unsupported')) {
      errorMessage = 'URL non supportée';
      errorType = 'UNSUPPORTED_URL';
    } else if (error.message.includes('429') || error.message.includes('rate limit')) {
      errorMessage = 'Limite de taux dépassée, veuillez réessayer plus tard';
      errorType = 'RATE_LIMITED';
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      type: errorType,
      platform: platform
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
        totalVisitors: stats.visitors.size,
        todayVisitors: Array.from(stats.visitors.values()).filter(v => {
          return new Date(v.lastVisit).toDateString() === new Date().toDateString();
        }).length,
        activeUsers: activeUsers
      },
      chartData: {
        labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
        downloads: [120, 150, 180, 90, 200, 160, 210],
        visitors: [80, 100, 120, 70, 150, 110, 180]
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
  console.error('Erreur serveur:', err);
  res.status(500).json({ 
    success: false,
    message: 'Erreur interne du serveur'
  });
});

// ======================================
// Démarrage du serveur
// ======================================
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📁 Dossier de téléchargement: ${DOWNLOAD_FOLDER}`);
  console.log('✅ Toutes les dépendances sont disponibles');
  console.log('\n📋 Points à vérifier:');
  console.log('   1. yt-dlp doit être installé sur le système');
  console.log('   2. Les dossiers public/ et downloads/ existent');
  console.log('   3. Le serveur a les permissions d\'écriture');
});
