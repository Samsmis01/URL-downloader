const express = require('express');
const path = require('path');
const fs = require('fs');
const ytdl = require('yt-dlp-exec');
const sanitize = require('sanitize-filename');
const app = express();
const rateLimit = require('express-rate-limit');
const visitorCounter = require('./visitorCounter');

// Configuration
const PORT = process.env.PORT || 3000;
const DOWNLOAD_FOLDER = path.join(__dirname, 'public', 'downloads');
const FILE_LIFETIME = 58000; // 58 secondes en ms

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(visitorCounter);

// Limiter les requêtes pour éviter les abus
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limite chaque IP à 100 requêtes par fenêtre
});
app.use('/download', limiter);

// Créer le dossier de téléchargement s'il n'existe pas
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
    fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

// Nettoyer les fichiers anciens
setInterval(() => {
    fs.readdir(DOWNLOAD_FOLDER, (err, files) => {
        if (err) return console.error('Erreur de lecture du dossier:', err);
        
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(DOWNLOAD_FOLDER, file);
            fs.stat(filePath, (err, stat) => {
                if (err) return console.error('Erreur de stat:', err);
                
                if (now - stat.birthtimeMs > FILE_LIFETIME) {
                    fs.unlink(filePath, err => {
                        if (err) console.error('Erreur de suppression:', err);
                        else console.log('Fichier supprimé:', file);
                    });
                }
            });
        });
    });
}, 60000); // Vérifier toutes les minutes

// Route de téléchargements
app.post('/download', async (req, res) => {
    try {
        const { url } = req.body;
        
        // Validation de l'URL
        if (!url.match(/(facebook\.com|instagram\.com)/i)) {
            return res.status(400).json({ error: 'URL Facebook ou Instagram invalide' });
        }

        const filename = `video_${Date.now()}.mp4`;
        const filepath = path.join(DOWNLOAD_FOLDER, filename);

        // Options pour yt-dlp
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

        // Téléchargement réel
        await ytdl(url, options);

        res.json({
            success: true,
            downloadUrl: `/downloads/${filename}`,
            filename: filename
        });

    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ 
            error: 'Échec du téléchargement',
            details: error.message
        });
    }
})
