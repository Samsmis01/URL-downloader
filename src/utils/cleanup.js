const fs = require('fs');
const path = require('path');

const cleanup = {
  folder: path.join(__dirname, '../../public/downloads'),
  interval: 58000, // 58 secondes

  start: () => {
    setInterval(() => {
      fs.readdir(this.folder, (err, files) => {
        files.forEach(file => {
          fs.unlink(path.join(this.folder, file), () => {});
        });
      });
    }, this.interval);
  }
};

module.exports = cleanup
