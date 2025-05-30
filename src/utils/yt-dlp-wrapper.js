const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path');
const fs = require('fs');
const sanitize = require('sanitize-filename');

module.exports = {
  /**
   * Télécharge une vidéo avec yt-dlp
   * @param {string} url - URL de la vidéo
   * @param {object} options - Options de téléchargement
   * @returns {Promise<object>} Résultat du téléchargement
   */
  async download(url, options = {}) {
    // Validation renforcée des entrées
    if (!url || typeof url !== 'string' || !url.match(/^https?:\/\//i)) {
      throw new Error('URL invalide ou non sécurisée (HTTP/HTTPS requis)');
    }

    // Options par défaut sécurisées
    const defaultOptions = {
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      noCheckCertificates: true,
      noWarnings: true,
      retries: 3,
      socketTimeout: 30000,
      quiet: true,
      addHeader: [
        `referer:${new URL(url).origin}`,
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      ]
    };

    const mergedOptions = { ...defaultOptions, ...options };
    const args = ['--no-simulate', '--newline', '--no-cache-dir'];
    
    // Construction sécurisée des arguments avec validation
    for (const [key, value] of Object.entries(mergedOptions)) {
      if (value === undefined || value === null) continue;

      switch (key) {
        case 'addHeader':
          if (Array.isArray(value)) {
            value.forEach(header => {
              if (typeof header === 'string' && header.includes(':')) {
                args.push('--add-header', sanitize(header));
              }
            });
          }
          break;

        case 'output':
          const safePath = path.resolve(
            path.join(
              path.dirname(value),
              sanitize(path.basename(value))
          );
          args.push('-o', safePath);
          mergedOptions.output = safePath; // Mise à jour avec le chemin sécurisé
          break;

        case 'cookies':
          if (typeof value === 'string' && fs.existsSync(value)) {
            args.push('--cookies', value);
          }
          break;

        default:
          if (typeof value === 'boolean' && value) {
            args.push(`--${key}`);
          } else if (typeof value !== 'object') {
            args.push(`--${key}`, String(value));
          }
      }
    }

    args.push('--', `"${url.replace(/"/g, '\\"')}"`); // Séparateur sécurisé

    try {
      console.log(`[yt-dlp] Début du téléchargement: ${url}`);
      const command = `yt-dlp ${args.join(' ')}`;
      const { stdout, stderr } = await execPromise(command, {
        timeout: mergedOptions.timeout || 300000,
        maxBuffer: 1024 * 1024 * 50 // 50MB
      });

      // Vérification renforcée du fichier de sortie
      let outputPath = null;
      if (mergedOptions.output) {
        outputPath = path.resolve(mergedOptions.output);
        if (!fs.existsSync(outputPath)) {
          throw new Error('Fichier de sortie introuvable après téléchargement');
        }

        // Vérification de la taille du fichier (au moins 1KB)
        const stats = fs.statSync(outputPath);
        if (stats.size < 1024) {
          fs.unlinkSync(outputPath);
          throw new Error('Fichier corrompu (taille trop petite)');
        }
      }

      return {
        success: true,
        filepath: outputPath,
        metadata: this.parseOutput(stdout),
        logs: stderr,
        platform: this.detectPlatform(url)
      };

    } catch (error) {
      console.error('[yt-dlp] Erreur:', {
        url,
        error: error.message,
        command: error.cmd,
        stderr: error.stderr,
        stdout: error.stdout
      });

      // Nettoyage des fichiers temporaires
      if (mergedOptions.output && fs.existsSync(mergedOptions.output)) {
        fs.unlinkSync(mergedOptions.output);
      }

      throw this.parseError(error); // Propagation de l'erreur analysée
    }
  },

  /**
   * Détecte la plateforme source
   */
  detectPlatform(url) {
    const platforms = {
      youtube: /youtube\.com|youtu\.be/i,
      tiktok: /tiktok\.com/i,
      twitter: /twitter\.com|x\.com/i,
      facebook: /facebook\.com|fb\.watch|fb\.com/i,
      instagram: /instagram\.com|instagr\.am/i,
      soundcloud: /soundcloud\.com/i,
      vimeo: /vimeo\.com/i,
      dailymotion: /dailymotion\.com|dai\.ly/i
    };

    for (const [platform, regex] of Object.entries(platforms)) {
      if (regex.test(url)) return platform;
    }
    return 'unknown';
  },

  /**
   * Analyse la sortie de yt-dlp
   */
  parseOutput(output) {
    const metadata = {
      duration: null,
      resolution: null,
      title: null,
      thumbnail: null
    };

    try {
      const lines = output.split('\n');
      
      lines.forEach(line => {
        // Extraction des métadonnées avancées
        if (line.includes('Duration:')) {
          const match = line.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/);
          if (match) metadata.duration = match[1];
        }
        if (line.includes('resolution')) {
          const match = line.match(/(\d{3,4}x\d{3,4})/);
          if (match) metadata.resolution = match[0];
        }
        if (line.includes('title')) {
          const match = line.match(/title:\s*(.+)/i);
          if (match) metadata.title = match[1].trim();
        }
        if (line.includes('thumbnail')) {
          const match = line.match(/thumbnail:\s*(https?:\/\/\S+)/i);
          if (match) metadata.thumbnail = match[1];
        }
      });

      return metadata;
    } catch (err) {
      console.error('[yt-dlp] Erreur analyse output:', err);
      return metadata;
    }
  },

  /**
   * Traite les erreurs yt-dlp de manière exhaustive
   */
  parseError(error) {
    const errorInfo = {
      message: error.message,
      type: 'UNKNOWN_ERROR',
      recoverable: false
    };

    if (!error.stderr) return errorInfo;

    // Classification des erreurs
    const errorPatterns = [
      { 
        pattern: /Unsupported URL|No video found/, 
        type: 'UNSUPPORTED_URL',
        message: 'URL non supportée ou vidéo introuvable'
      },
      { 
        pattern: /Private video|Login required/, 
        type: 'PRIVATE_CONTENT',
        message: 'Contenu privé ou nécessite une connexion'
      },
      { 
        pattern: /Geo restricted|blocked in your country/, 
        type: 'GEO_RESTRICTED',
        message: 'Contenu géo-restreint'
      },
      { 
        pattern: /Video unavailable|removed/, 
        type: 'CONTENT_UNAVAILABLE',
        message: 'Vidéo supprimée ou indisponible'
      },
      { 
        pattern: /429 Too Many Requests|rate limit/, 
        type: 'RATE_LIMIT',
        message: 'Limite de requêtes dépassée',
        recoverable: true
      },
      { 
        pattern: /network timeout|timed out/, 
        type: 'NETWORK_ERROR',
        message: 'Erreur réseau ou timeout',
        recoverable: true
      }
    ];

    for (const { pattern, type, message, recoverable = false } of errorPatterns) {
      if (error.stderr.match(pattern)) {
        errorInfo.type = type;
        errorInfo.message = message;
        errorInfo.recoverable = recoverable;
        break;
      }
    }

    // Extraction du message d'erreur original si pertinent
    const errorLine = error.stderr.split('\n').find(line => line.startsWith('ERROR:'));
    if (errorLine) {
      errorInfo.details = errorLine.replace('ERROR:', '').trim();
    }

    return errorInfo;
  }
}
