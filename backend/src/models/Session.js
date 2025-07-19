// src/models/Session.js
const mongoose = require('mongoose');
const crypto = require('crypto');

const sessionSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false, // Allow anonymous sessions
        index: true
    },
    isAnonymous: {
        type: Boolean,
        default: true
    },
    ipAddress: {
        type: String,
        required: true,
        index: true
    },
    userAgent: {
        type: String,
        required: true
    },
    country: {
        type: String,
        default: 'Unknown'
    },
    city: {
        type: String,
        default: 'Unknown'
    },
    browser: {
        name: String,
        version: String
    },
    os: {
        name: String,
        version: String
    },
    device: {
        type: String,
        enum: ['desktop', 'mobile', 'tablet'],
        default: 'desktop'
    },
    executionCount: {
        type: Number,
        default: 0
    },
    lastActivity: {
        type: Date,
        default: Date.now,
        index: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    sessionData: {
        preferences: {
            theme: {
                type: String,
                enum: ['light', 'dark'],
                default: 'light'
            },
            language: {
                type: String,
                enum: ['python', 'javascript', 'cpp', 'java'],
                default: 'python'
            },
            fontSize: {
                type: Number,
                default: 14,
                min: 10,
                max: 24
            },
            autoSave: {
                type: Boolean,
                default: true
            }
        },
        recentExecutions: [{
            executionId: String,
            language: String,
            timestamp: {
                type: Date,
                default: Date.now
            }
        }],
        savedCode: [{
            language: String,
            code: String,
            savedAt: {
                type: Date,
                default: Date.now
            }
        }]
    },
    rateLimitData: {
        requestCount: {
            type: Number,
            default: 0
        },
        lastRequestTime: {
            type: Date,
            default: Date.now
        },
        windowStart: {
            type: Date,
            default: Date.now
        }
    },
    securityFlags: {
        suspiciousActivity: {
            type: Boolean,
            default: false
        },
        rateLimitExceeded: {
            type: Boolean,
            default: false
        },
        blockedCount: {
            type: Number,
            default: 0
        },
        lastBlockedAt: Date
    },
    expiresAt: {
        type: Date,
        default: function() {
            return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
        },
        index: { expireAfterSeconds: 0 }
    }
}, {
    timestamps: true,
    toJSON: {
        transform: function(doc, ret) {
            delete ret.__v;
            return ret;
        }
    }
});

// Indexes for performance
sessionSchema.index({ userId: 1, isActive: 1 });
sessionSchema.index({ ipAddress: 1, lastActivity: -1 });
sessionSchema.index({ createdAt: -1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Pre-save middleware to update last activity
sessionSchema.pre('save', function(next) {
    if (this.isModified() && !this.isNew) {
        this.lastActivity = new Date();

        // Extend expiration time on activity
        this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    next();
});

// Method to generate session ID
sessionSchema.statics.generateSessionId = function() {
    return crypto.randomBytes(32).toString('hex');
};

// Method to create new session
sessionSchema.statics.createSession = async function(data) {
    const sessionId = this.generateSessionId();

    const session = new this({
        sessionId,
        ...data
    });

    await session.save();
    return session;
};

// Method to find active session
sessionSchema.statics.findActiveSession = async function(sessionId) {
    return await this.findOne({
        sessionId,
        isActive: true,
        expiresAt: { $gt: new Date() }
    });
};

// Method to update session activity
sessionSchema.methods.updateActivity = async function() {
    this.lastActivity = new Date();
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.save();
};

// Method to increment execution count
sessionSchema.methods.incrementExecutionCount = async function() {
    this.executionCount += 1;
    await this.updateActivity();
};

// Method to add recent execution
sessionSchema.methods.addRecentExecution = async function(executionId, language) {
    this.sessionData.recentExecutions.unshift({
        executionId,
        language,
        timestamp: new Date()
    });

    // Keep only last 10 executions
    if (this.sessionData.recentExecutions.length > 10) {
        this.sessionData.recentExecutions = this.sessionData.recentExecutions.slice(0, 10);
    }

    await this.save();
};

// Method to save code
sessionSchema.methods.saveCode = async function(language, code) {
    // Remove existing saved code for this language
    this.sessionData.savedCode = this.sessionData.savedCode.filter(
        item => item.language !== language
    );

    // Add new saved code
    this.sessionData.savedCode.push({
        language,
        code,
        savedAt: new Date()
    });

    // Keep only last 5 saved codes
    if (this.sessionData.savedCode.length > 5) {
        this.sessionData.savedCode = this.sessionData.savedCode.slice(0, 5);
    }

    await this.save();
};

// Method to update preferences
sessionSchema.methods.updatePreferences = async function(preferences) {
    this.sessionData.preferences = {
        ...this.sessionData.preferences,
        ...preferences
    };
    await this.save();
};

// Method to check rate limit
sessionSchema.methods.checkRateLimit = function(windowMs = 900000, maxRequests = 100) {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);

    // Reset if window has passed
    if (this.rateLimitData.windowStart < windowStart) {
        this.rateLimitData.requestCount = 0;
        this.rateLimitData.windowStart = now;
    }

    return this.rateLimitData.requestCount < maxRequests;
};

// Method to increment request count
sessionSchema.methods.incrementRequestCount = async function() {
    this.rateLimitData.requestCount += 1;
    this.rateLimitData.lastRequestTime = new Date();
    await this.save();
};

// Method to flag suspicious activity
sessionSchema.methods.flagSuspiciousActivity = async function() {
    this.securityFlags.suspiciousActivity = true;
    this.securityFlags.blockedCount += 1;
    this.securityFlags.lastBlockedAt = new Date();
    await this.save();
};

// Method to associate with user
sessionSchema.methods.associateUser = async function(userId) {
    this.userId = userId;
    this.isAnonymous = false;
    await this.save();
};

// Method to end session
sessionSchema.methods.endSession = async function() {
    this.isActive = false;
    this.expiresAt = new Date(); // Expire immediately
    await this.save();
};

// Static method to cleanup expired sessions
sessionSchema.statics.cleanupExpiredSessions = async function() {
    const result = await this.deleteMany({
        $or: [
            { expiresAt: { $lt: new Date() } },
            { isActive: false }
        ]
    });

    return result;
};

// Static method to get session statistics
sessionSchema.statics.getSessionStats = async function(timeRange = 'day') {
    const now = new Date();
    let startDate;

    switch (timeRange) {
        case 'hour':
            startDate = new Date(now.getTime() - 60 * 60 * 1000);
            break;
        case 'day':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
        case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        default:
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const stats = await this.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: null,
                totalSessions: { $sum: 1 },
                activeSessions: {
                    $sum: {
                        $cond: [{ $eq: ['$isActive', true] }, 1, 0]
                    }
                },
                anonymousSessions: {
                    $sum: {
                        $cond: [{ $eq: ['$isAnonymous', true] }, 1, 0]
                    }
                },
                totalExecutions: { $sum: '$executionCount' },
                averageExecutionsPerSession: { $avg: '$executionCount' },
                uniqueIPs: { $addToSet: '$ipAddress' }
            }
        }
    ]);

    const result = stats[0] || {
        totalSessions: 0,
        activeSessions: 0,
        anonymousSessions: 0,
        totalExecutions: 0,
        averageExecutionsPerSession: 0,
        uniqueIPs: []
    };

    result.uniqueIPCount = result.uniqueIPs ? result.uniqueIPs.length : 0;
    delete result.uniqueIPs;

    return result;
};

module.exports = mongoose.model('Session', sessionSchema);