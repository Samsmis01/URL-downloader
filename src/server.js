// ======================================
// Vérification et installation des dépendances critiques
// ======================================
const REQUIRED_MODULES = [
  'express', 'path', 'fs', 'yt-dlp-exec', 'sanitize-filename', 
  'express-rate-limit', 'cors', 'uuid'
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
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
  fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

if (!fs.existsSync(PUBLIC_FOLDER)) {
  fs.mkdirSync(PUBLIC_FOLDER, { recursive: true });
}

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
// Statistiques RÉELLES (pas de simulation)
// ======================================
const stats = {
  totalDownloads: 0,
  todayDownloads: 0,
  lastReset: new Date().toDateString(),
  visitors: new Map(),
  dailyStats: new Map() // Pour suivre les stats par jour
};

// Charger les statistiques depuis un fichier si existant
const STATS_FILE = path.join(__dirname, 'stats.json');
function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = fs.readFileSync(STATS_FILE, 'utf8');
      const savedStats = JSON.parse(data);
      
      stats.totalDownloads = savedStats.totalDownloads || 0;
      stats.todayDownloads = savedStats.todayDownloads || 0;
      stats.lastReset = savedStats.lastReset || new Date().toDateString();
      
      // Charger les visiteurs
      if (savedStats.visitors) {
        stats.visitors = new Map(Object.entries(savedStats.visitors));
      }
      
      // Charger les stats quotidiennes
      if (savedStats.dailyStats) {
        stats.dailyStats = new Map(Object.entries(savedStats.dailyStats));
      }
      
      console.log('📊 Statistiques chargées depuis le fichier');
    }
  } catch (error) {
    console.error('Erreur lors du chargement des statistiques:', error);
  }
}

// Sauvegarder les statistiques dans un fichier
function saveStats() {
  try {
    const dataToSave = {
      totalDownloads: stats.totalDownloads,
      todayDownloads: stats.todayDownloads,
      lastReset: stats.lastReset,
      visitors: Object.fromEntries(stats.visitors),
      dailyStats: Object.fromEntries(stats.dailyStats),
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(STATS_FILE, JSON.stringify(dataToSave, null, 2));
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des statistiques:', error);
  }
}

// Charger les stats au démarrage
loadStats();

// Mettre à jour les statistiques quotidiennes
function updateDailyStats() {
  const today = new Date().toDateString();
  if (!stats.dailyStats.has(today)) {
    stats.dailyStats.set(today, { downloads: 0, visitors: new Set() });
  }
  
  return stats.dailyStats.get(today);
}

function updateStats(ip) {
  const today = new Date().toDateString();
  
  // Réinitialiser les stats du jour si nécessaire
  if (stats.lastReset !== today) {
    stats.todayDownloads = 0;
    stats.lastReset = today;
  }
  
  // Mettre à jour les stats du visiteur
  if (!stats.visitors.has(ip)) {
    stats.visitors.set(ip, { count: 0, lastVisit: new Date(), firstVisit: new Date() });
  }
  const visitor = stats.visitors.get(ip);
  visitor.count++;
  visitor.lastVisit = new Date();
  
  // Mettre à jour les stats globales
  stats.totalDownloads++;
  stats.todayDownloads++;
  
  // Mettre à jour les stats quotidiennes
  const daily = updateDailyStats();
  daily.downloads++;
  daily.visitors.add(ip);
  
  // Sauvegarder les stats
  saveStats();
}

function getActiveUsers() {
  const now = new Date();
  return Array.from(stats.visitors.values()).filter(v => 
    (now - v.lastVisit) < 300000
  ).length;
}

// Obtenir les données pour le graphique (7 derniers jours)
function getChartData() {
  const labels = [];
  const downloadsData = [];
  const visitorsData = [];
  
  const today = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(today.getDate() - i);
    const dateString = date.toDateString();
    
    labels.push(getDayName(date.getDay()));
    
    if (stats.dailyStats.has(dateString)) {
      const dayStats = stats.dailyStats.get(dateString);
      downloadsData.push(dayStats.downloads);
      visitorsData.push(dayStats.visitors.size);
    } else {
      downloadsData.push(0);
      visitorsData.push(0);
    }
  }
  
  return { labels, downloads: downloadsData, visitors: visitorsData };
}

function getDayName(dayIndex) {
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  return days[dayIndex];
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
    const chartData = getChartData();
    
    res.json({
      success: true,
      stats: {
        totalDownloads: stats.totalDownloads,
        todayDownloads: stats.todayDownloads,
        totalVisitors: stats.visitors.size,
        todayVisitors: Array.from(stats.visitors.values()).filter(v => {
          return new Date(v.lastVisit).toDateString() === new Date().toDateString();
        }).length,
        activeUsers: activeUsers,
        serverUptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      },
      chartData: chartData
    });
  } catch (error) {
    console.error('Erreur dans /api/stats:', error);
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
  console.log('✅ Dépendances vérifiées:');
  REQUIRED_MODULES.forEach(m => {
    try {
      console.log(`   - ${m}: ✔️`);
    } catch (e) {
      console.log(`   - ${m}: ❌`);
    }
  });
  console.log('\n📋 Points à vérifier:');
  console.log('   1. yt-dlp doit être installé sur le système');
  console.log('   2. Les dossiers public/ et downloads/ doivent exister');
  console.log('   3. Le serveur doit avoir les permissions d\'écriture');
  console.log(`📊 Statistiques initialisées: ${stats.totalDownloads} téléchargements totaux`);
});

// Sauvegarder les stats avant de quitter
process.on('SIGINT', () => {
  console.log('\n💾 Sauvegarde des statistiques...');
  saveStats();
  process.exit(0);
});
