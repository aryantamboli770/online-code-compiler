// src/services/dockerService.js
const Docker = require('dockerode');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');
const { SUPPORTED_LANGUAGES, EXECUTION_STATUS } = require('../utils/constants');

class DockerService {
    constructor() {
        this.docker = new Docker();
        this.activeContainers = new Map();
        this.containerConfigs = {
            python: {
                image: 'python:3.9-alpine',
                cmd: ['python', '/app/main.py'],
                workingDir: '/app',
                memoryLimit: process.env.MAX_MEMORY || '128m',
                cpuLimit: parseFloat(process.env.MAX_CPU) || 0.5,
                timeout: parseInt(process.env.DOCKER_TIMEOUT) || 30000
            },
            javascript: {
                image: 'node:16-alpine',
                cmd: ['node', '/app/main.js'],
                workingDir: '/app',
                memoryLimit: process.env.MAX_MEMORY || '128m',
                cpuLimit: parseFloat(process.env.MAX_CPU) || 0.5,
                timeout: parseInt(process.env.DOCKER_TIMEOUT) || 30000
            },
            cpp: {
                image: 'gcc:9-alpine',
                cmd: ['/bin/sh', '-c', 'cd /app && g++ -o main main.cpp && ./main'],
                workingDir: '/app',
                memoryLimit: process.env.MAX_MEMORY || '128m',
                cpuLimit: parseFloat(process.env.MAX_CPU) || 0.5,
                timeout: parseInt(process.env.DOCKER_TIMEOUT) || 45000 // Extra time for compilation
            },
            java: {
                image: 'openjdk:11-alpine',
                cmd: ['/bin/sh', '-c', 'cd /app && javac Main.java && java Main'],
                workingDir: '/app',
                memoryLimit: process.env.MAX_MEMORY || '128m',
                cpuLimit: parseFloat(process.env.MAX_CPU) || 0.5,
                timeout: parseInt(process.env.DOCKER_TIMEOUT) || 45000 // Extra time for compilation
            }
        };
    }

    async executeCode(language, code, input = '', executionId) {
        const startTime = Date.now();
        let container = null;
        let tempDir = null;

        try {
            // Validate language
            if (!this.containerConfigs[language]) {
                throw new Error(`Unsupported language: ${language}`);
            }

            // Create temporary directory
            tempDir = await Helpers.createTempDirectory(executionId);

            // Write code and input files
            const fileName = Helpers.generateFileName(language, executionId);
            const codePath = path.join(tempDir, fileName);
            const inputPath = path.join(tempDir, 'input.txt');

            await Helpers.writeCodeToFile(code, codePath);
            if (input) {
                await Helpers.writeInputToFile(input, inputPath);
            }

            // Create and run container
            const config = this.containerConfigs[language];
            const containerOptions = this.buildContainerOptions(config, tempDir, input);

            logger.info('Creating container for code execution', {
                language,
                executionId,
                image: config.image
            });

            container = await this.docker.createContainer(containerOptions);
            this.activeContainers.set(executionId, container);

            // Start container and wait for completion
            await container.start();

            const result = await this.waitForContainerCompletion(
                container,
                config.timeout,
                executionId
            );

            const endTime = Date.now();
            const executionTime = endTime - startTime;

            // Get container stats
            const stats = await this.getContainerStats(container);

            // Clean up
            await this.cleanupContainer(container, executionId);
            if (tempDir) {
                await Helpers.cleanupTempDirectory(tempDir);
            }

            return {
                status: result.exitCode === 0 ? EXECUTION_STATUS.SUCCESS : EXECUTION_STATUS.RUNTIME_ERROR,
                output: Helpers.sanitizeOutput(result.output),
                error: Helpers.sanitizeOutput(result.error),
                executionTime,
                exitCode: result.exitCode,
                memoryUsage: stats.memoryUsage,
                containerInfo: {
                    containerId: container.id,
                    imageName: config.image,
                    memoryLimit: config.memoryLimit,
                    cpuLimit: config.cpuLimit
                }
            };

        } catch (error) {
            logger.error('Docker execution failed', {
                language,
                executionId,
                error: error.message,
                stack: error.stack
            });

            // Clean up on error
            if (container) {
                await this.cleanupContainer(container, executionId);
            }
            if (tempDir) {
                await Helpers.cleanupTempDirectory(tempDir);
            }

            const endTime = Date.now();
            const executionTime = endTime - startTime;

            return {
                status: this.getErrorStatus(error),
                output: '',
                error: this.formatError(error),
                executionTime,
                exitCode: -1,
                memoryUsage: Helpers.getMemoryUsage(),
                containerInfo: null
            };
        }
    }

    buildContainerOptions(config, tempDir, input) {
        const binds = [`${tempDir}:/app:rw`];

        const containerOptions = {
            Image: config.image,
            Cmd: config.cmd,
            WorkingDir: config.workingDir,
            AttachStdout: true,
            AttachStderr: true,
            AttachStdin: !!input,
            OpenStdin: !!input,
            StdinOnce: !!input,
            Tty: false,
            NetworkMode: 'none', // Disable network access
            HostConfig: {
                Memory: this.parseMemoryLimit(config.memoryLimit),
                CpuQuota: Math.floor(config.cpuLimit * 100000),
                CpuPeriod: 100000,
                PidsLimit: 50,
                Ulimits: [
                    { Name: 'nofile', Soft: 64, Hard: 64 },
                    { Name: 'nproc', Soft: 32, Hard: 32 }
                ],
                Binds: binds,
                ReadonlyRootfs: false,
                SecurityOpt: ['no-new-privileges'],
                CapDrop: ['ALL'],
                AutoRemove: false
            }
        };

        return containerOptions;
    }

