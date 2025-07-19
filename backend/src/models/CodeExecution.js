// src/models/CodeExecution.js
const mongoose = require('mongoose');
const { SUPPORTED_LANGUAGES, EXECUTION_STATUS } = require('../utils/constants');

const codeExecutionSchema = new mongoose.Schema({
    executionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false, // Allow anonymous executions
        index: true
    },
    language: {
        type: String,
        required: [true, 'Programming language is required'],
        enum: Object.values(SUPPORTED_LANGUAGES),
        index: true
    },
    code: {
        type: String,
        required: [true, 'Code is required'],
        maxlength: [50000, 'Code cannot exceed 50,000 characters']
    },
    input: {
        type: String,
        default: '',
        maxlength: [10000, 'Input cannot exceed 10,000 characters']
    },
    output: {
        type: String,
        default: '',
        maxlength: [100000, 'Output cannot exceed 100,000 characters']
    },
    error: {
        type: String,
        default: '',
        maxlength: [10000, 'Error message cannot exceed 10,000 characters']
    },
    status: {
        type: String,
        required: true,
        enum: Object.values(EXECUTION_STATUS),
        default: EXECUTION_STATUS.SUCCESS,
        index: true
    },
    executionTime: {
        type: Number, // in milliseconds
        default: 0,
        min: 0
    },
    memoryUsage: {
        rss: { type: Number, default: 0 },
        heapTotal: { type: Number, default: 0 },
        heapUsed: { type: Number, default: 0 },
        external: { type: Number, default: 0 }
    },
    containerInfo: {
        containerId: String,
        imageName: String,
        memoryLimit: String,
        cpuLimit: String
    },
    metadata: {
        ipAddress: {
            type: String,
            required: true
        },
        userAgent: String,
        sessionId: String,
        isAnonymous: {
            type: Boolean,
            default: false
        }
    },
    compilationOutput: {
        type: String,
        default: ''
    },
    exitCode: {
        type: Number,
        default: 0
    },
    isPublic: {
        type: Boolean,
        default: false
    },
    title: {
        type: String,
        trim: true,
        maxlength: [100, 'Title cannot exceed 100 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    tags: [{
        type: String,
        trim: true,
        maxlength: [30, 'Tag cannot exceed 30 characters']
    }],
    likes: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    comments: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        username: {
            type: String,
            required: true
        },
        comment: {
            type: String,
            required: true,
            maxlength: [500, 'Comment cannot exceed 500 characters']
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    views: {
        type: Number,
        default: 0
    },
    forkCount: {
        type: Number,
        default: 0
    },
    forkedFrom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CodeExecution'
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
codeExecutionSchema.index({ userId: 1, createdAt: -1 });
codeExecutionSchema.index({ language: 1, createdAt: -1 });
codeExecutionSchema.index({ status: 1, createdAt: -1 });
codeExecutionSchema.index({ isPublic: 1, createdAt: -1 });
codeExecutionSchema.index({ 'metadata.ipAddress': 1, createdAt: -1 });
codeExecutionSchema.index({ tags: 1 });
codeExecutionSchema.index({ views: -1 });

// Compound indexes
codeExecutionSchema.index({ language: 1, status: 1, createdAt: -1 });
codeExecutionSchema.index({ isPublic: 1, language: 1, createdAt: -1 });

// Pre-save middleware to set metadata
codeExecutionSchema.pre('save', function(next) {
    if (this.isNew) {
        this.metadata.isAnonymous = !this.userId;
    }
    next();
});

// Method to increment views
codeExecutionSchema.methods.incrementViews = async function() {
    this.views += 1;
    await this.save();
};

// Method to add like
codeExecutionSchema.methods.addLike = async function(userId) {
    const existingLike = this.likes.find(like => like.userId.toString() === userId.toString());

    if (existingLike) {
        throw new Error('User has already liked this execution');
    }

    this.likes.push({ userId });
    await this.save();
};

// Method to remove like
codeExecutionSchema.methods.removeLike = async function(userId) {
    this.likes = this.likes.filter(like => like.userId.toString() !== userId.toString());
    await this.save();
};

// Method to add comment
codeExecutionSchema.methods.addComment = async function(userId, username, comment) {
    this.comments.push({
        userId,
        username,
        comment
    });
    await this.save();
};

// Method to create fork
codeExecutionSchema.methods.createFork = async function(userId, modifications = {}) {
    const CodeExecution = this.constructor;

    const forkData = {
        ...this.toObject(),
        _id: undefined,
        executionId: `fork_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: userId,
        forkedFrom: this._id,
        likes: [],
        comments: [],
        views: 0,
        forkCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...modifications
    };

    const fork = new CodeExecution(forkData);
    await fork.save();

    // Increment fork count on original
    this.forkCount += 1;
    await this.save();

    return fork;
};

// Static method to get execution statistics
codeExecutionSchema.statics.getExecutionStats = async function(timeRange = 'day') {
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
                totalExecutions: { $sum: 1 },
                successfulExecutions: {
                    $sum: {
                        $cond: [{ $eq: ['$status', EXECUTION_STATUS.SUCCESS] }, 1, 0]
                    }
                },
                errorExecutions: {
                    $sum: {
                        $cond: [{ $eq: ['$status', EXECUTION_STATUS.ERROR] }, 1, 0]
                    }
                },
                timeoutExecutions: {
                    $sum: {
                        $cond: [{ $eq: ['$status', EXECUTION_STATUS.TIMEOUT] }, 1, 0]
                    }
                },
                averageExecutionTime: { $avg: '$executionTime' },
                languageBreakdown: {
                    $push: '$language'
                }
            }
        }
    ]);

    return stats[0] || {
        totalExecutions: 0,
        successfulExecutions: 0,
        errorExecutions: 0,
        timeoutExecutions: 0,
        averageExecutionTime: 0,
        languageBreakdown: []
    };
};

// Static method to get popular executions
codeExecutionSchema.statics.getPopularExecutions = async function(limit = 10) {
    return await this.find({
        isPublic: true
    })
    .sort({ views: -1, likes: -1 })
    .limit(limit)
    .populate('userId', 'username')
    .select('title description language views likes.length forkCount createdAt');
};

// Static method to clean up old executions
codeExecutionSchema.statics.cleanupOldExecutions = async function(daysOld = 90) {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

    const result = await this.deleteMany({
        createdAt: { $lt: cutoffDate },
        isPublic: false,
        $or: [
            { userId: { $exists: false } },
            { userId: null }
        ]
    });

    return result;
};

module.exports = mongoose.model('CodeExecution', codeExecutionSchema);