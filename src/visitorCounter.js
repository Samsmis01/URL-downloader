const fs = require('fs');
const path = require('path');

module.exports = function(req, res, next) {
    const statsFile = path.join(__dirname, 'visitorStats.json');

    // Lire ou initialiser les stats
    let stats = {
        totalVisitors: 0,
        todayVisitors: 0,
        date: new Date().toDateString(),
        lastReset: Date.now()
    };

    if (fs.existsSync(statsFile)) {
        try {
            stats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));

            // Réinitialiser le compteur quotidien si c'est un nouveau jour
            if (stats.date !== new Date().toDateString()) {
                stats.date = new Date().toDateString();
                stats.todayVisitors = 0;
                stats.lastReset = Date.now();
            }
        } catch (err) {
            console.error('Erreur lecture visitorStats.json:', err);
            // En cas d'erreur, réinitialiser stats à l'objet par défaut
            stats = {
                totalVisitors: 0,
                todayVisitors: 0,
                date: new Date().toDateString(),
                lastReset: Date.now()
            };
        }
    }

    // Mettre à jour les stats
    stats.totalVisitors++;
    stats.todayVisitors++;

    // Sauvegarder
    try {
        fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
    } catch (err) {
        console.error('Erreur écriture visitorStats.json:', err);
    }

    // Ajouter aux données de session (si session activée)
    if (req.session) {
        req.session.totalVisitors = stats.totalVisitors;
        req.session.todayVisitors = stats.todayVisitors;
        req.session.activeUsers = Math.floor(Math.random() * 50) + 20; // Simuler des utilisateurs actifs
    }

    // Log visiteur
    console.log(`Visiteur: IP=${req.ip}, URL=${req.originalUrl}, Temps=${new Date().toISOString()}`);

    next();
};
