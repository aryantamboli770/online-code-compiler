const Docker = require('dockerode');
const logger = require('../utils/logger');

class DockerConfig {
    constructor() {
        this.docker = new Docker({
            socketPath: process.env.DOCKER_HOST || '/var/run/docker.sock'
        });

        this.containerConfigs = {
            python: {
                image: 'python:3.9-alpine',
                workingDir: '/app',
                cmd: ['python', 'main.py'],
                memoryLimit: process.env.MAX_MEMORY_LIMIT || '128m',
                cpuLimit: parseFloat(process.env.MAX_CPU_LIMIT) || 0.5,
                timeout: parseInt(process.env.EXECUTION_TIMEOUT) || 30000,
                networkMode: 'none'
            },
            javascript: {
                image: 'node:16-alpine',
                workingDir: '/app',
                cmd: ['node', 'main.js'],
                memoryLimit: process.env.MAX_MEMORY_LIMIT || '128m',
                cpuLimit: parseFloat(process.env.MAX_CPU_LIMIT) || 0.5,
                timeout: parseInt(process.env.EXECUTION_TIMEOUT) || 30000,
                networkMode: 'none'
            },
            cpp: {
                image: 'gcc:9-alpine',
                workingDir: '/app',
                cmd: ['sh', '-c', 'g++ -o main main.cpp && ./main'],
                memoryLimit: process.env.MAX_MEMORY_LIMIT || '128m',
                cpuLimit: parseFloat(process.env.MAX_CPU_LIMIT) || 0.5,
                timeout: parseInt(process.env.EXECUTION_TIMEOUT) || 45000,
                networkMode: 'none'
            },
            java: {
                image: 'openjdk:11-alpine',
                workingDir: '/app',
                cmd: ['sh', '-c', 'javac Main.java && java Main'],
                memoryLimit: process.env.MAX_MEMORY_LIMIT || '128m',
                cpuLimit: parseFloat(process.env.MAX_CPU_LIMIT) || 0.5,
                timeout: parseInt(process.env.EXECUTION_TIMEOUT) || 45000,
                networkMode: 'none'
            }
        };
    }

    getDocker() {
        return this.docker;
    }

    getContainerConfig(language) {
        return this.containerConfigs[language];
    }

    async checkDockerConnection() {
        try {
            await this.docker.ping();
            logger.info('Docker connection established successfully');
            return true;
        } catch (error) {
            logger.error('Failed to connect to Docker', { error: error.message });
            return false;
        }
    }

    async pullImages() {
        const images = Object.values(this.containerConfigs).map(config => config.image);
        const uniqueImages = [...new Set(images)];

        for (const image of uniqueImages) {
            try {
                logger.info(`Pulling Docker image: ${image}`);
                await this.docker.pull(image);
                logger.info(`Successfully pulled image: ${image}`);
            } catch (error) {
                logger.error(`Failed to pull image: ${image}`, { error: error.message });
            }
        }
    }

    async cleanupContainers() {
        try {
            const containers = await this.docker.listContainers({ all: true });
            const codeExecutionContainers = containers.filter(container =>
                container.Names.some(name => name.includes('code-exec'))
            );

            for (const containerInfo of codeExecutionContainers) {
                try {
                    const container = this.docker.getContainer(containerInfo.Id);
                    if (containerInfo.State === 'running') {
                        await container.stop();
                    }
                    await container.remove();
                    logger.info(`Cleaned up container: ${containerInfo.Id}`);
                } catch (error) {
                    logger.warn(`Failed to cleanup container: ${containerInfo.Id}`, { error: error.message });
                }
            }
        } catch (error) {
            logger.error('Failed to cleanup containers', { error: error.message });
        }
    }

    buildContainerOptions(language, tempDir, input = '') {
        const config = this.getContainerConfig(language);
        if (!config) {
            throw new Error(`Unsupported language: ${language}`);
        }

        const binds = [`${tempDir}:/app:rw`];

        return {
            Image: config.image,
            Cmd: config.cmd,
            WorkingDir: config.workingDir,
            AttachStdout: true,
            AttachStderr: true,
            AttachStdin: !!input,
            OpenStdin: !!input,
            StdinOnce: !!input,
            Tty: false,
            NetworkMode: config.networkMode,
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
}

module.exports = new DockerConfig();