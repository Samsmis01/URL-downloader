const { execSync } = require('child_process');
const path = require('path');

module.exports = {
  download: (url, options) => {
    const output = options.output || path.join(__dirname, '../../public/downloads', `video_${Date.now()}.mp4`);
    const format = options.format || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
    
    try {
      execSync(`yt-dlp -f '${format}' -o '${output}' '${url}'`);
      return { success: true, filepath: output };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