    async waitForContainerCompletion(container, timeout, executionId) {
        return new Promise(async (resolve, reject) => {
            const timeoutId = setTimeout(async () => {
                logger.warn('Container execution timeout', { executionId, timeout });
                try {
                    await container.kill();
                } catch (error) {
                    logger.error('Failed to kill timed out container', { executionId, error: error.message });
                }
                reject(new Error('Execution timeout'));
            }, timeout);

            try {
                // Attach to container streams
                const stream = await container.attach({
                    stream: true,
                    stdout: true,
                    stderr: true,
                    stdin: false
                });

                let output = '';
                let error = '';

                // Handle container output
                container.modem.demuxStream(stream,
                    (chunk) => { output += chunk.toString(); }, // stdout
                    (chunk) => { error += chunk.toString(); }   // stderr
                );

                // Wait for container to finish
                const result = await container.wait();
                clearTimeout(timeoutId);

                resolve({
                    output,
                    error,
                    exitCode: result.StatusCode
                });

            } catch (err) {
                clearTimeout(timeoutId);
                reject(err);
            }
        });
    }

    async getContainerStats(container) {
        try {
            const stats = await container.stats({ stream: false });
            return {
                memoryUsage: {
                    used: stats.memory_stats.usage || 0,
                    limit: stats.memory_stats.limit || 0,
                    percentage: stats.memory_stats.usage && stats.memory_stats.limit
                        ? (stats.memory_stats.usage / stats.memory_stats.limit) * 100
                        : 0
                },
                cpuUsage: {
                    percentage: this.calculateCpuPercentage(stats)
                }
            };
        } catch (error) {
            logger.warn('Failed to get container stats', { error: error.message });
            return {
                memoryUsage: { used: 0, limit: 0, percentage: 0 },
                cpuUsage: { percentage: 0 }
            };
        }
    }

    calculateCpuPercentage(stats) {
        if (!stats.cpu_stats || !stats.precpu_stats) return 0;

        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;

        if (systemDelta > 0 && cpuDelta > 0) {
            return (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;
        }
        return 0;
    }

    async cleanupContainer(container, executionId) {
        try {
            this.activeContainers.delete(executionId);

            // Stop container if still running
            const containerInfo = await container.inspect();
            if (containerInfo.State.Running) {
                await container.stop({ t: 5 }); // 5 second grace period
            }

            // Remove container
            await container.remove({ force: true });

            logger.info('Container cleaned up successfully', {
                executionId,
                containerId: container.id
            });

        } catch (error) {
            logger.error('Failed to cleanup container', {
                executionId,
                containerId: container.id,
                error: error.message
            });
        }
    }

    parseMemoryLimit(memoryLimit) {
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

    getErrorStatus(error) {
        const message = error.message.toLowerCase();

        if (message.includes('timeout')) {
            return EXECUTION_STATUS.TIMEOUT;
        }
        if (message.includes('memory')) {
            return EXECUTION_STATUS.MEMORY_LIMIT_EXCEEDED;
        }
        if (message.includes('compilation') || message.includes('compile')) {
            return EXECUTION_STATUS.COMPILATION_ERROR;
        }

        return EXECUTION_STATUS.ERROR;
    }

    formatError(error) {
        if (error.message.includes('timeout')) {
            return 'Code execution timed out. Please optimize your code or reduce complexity.';
        }
        if (error.message.includes('memory')) {
            return 'Memory limit exceeded. Please optimize your code to use less memory.';
        }

        return `Execution error: ${error.message}`;
    }

    async checkDockerHealth() {
        try {
            await this.docker.ping();
            return { healthy: true, message: 'Docker is running' };
        } catch (error) {
            return { healthy: false, message: `Docker health check failed: ${error.message}` };
        }
    }

    async getDockerInfo() {
        try {
            const info = await this.docker.info();
            return {
                version: info.ServerVersion,
                containers: info.Containers,
                images: info.Images,
                memoryLimit: info.MemTotal,
                cpuCount: info.NCPU
            };
        } catch (error) {
            logger.error('Failed to get Docker info', { error: error.message });
            return null;
        }
    }

    async cleanupAllContainers() {
        try {
            const containers = await this.docker.listContainers({ all: true });
            const cleanupPromises = containers
                .filter(container => container.Image.includes('python') ||
                                   container.Image.includes('node') ||
                                   container.Image.includes('gcc') ||
                                   container.Image.includes('openjdk'))
                .map(async (containerInfo) => {
                    try {
                        const container = this.docker.getContainer(containerInfo.Id);
                        if (containerInfo.State === 'running') {
                            await container.stop();
                        }
                        await container.remove();
                    } catch (error) {
                        logger.warn('Failed to cleanup container', {
                            containerId: containerInfo.Id,
                            error: error.message
                        });
                    }
                });

            await Promise.all(cleanupPromises);
            logger.info('All containers cleaned up successfully');

        } catch (error) {
            logger.error('Failed to cleanup containers', { error: error.message });
        }
    }

    getActiveContainerCount() {
        return this.activeContainers.size;
    }

    async killContainer(executionId) {
        const container = this.activeContainers.get(executionId);
        if (container) {
            try {
                await container.kill();
                await this.cleanupContainer(container, executionId);
                return true;
            } catch (error) {
                logger.error('Failed to kill container', { executionId, error: error.message });
                return false;
            }
        }
        return false;
    }
}

module.exports = new DockerService();