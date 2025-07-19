const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { EXECUTION_STATUS } = require('../src/utils/constants');
const logger = require('../src/utils/logger');

class CppExecutor {
    constructor() {
        this.language = 'cpp';
        this.timeout = 45000; // 45 seconds (extra time for compilation)
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
            const codeFile = path.join(tempDir, 'main.cpp');
            await fs.writeFile(codeFile, code, 'utf8');

            // Write input to file if provided
            let inputFile = null;
            if (input) {
                inputFile = path.join(tempDir, 'input.txt');
                await fs.writeFile(inputFile, input, 'utf8');
            }

            // Compile and execute C++ code
            const compileResult = await this.compileCpp(codeFile, tempDir);

            if (compileResult.exitCode !== 0) {
                const executionTime = Date.now() - startTime;
                return {
                    status: EXECUTION_STATUS.COMPILATION_ERROR,
                    output: '',
                    error: compileResult.stderr,
                    executionTime,
                    exitCode: compileResult.exitCode,
                    memoryUsage: { used: 0, limit: this.memoryLimit }
                };
            }

            const result = await this.runExecutable(tempDir, inputFile);
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
            logger.error('C++ execution failed', {
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

    async compileCpp(codeFile, workingDir) {
        return new Promise((resolve, reject) => {
            const outputFile = path.join(workingDir, 'main');
            const args = [
                '-o', outputFile,
                codeFile,
                '-std=c++17',
                '-Wall',
                '-Wextra',
                '-O2'
            ];

            const options = {
                cwd: workingDir,
                timeout: 30000, // 30 seconds for compilation
                maxBuffer: 1024 * 1024 // 1MB buffer
            };

            const child = spawn('g++', args, options);

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (exitCode) => {
                resolve({
                    stdout: this.sanitizeOutput(stdout),
                    stderr: this.sanitizeOutput(stderr),
                    exitCode
                });
            });

            child.on('error', (error) => {
                if (error.code === 'ETIMEDOUT') {
                    reject(new Error('Compilation timeout'));
                } else {
                    reject(error);
                }
            });
        });
    }

    async runExecutable(workingDir, inputFile) {
        return new Promise((resolve, reject) => {
            const executablePath = path.join(workingDir, 'main');

            const options = {
                cwd: workingDir,
                timeout: 15000, // 15 seconds for execution
                maxBuffer: 1024 * 1024 // 1MB buffer
            };

            const child = spawn(executablePath, [], options);

            let stdout = '';
            let stderr = '';
            let memoryUsage = { used: 0, limit: this.memoryLimit };

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

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

            child.on('close', (exitCode) => {
                resolve({
                    stdout: this.sanitizeOutput(stdout),
                    stderr: this.sanitizeOutput(stderr),
                    exitCode,
                    memoryUsage
                });
            });

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
        output = output.replace(/main\.cpp:/g, '[script]:');

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
        if (message.includes('compilation')) {
            return EXECUTION_STATUS.COMPILATION_ERROR;
        }

        return EXECUTION_STATUS.ERROR;
    }

    async cleanup(tempDir) {
        try {
            await fs.rmdir(tempDir, { recursive: true });
        } catch (error) {
            logger.warn('Failed to cleanup C++ temp directory', {
                tempDir,
                error: error.message
            });
        }
    }

    // Validate C++ code for security
    validateCode(code) {
        const forbiddenPatterns = [
            /#include\s*<\s*cstdlib\s*>/gi,
            /#include\s*<\s*stdlib\.h\s*>/gi,
            /#include\s*<\s*unistd\.h\s*>/gi,
            /#include\s*<\s*sys\/.*?\s*>/gi,
            /#include\s*<\s*windows\.h\s*>/gi,
            /#include\s*<\s*process\.h\s*>/gi,
            /#include\s*<\s*signal\.h\s*>/gi,
            /#include\s*<\s*fcntl\.h\s*>/gi,
            /system\s*\(/gi,
            /exec\s*\(/gi,
            /fork\s*\(/gi,
            /kill\s*\(/gi,
            /exit\s*\(/gi,
            /abort\s*\(/gi,
            /popen\s*\(/gi,
            /freopen\s*\(/gi
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

module.exports = new CppExecutor();