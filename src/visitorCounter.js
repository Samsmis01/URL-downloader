const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

module.exports = function(req, res, next) {
    const statsDir = path.join(__dirname, 'stats_data');
    const statsFile = path.join(statsDir, 'visitorStats.json');
    const visitorLogFile = path.join(statsDir, 'visitorLogs.ndjson');
    const sessionId = req.sessionID || uuidv4();
    const visitTime = new Date();

    // Créer le dossier stats_data s'il n'existe pas
    if (!fs.existsSync(statsDir)) {
        fs.mkdirSync(statsDir, { recursive: true });
    }

    // Structure de base des statistiques
    const defaultStats = {
        totalVisitors: 0,
        todayVisitors: 0,
        date: visitTime.toDateString(),
        lastReset: visitTime.getTime(),
        byCountry: {},
        byDevice: {},
        byBrowser: {}
    };

    // Initialiser/Lire les stats
    let stats;
    try {
        stats = fs.existsSync(statsFile) ? 
            JSON.parse(fs.readFileSync(statsFile, 'utf-8')) : 
            { ...defaultStats };
    } catch (err) {
        console.error('Erreur lecture stats:', err);
        stats = { ...defaultStats };
    }

    // Réinitialisation quotidienne
    if (stats.date !== visitTime.toDateString()) {
        stats.date = visitTime.toDateString();
        stats.todayVisitors = 0;
        stats.lastReset = visitTime.getTime();
    }

    // Détection du device et browser (basique)
    const userAgent = req.headers['user-agent'] || '';
    const isMobile = /Mobile|Android|iPhone/i.test(userAgent);
    const browser = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)[\/\s][\d.]+/i)?.[1] || 'Unknown';

    // Mise à jour des stats
    stats.totalVisitors++;
    stats.todayVisitors++;
    
    // Stats par pays (utilisez un middleware geoip en production)
    const country = req.headers['cf-ipcountry'] || 'Unknown';
    stats.byCountry[country] = (stats.byCountry[country] || 0) + 1;
    
    // Stats par device
    const deviceType = isMobile ? 'Mobile' : 'Desktop';
    stats.byDevice[deviceType] = (stats.byDevice[deviceType] || 0) + 1;
    
    // Stats par navigateur
    stats.byBrowser[browser] = (stats.byBrowser[browser] || 0) + 1;

    // Sauvegarde sécurisée
    try {
        fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
        
        // Log détaillé au format NDJSON
        const logEntry = {
            timestamp: visitTime.toISOString(),
            sessionId,
            ip: req.ip,
            country,
            device: deviceType,
            browser,
            url: req.originalUrl,
            userAgent
        };
        fs.appendFileSync(visitorLogFile, JSON.stringify(logEntry) + '\n');
    } catch (err) {
        console.error('Erreur sauvegarde stats:', err);
    }

    // Injection dans res.locals pour votre HTML
    res.locals.visitorStats = {
        total: stats.totalVisitors,
        today: stats.todayVisitors,
        active: Math.floor(stats.todayVisitors / 10) + 10 // Algorithme plus réaliste
    };

    // Pour les API
    if (req.path.startsWith('/api')) {
        req.visitorStats = res.locals.visitorStats;
    }

    next();
};
