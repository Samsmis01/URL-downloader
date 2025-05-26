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
        stats = JSON.parse(fs.readFileSync(statsFile));
        
        // Réinitialiser le compteur quotidien si c'est un nouveau jour
        if (stats.date !== new Date().toDateString()) {
            stats.date = new Date().toDateString();
            stats.todayVisitors = 0;
            stats.lastReset = Date.now();
        }
    }
    
    // Mettre à jour les stats
    stats.totalVisitors++;
    stats.todayVisitors++;
    
    // Sauvegarder
    fs.writeFileSync(statsFile, JSON.stringify(stats));
    
    // Ajouter aux données de session
    req.session.totalVisitors = stats.totalVisitors;
    req.session.todayVisitors = stats.todayVisitors;
    req.session.activeUsers = Math.floor(Math.random() * 50) + 20; // Simuler des utilisateurs actifs
    
    next();
