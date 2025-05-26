const ytdlp = require('../utils/yt-dlp-wrapper');

exports.downloadVideo = async (req, res) => {
  try {
    const { url } = req.body;
    const result = ytdlp.download(url, {
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
    });

    if (!result.success) throw new Error(result.error);
    
    res.json({ 
      success: true,
      url: `/downloads/${path.basename(result.filepath)}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
