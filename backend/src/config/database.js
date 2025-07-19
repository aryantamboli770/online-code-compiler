// src/config/database.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');

class DatabaseConnection {
    constructor() {
        this.connection = null;
    }

    async connect() {
        try {
            if (this.connection) {
                return this.connection;
            }

            const options = {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
                bufferMaxEntries: 0,
                retryWrites: true,
                w: 'majority'
            };

            this.connection = await mongoose.connect(process.env.MONGODB_URI, options);

            logger.info('MongoDB connected successfully');

            // Handle connection events
            mongoose.connection.on('error', (err) => {
                logger.error('MongoDB connection error:', err);
            });

            mongoose.connection.on('disconnected', () => {
                logger.warn('MongoDB disconnected');
            });

            mongoose.connection.on('reconnected', () => {
                logger.info('MongoDB reconnected');
            });

            return this.connection;
        } catch (error) {
            logger.error('Database connection failed:', error);
            throw error;
        }
    }

    async disconnect() {
        try {
            if (this.connection) {
                await mongoose.disconnect();
                this.connection = null;
                logger.info('MongoDB disconnected successfully');
            }
        } catch (error) {
            logger.error('Error disconnecting from database:', error);
            throw error;
        }
    }

    isConnected() {
        return mongoose.connection.readyState === 1;
    }
}

module.exports = new DatabaseConnection();