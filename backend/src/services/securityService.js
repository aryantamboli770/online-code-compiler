// src/services/securityService.js
const { SECURITY_CONFIG, MAX_CODE_LENGTH, MAX_INPUT_LENGTH } = require('../utils/constants');
const logger = require('../utils/logger');

class SecurityService {
    static validateCode(code, language) {
        const errors = [];

        // Check code length
        if (!code || code.trim().length === 0) {
            errors.push('Code cannot be empty');
            return { isValid: false, errors };
        }

        if (code.length > MAX_CODE_LENGTH) {
            errors.push(`Code exceeds maximum length of ${MAX_CODE_LENGTH} characters`);
        }

        // Check for forbidden patterns
        const forbiddenPatterns = SECURITY_CONFIG.FORBIDDEN_PATTERNS;
        for (const pattern of forbiddenPatterns) {
            if (pattern.test(code)) {
                errors.push(`Code contains forbidden pattern: ${pattern.source}`);
                logger.warn('Forbidden pattern detected', {
                    pattern: pattern.source,
                    language,
                    codeSnippet: code.substring(0, 100)
                });
            }
        }

        // Language-specific validation
        switch (language) {
            case 'python':
                this.validatePythonCode(code, errors);
                break;
            case 'javascript':
                this.validateJavaScriptCode(code, errors);
                break;
            case 'cpp':
                this.validateCppCode(code, errors);
                break;
            case 'java':
                this.validateJavaCode(code, errors);
                break;
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    static validatePythonCode(code, errors) {
        // Check for dangerous imports
        const dangerousImports = [
            'os', 'sys', 'subprocess', 'socket', 'urllib', 'requests',
            'shutil', 'glob', 'tempfile', 'pickle', 'marshal'
        ];

        for (const imp of dangerousImports) {
            const importPattern = new RegExp(`import\\s+${imp}|from\\s+${imp}\\s+import`, 'gi');
            if (importPattern.test(code)) {
                errors.push(`Dangerous import detected: ${imp}`);
            }
        }

        // Check for dangerous functions
        const dangerousFunctions = ['exec', 'eval', '__import__', 'compile', 'open', 'file'];
        for (const func of dangerousFunctions) {
            const funcPattern = new RegExp(`\\b${func}\\s*\\(`, 'gi');
            if (funcPattern.test(code)) {
                errors.push(`Dangerous function detected: ${func}`);
            }
        }
    }

    static validateJavaScriptCode(code, errors) {
        // Check for dangerous Node.js modules
        const dangerousModules = [
            'fs', 'child_process', 'net', 'http', 'https', 'crypto',
            'os', 'path', 'stream', 'util', 'vm'
        ];

        for (const module of dangerousModules) {
            const requirePattern = new RegExp(`require\\s*\\(\\s*['"]${module}['"]\\s*\\)`, 'gi');
            if (requirePattern.test(code)) {
                errors.push(`Dangerous module detected: ${module}`);
            }
        }

        // Check for dangerous global objects
        const dangerousGlobals = ['process', 'global', '__dirname', '__filename'];
        for (const global of dangerousGlobals) {
            const globalPattern = new RegExp(`\\b${global}\\b`, 'gi');
            if (globalPattern.test(code)) {
                errors.push(`Dangerous global object detected: ${global}`);
            }
        }
    }

    static validateCppCode(code, errors) {
        // Check for dangerous includes
        const dangerousIncludes = [
            'cstdlib', 'stdlib.h', 'unistd.h', 'sys/', 'windows.h',
            'process.h', 'signal.h', 'fcntl.h'
        ];

        for (const include of dangerousIncludes) {
            const includePattern = new RegExp(`#include\\s*<${include}`, 'gi');
            if (includePattern.test(code)) {
                errors.push(`Dangerous include detected: ${include}`);
            }
        }

        // Check for dangerous functions
        const dangerousFunctions = ['system', 'exec', 'fork', 'kill', 'exit'];
        for (const func of dangerousFunctions) {
            const funcPattern = new RegExp(`\\b${func}\\s*\\(`, 'gi');
            if (funcPattern.test(code)) {
                errors.push(`Dangerous function detected: ${func}`);
            }
        }
    }

    static validateJavaCode(code, errors) {
        // Check for dangerous imports
        const dangerousImports = [
            'java.io.File', 'java.net', 'java.lang.Runtime',
            'java.lang.ProcessBuilder', 'java.nio.file',
            'java.security', 'javax.script'
        ];

        for (const imp of dangerousImports) {
            const importPattern = new RegExp(`import\\s+${imp.replace(/\./g, '\\.')}`, 'gi');
            if (importPattern.test(code)) {
                errors.push(`Dangerous import detected: ${imp}`);
            }
        }

        // Check for dangerous method calls
        const dangerousMethods = [
            'Runtime.getRuntime().exec',
            'ProcessBuilder',
            'System.exit',
            'File.',
            'Files.'
        ];

        for (const method of dangerousMethods) {
            const methodPattern = new RegExp(method.replace(/\./g, '\\.'), 'gi');
            if (methodPattern.test(code)) {
                errors.push(`Dangerous method detected: ${method}`);
            }
        }
    }

    static validateInput(input) {
        const errors = [];

        if (input && input.length > MAX_INPUT_LENGTH) {
            errors.push(`Input exceeds maximum length of ${MAX_INPUT_LENGTH} characters`);
        }

        // Check for potentially malicious input
        const maliciousPatterns = [
            /\x00/g, // Null bytes
            /\.\.\//g, // Directory traversal
            /[<>]/g, // HTML/XML tags
            /javascript:/gi, // JavaScript protocol
            /data:/gi, // Data protocol
        ];

        for (const pattern of maliciousPatterns) {
            if (pattern.test(input)) {
                errors.push('Input contains potentially malicious content');
                break;
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    static sanitizeCode(code) {
        if (!code) return '';

        // Remove null bytes
        code = code.replace(/\x00/g, '');

        // Normalize line endings
        code = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Remove excessive whitespace but preserve code structure
        code = code.replace(/\n{3,}/g, '\n\n');

        // Trim but preserve leading whitespace for indentation
        const lines = code.split('\n');
        const sanitizedLines = lines.map(line => line.trimEnd());
        code = sanitizedLines.join('\n').trim();

        return code;
    }

    static sanitizeInput(input) {
        if (!input) return '';

        // Remove null bytes
        input = input.replace(/\x00/g, '');

        // Normalize line endings
        input = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Remove excessive whitespace
        input = input.replace(/\n{3,}/g, '\n\n');

        return input.trim();
    }

    static generateSecurityReport(code, language, ipAddress) {
        const validation = this.validateCode(code, language);
        const timestamp = new Date().toISOString();

        const report = {
            timestamp,
            language,
            ipAddress,
            codeLength: code.length,
            isSecure: validation.isValid,
            violations: validation.errors,
            riskLevel: this.calculateRiskLevel(validation.errors),
            codeHash: this.generateCodeHash(code)
        };

        if (!validation.isValid) {
            logger.warn('Security violation detected', report);
        }

        return report;
    }

    static calculateRiskLevel(errors) {
        if (errors.length === 0) return 'low';
        if (errors.length <= 2) return 'medium';
        return 'high';
    }

    static generateCodeHash(code) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(code).digest('hex').substring(0, 16);
    }

    static isCodeSafe(code, language) {
        const validation = this.validateCode(code, language);
        return validation.isValid;
    }

    static getSecurityMetrics() {
        // This would typically pull from a database or cache
        // For now, return mock metrics
        return {
            totalValidations: 0,
            violationsDetected: 0,
            riskDistribution: {
                low: 0,
                medium: 0,
                high: 0
            },
            commonViolations: []
        };
    }

    static checkRateLimit(ipAddress, windowMs = 900000, maxRequests = 100) {
        // This would typically use Redis or a similar cache
        // For now, return a simple implementation
        return {
            allowed: true,
            remaining: maxRequests,
            resetTime: Date.now() + windowMs
        };
    }
}

module.exports = SecurityService;