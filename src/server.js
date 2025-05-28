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
const INDEX_HTML = path.join(DOWNLOAD_FOLDER, 'index.html');
const FILE_LIFETIME = 3600000; // 1 heure

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
  lastReset: new Date().toDateString()
};

function updateStats() {
  const today = new Date().toDateString();
  if (stats.lastReset !== today) {
    stats.todayDownloads = 0;
    stats.lastReset = today;
  }
  stats.totalDownloads++;
  stats.todayDownloads++;
}

// Enhanced download endpoint
app.post('/api/download', async (req, res) => {
  const { url } = req.body;
  const requestId = uuidv4();
  const startTime = Date.now();

  try {
    // Validate URL
    if (!url) {
      return res.status(400).json({ 
        success: false,
        message: 'URL is required'
      });
    }

    const isFacebook = /(facebook\.com\/(watch|reel)|fb\.watch|fb\.com\/watch\?v=)/i.test(url);
    const isInstagram = /(instagram\.com\/(p|reel|tv)|instagr\.am\/(p|reel|tv))/i.test(url);

    if (!isFacebook && !isInstagram) {
      return res.status(400).json({ 
        success: false,
        message: 'Only Facebook and Instagram URLs are supported'
      });
    }

    // Prepare download
    const filename = sanitize(`${isFacebook ? 'fb' : 'ig'}_${Date.now()}.mp4`);
    const filepath = path.join(DOWNLOAD_FOLDER, filename);
    const tempPath = `${filepath}.download`;

    // Download options
    const options = {
      output: tempPath,
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      retries: 3,
      socketTimeout: 30000,
      addHeader: [
        'referer:https://www.facebook.com/',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      ],
      quiet: true
    };

    console.log(`[${requestId}] Starting download: ${url}`);
    await ytdlp(url, options);

    // Verify download
    if (!fs.existsSync(tempPath)) {
      throw new Error('Downloaded file not found');
    }

    // Rename temp file
    fs.renameSync(tempPath, filepath);

    // Update stats
    updateStats();

    console.log(`[${requestId}] Download completed in ${(Date.now() - startTime)/1000}s`);

    res.json({
      success: true,
      downloadUrl: `/downloads/${filename}`,
      filename,
      message: 'Download successful'
    });

  } catch (error) {
    console.error(`[${requestId}] Download failed:`, error.message);
    
    // Clean up temp file
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    res.status(500).json({
      success: false,
      message: 'Download failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    stats: {
      totalDownloads: stats.totalDownloads,
      todayDownloads: stats.todayDownloads,
      totalVisitors: stats.totalDownloads * 3, // Simulated ratio
      activeUsers: Math.floor(stats.todayDownloads / 2) + 5
    }
  });
});

// Serve index.html
app.get('*', (req, res) => {
  res.sendFile(INDEX_HTML);
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false,
    message: 'Internal server error' 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Configuration:', {
    downloadFolder: DOWNLOAD_FOLDER,
    fileLifetime: `${FILE_LIFETIME/1000/60} minutes`,
    rateLimiting: '50 requests/15 minutes'
  });
});
