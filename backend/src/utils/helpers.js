const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { SUPPORTED_LANGUAGES, LANGUAGE_EXTENSIONS, LANGUAGE_MAIN_FILES } = require('./constants');

class Helpers {
    // Generate unique execution ID
    static generateExecutionId() {
        const timestamp = Date.now();
        const random = crypto.randomBytes(8).toString('hex');
        return `exec_${timestamp}_${random}`;
    }

    // Generate unique session ID
    static generateSessionId() {
        return crypto.randomBytes(32).toString('hex');
    }

    // Validate programming language
    static validateLanguage(language) {
        return Object.values(SUPPORTED_LANGUAGES).includes(language);
    }

    // Get file extension for language
    static getFileExtension(language) {
        return LANGUAGE_EXTENSIONS[language] || '.txt';
    }

    // Get main file name for language
    static getMainFileName(language) {
        return LANGUAGE_MAIN_FILES[language] || 'main.txt';
    }

    // Generate file name for code execution
    static generateFileName(language, executionId) {
        const extension = this.getFileExtension(language);
        return language === SUPPORTED_LANGUAGES.JAVA ? 'Main.java' : `main${extension}`;
    }

    // Create temporary directory for code execution
    static async createTempDirectory(executionId) {
        const tempDir = path.join(os.tmpdir(), `code_exec_${executionId}`);
        await fs.mkdir(tempDir, { recursive: true });
        return tempDir;
    }

    // Write code to file
    static async writeCodeToFile(code, filePath) {
        await fs.writeFile(filePath, code, 'utf8');
    }

    // Write input to file
    static async writeInputToFile(input, filePath) {
        await fs.writeFile(filePath, input, 'utf8');
    }

    // Read file content
    static async readFileContent(filePath) {
        try {
            return await fs.readFile(filePath, 'utf8');
        } catch (error) {
            return '';
        }
    }

    // Cleanup temporary directory
    static async cleanupTempDirectory(tempDir) {
        try {
            await fs.rmdir(tempDir, { recursive: true });
        } catch (error) {
            console.warn(`Failed to cleanup temp directory: ${tempDir}`, error.message);
        }
    }

    // Sanitize output (remove sensitive information)
    static sanitizeOutput(output) {
        if (!output) return '';

        // Remove file paths that might contain sensitive information
        output = output.replace(/\/tmp\/[^\s]+/g, '[temp_file]');
        output = output.replace(/\/home\/[^\s]+/g, '[user_file]');
        output = output.replace(/\/var\/[^\s]+/g, '[system_file]');

        // Limit output length
        const MAX_OUTPUT_LENGTH = 10000;
        if (output.length > MAX_OUTPUT_LENGTH) {
            output = output.substring(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)';
        }

        return output;
    }

    // Get memory usage information
    static getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            rss: Math.round(usage.rss / 1024 / 1024), // MB
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
            external: Math.round(usage.external / 1024 / 1024) // MB
        };
    }

    // Format execution time
    static formatExecutionTime(milliseconds) {
        if (milliseconds < 1000) {
            return `${milliseconds}ms`;
        }
        return `${(milliseconds / 1000).toFixed(2)}s`;
    }

    // Generate hash for code (for caching)
    static generateCodeHash(code, input = '') {
        const content = code + input;
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    // Validate email format
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Validate username format
    static isValidUsername(username) {
        const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
        return usernameRegex.test(username);
    }

    // Generate random string
    static generateRandomString(length = 16) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Parse memory limit string to bytes
    static parseMemoryLimit(memoryLimit) {
        if (typeof memoryLimit === 'number') return memoryLimit;

        const match = memoryLimit.match(/^(\d+)([kmg]?)b?$/i);
        if (!match) return 128 * 1024 * 1024; // Default 128MB

        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        switch (unit) {
            case 'k': return value * 1024;
            case 'm': return value * 1024 * 1024;
            case 'g': return value * 1024 * 1024 * 1024;
            default: return value;
        }
    }

    // Format bytes to human readable
    static formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Escape shell arguments
    static escapeShellArg(arg) {
        return `'${arg.replace(/'/g, "'\"'\"'")}'`;
    }

    // Check if file exists
    static async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    // Get file stats
    static async getFileStats(filePath) {
        try {
            return await fs.stat(filePath);
        } catch {
            return null;
        }
    }

    // Sleep function
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Retry function with exponential backoff
    static async retry(fn, maxRetries = 3, baseDelay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                if (i === maxRetries - 1) throw error;

                const delay = baseDelay * Math.pow(2, i);
                await this.sleep(delay);
            }
        }
    }

    // Deep clone object
    static deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    // Check if object is empty
    static isEmpty(obj) {
        return Object.keys(obj).length === 0;
    }

    // Get client IP address
    static getClientIP(req) {
        return req.ip ||
               req.connection.remoteAddress ||
               req.socket.remoteAddress ||
               (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
               '127.0.0.1';
    }

    // Parse user agent
    static parseUserAgent(userAgent) {
        if (!userAgent) return { browser: 'Unknown', os: 'Unknown' };

        const browser = userAgent.includes('Chrome') ? 'Chrome' :
                        userAgent.includes('Firefox') ? 'Firefox' :
                        userAgent.includes('Safari') ? 'Safari' :
                        userAgent.includes('Edge') ? 'Edge' : 'Unknown';

        const os = userAgent.includes('Windows') ? 'Windows' :
                   userAgent.includes('Mac') ? 'macOS' :
                   userAgent.includes('Linux') ? 'Linux' :
                   userAgent.includes('Android') ? 'Android' :
                   userAgent.includes('iOS') ? 'iOS' : 'Unknown';

        return { browser, os };
    }

    // Validate JSON
    static isValidJSON(str) {
        try {
            JSON.parse(str);
            return true;
        } catch {
            return false;
        }
    }

    // Truncate string
    static truncateString(str, maxLength = 100) {
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...';
    }

    // Remove null/undefined values from object
    static removeNullValues(obj) {
        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== null && value !== undefined) {
                cleaned[key] = value;
            }
        }
        return cleaned;
    }
}

module.exports = Helpers;