const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { EXECUTION_STATUS } = require('../src/utils/constants');
const logger = require('../src/utils/logger');

class JavaScriptExecutor {
    constructor() {
        this.language = 'javascript';
        this.timeout = 30000; // 30 seconds
        this.memoryLimit = 128 * 1024 * 1024; // 128MB
    }

    async execute(code, input = '', executionId) {
        const startTime = Date.now();
        let tempDir = null;

        try {
            // Create temporary directory
            tempDir = path.join(process.cwd(), 'temp', executionId);
            await fs.mkdir(tempDir, { recursive: true });

            // Write code to file
            const codeFile = path.join(tempDir, 'main.js');
            await fs.writeFile(codeFile, code, 'utf8');

            // Write input to file if provided
            let inputFile = null;
            if (input) {
                inputFile = path.join(tempDir, 'input.txt');
                await fs.writeFile(inputFile, input, 'utf8');
            }

            // Execute JavaScript code
            const result = await this.runNode(codeFile, inputFile, tempDir);

            const executionTime = Date.now() - startTime;

            return {
                status: result.exitCode === 0 ? EXECUTION_STATUS.SUCCESS : EXECUTION_STATUS.RUNTIME_ERROR,
                output: result.stdout,
                error: result.stderr,
                executionTime,
                exitCode: result.exitCode,
                memoryUsage: result.memoryUsage
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            logger.error('JavaScript execution failed', {
                executionId,
                error: error.message,
                executionTime
            });

            return {
                status: this.getErrorStatus(error),
                output: '',
                error: error.message,
                executionTime,
                exitCode: -1,
                memoryUsage: { used: 0, limit: this.memoryLimit }
            };
        } finally {
            // Cleanup temporary files
            if (tempDir) {
                await this.cleanup(tempDir);
            }
        }
    }

    async runNode(codeFile, inputFile, workingDir) {
        return new Promise((resolve, reject) => {
            const args = [
                '--max-old-space-size=128', // Limit memory to 128MB
                '--no-warnings',
                codeFile
            ];

            const options = {
                cwd: workingDir,
                timeout: this.timeout,
                maxBuffer: 1024 * 1024, // 1MB buffer
                env: {
                    ...process.env,
                    NODE_PATH: workingDir,
                    NODE_ENV: 'sandbox'
                }
            };

            const child = spawn('node', args, options);

            let stdout = '';
            let stderr = '';
            let memoryUsage = { used: 0, limit: this.memoryLimit };

            // Handle stdout
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            // Handle stderr
            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            // Send input if provided
            if (inputFile) {
                fs.readFile(inputFile, 'utf8').then(input => {
                    child.stdin.write(input);
                    child.stdin.end();
                }).catch(() => {
                    child.stdin.end();
                });
            } else {
                child.stdin.end();
            }

            // Handle process completion
            child.on('close', (exitCode) => {
                resolve({
                    stdout: this.sanitizeOutput(stdout),
                    stderr: this.sanitizeOutput(stderr),
                    exitCode,
                    memoryUsage
                });
            });

            // Handle errors
            child.on('error', (error) => {
                if (error.code === 'ETIMEDOUT') {
                    reject(new Error('Execution timeout'));
                } else {
                    reject(error);
                }
            });

            // Monitor memory usage
            const memoryMonitor = setInterval(() => {
                try {
                    const usage = process.memoryUsage();
                    memoryUsage.used = usage.heapUsed;

                    if (usage.heapUsed > this.memoryLimit) {
                        clearInterval(memoryMonitor);
                        child.kill('SIGKILL');
                        reject(new Error('Memory limit exceeded'));
                    }
                } catch (error) {
                    // Ignore monitoring errors
                }
            }, 100);

            child.on('close', () => {
                clearInterval(memoryMonitor);
            });
        });
    }

    sanitizeOutput(output) {
        if (!output) return '';

        // Remove file paths
        output = output.replace(/\/tmp\/[^\s]+/g, '[temp_file]');
        output = output.replace(/at .*? \(.*?\)/g, 'at [script]');

        // Limit output length
        const maxLength = 10000;
        if (output.length > maxLength) {
            output = output.substring(0, maxLength) + '\n... (output truncated)';
        }

        return output;
    }

    getErrorStatus(error) {
        const message = error.message.toLowerCase();

        if (message.includes('timeout')) {
            return EXECUTION_STATUS.TIMEOUT;
        }
        if (message.includes('memory')) {
            return EXECUTION_STATUS.MEMORY_LIMIT_EXCEEDED;
        }

        return EXECUTION_STATUS.ERROR;
    }

    async cleanup(tempDir) {
        try {
            await fs.rmdir(tempDir, { recursive: true });
        } catch (error) {
            logger.warn('Failed to cleanup JavaScript temp directory', {
                tempDir,
                error: error.message
            });
        }
    }

    // Validate JavaScript code for security
    validateCode(code) {
        const forbiddenPatterns = [
            /require\s*\(\s*['"]fs['"]\s*\)/gi,
            /require\s*\(\s*['"]child_process['"]\s*\)/gi,
            /require\s*\(\s*['"]net['"]\s*\)/gi,
            /require\s*\(\s*['"]http['"]\s*\)/gi,
            /require\s*\(\s*['"]https['"]\s*\)/gi,
            /require\s*\(\s*['"]crypto['"]\s*\)/gi,
            /require\s*\(\s*['"]os['"]\s*\)/gi,
            /require\s*\(\s*['"]path['"]\s*\)/gi,
            /require\s*\(\s*['"]stream['"]\s*\)/gi,
            /require\s*\(\s*['"]util['"]\s*\)/gi,
            /require\s*\(\s*['"]vm['"]\s*\)/gi,
            /process\./gi,
            /global\./gi,
            /__dirname/gi,
            /__filename/gi,
            /eval\s*\(/gi,
            /Function\s*\(/gi,
            /setTimeout\s*\(/gi,
            /setInterval\s*\(/gi
        ];

        const errors = [];

        for (const pattern of forbiddenPatterns) {
            if (pattern.test(code)) {
                errors.push(`Forbidden pattern detected: ${pattern.source}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

module.exports = new JavaScriptExecutor();