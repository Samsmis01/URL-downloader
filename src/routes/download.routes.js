const express = require('express');
const router = express.Router();
const downloadController = require('../controllers/download.controller');

router.post('/', downloadController.downloadVideo);

module.exports = router
