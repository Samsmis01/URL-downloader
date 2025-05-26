const ytdl = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');

exports.downloadVideo = async (req, res) => {
  try {
    const { url } = req.body;
    const filename = `video_${Date.now()}.mp4`;
    const filepath = path.join(__dirname, '../../public/downloads', filename);

    await ytdl(url, {
      output: filepath,
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
    });

    res.json({ 
      success: true,
      url: `/downloads/${filename}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
