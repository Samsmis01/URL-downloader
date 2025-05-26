const express = require('express');
const path = require('path');
const visitorCounter = require('./middlewares/visitorCounter');
const downloadRoutes = require('./routes/download.routes');

const app = express();

// Middlewares
app.use(express.json());
app.use(visitorCounter);

// Routes
app.use('/api/download', downloadRoutes);

// Serveur statique
app.use(express.static(path.join(__dirname, '../public')));

module.exports = app
