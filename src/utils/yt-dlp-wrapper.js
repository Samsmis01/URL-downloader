const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path');
const fs = require('fs');

module.exports = {
  /**
   * Télécharge une vidéo avec yt-dlp
   * @param {string} url - URL de la vidéo
   * @param {object} options - Options de téléchargement
   * @returns {Promise<object>} Résultat du téléchargement
   */
  async download(url, options) {
    // Validation des entrées
    if (!url || typeof url !== 'string') {
      throw new Error('URL invalide');
    }

    const args = ['--no-simulate', '--newline'];
    
    // Construction sécurisée des arguments
    for (const [key, value] of Object.entries(options)) {
      if (value === undefined || value === null) continue;

      switch (key) {
        case 'addHeader':
          if (Array.isArray(value)) {
            value.forEach(header => {
              if (typeof header === 'string') {
                args.push('--add-header', header);
              }
            });
          }
          break;

        case 'output':
          args.push('-o', path.resolve(value));
          break;

        default:
          if (typeof value === 'boolean' && value) {
            args.push(`--${key}`);
          } else if (typeof value !== 'object') {
            args.push(`--${key}`, String(value));
          }
      }
    }

    args.push('--', url); // Séparateur pour éviter l'injection de commande

    try {
      console.log(`Exécution yt-dlp avec args: ${args.join(' ')}`);
      const { stdout, stderr } = await execPromise('yt-dlp ' + args.map(arg => 
        `"${arg.replace(/"/g, '\\"')}"`).join(' '), {
        timeout: options.timeout || 300000,
        maxBuffer: 1024 * 1024 * 10 // 10MB
      });

      // Vérification du fichier de sortie
      const outputPath = options.output ? path.resolve(options.output.replace('.tmp', '')) : null;
      if (outputPath && !fs.existsSync(outputPath)) {
        throw new Error('Fichier de sortie introuvable');
      }

      return {
        success: true,
        filepath: outputPath,
        metadata: this.parseOutput(stdout),
        logs: stderr
      };

    } catch (error) {
      console.error('Erreur yt-dlp:', {
        url,
        error: error.message,
        stderr: error.stderr,
        stdout: error.stdout
      });

      // Nettoyage des fichiers temporaires
      if (options.output && fs.existsSync(options.output)) {
        fs.unlinkSync(options.output);
      }

      return {
        success: false,
        error: this.parseError(error),
        tempPath: options.output
      };
    }
  },

  /**
   * Analyse la sortie de yt-dlp
   */
  parseOutput(output) {
    try {
      const metadata = {};
      const lines = output.split('\n');

      // Extraction des métadonnées
      lines.forEach(line => {
        if (line.includes('Duration:')) {
          const match = line.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/);
          if (match) metadata.duration = match[1];
        }
        if (line.includes('resolution')) {
          const match = line.match(/(\d{3,4}x\d{3,4})/);
          if (match) metadata.resolution = match[0];
        }
      });

      return metadata;
    } catch (err) {
      console.error('Erreur analyse output:', err);
      return {};
    }
  },

  /**
   * Traite les erreurs yt-dlp
   */
  parseError(error) {
    if (!error.stderr) return error.message;

    // Erreurs connues
    if (error.stderr.includes('Unsupported URL')) {
      return 'URL non supportée';
    }
    if (error.stderr.includes('Private video')) {
      return 'Vidéo privée';
    }
    if (error.stderr.includes('Geo restricted')) {
      return 'Contenu géo-restreint';
    }

    return error.stderr.split('\n').find(line => 
      line.startsWith('ERROR:')
    ) || error.message;
  }
};
