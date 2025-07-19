// src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters long'],
        maxlength: [30, 'Username cannot exceed 30 characters'],
        match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters long'],
        select: false // Don't include password in query results by default
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    executionCount: {
        type: Number,
        default: 0
    },
    dailyExecutionCount: {
        type: Number,
        default: 0
    },
    lastExecutionDate: {
        type: Date,
        default: Date.now
    },
    preferences: {
        theme: {
            type: String,
            enum: ['light', 'dark'],
            default: 'light'
        },
        defaultLanguage: {
            type: String,
            enum: ['python', 'javascript', 'cpp', 'java'],
            default: 'python'
        },
        fontSize: {
            type: Number,
            default: 14,
            min: 10,
            max: 24
        }
    },
    refreshTokens: [{
        token: {
            type: String,
            required: true
        },
        createdAt: {
            type: Date,
            default: Date.now,
            expires: 604800 // 7 days
        }
    }]
}, {
    timestamps: true,
    toJSON: {
        transform: function(doc, ret) {
            delete ret.password;
            delete ret.refreshTokens;
            delete ret.__v;
            return ret;
        }
    }
});

// Index for performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ createdAt: -1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();

    try {
        const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
        this.password = await bcrypt.hash(this.password, saltRounds);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw new Error('Password comparison failed');
    }
};

// Method to generate JWT token
userSchema.methods.generateAuthToken = function() {
    const payload = {
        userId: this._id,
        username: this.username,
        email: this.email,
        role: this.role
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d'
    });
};

// Method to generate refresh token
userSchema.methods.generateRefreshToken = function() {
    const refreshToken = jwt.sign(
        { userId: this._id },
        process.env.JWT_SECRET + 'refresh',
        { expiresIn: '7d' }
    );

    this.refreshTokens.push({ token: refreshToken });
    return refreshToken;
};

// Method to update execution count
userSchema.methods.updateExecutionCount = async function() {
    const today = new Date();
    const lastExecution = new Date(this.lastExecutionDate);

    // Reset daily count if it's a new day
    if (today.toDateString() !== lastExecution.toDateString()) {
        this.dailyExecutionCount = 0;
    }

    this.executionCount += 1;
    this.dailyExecutionCount += 1;
    this.lastExecutionDate = today;

    await this.save();
};

// Method to check if user has exceeded daily limit
userSchema.methods.hasExceededDailyLimit = function() {
    const dailyLimit = this.role === 'admin' ? 1000 : 100;
    return this.dailyExecutionCount >= dailyLimit;
};

// Static method to find user by credentials
userSchema.statics.findByCredentials = async function(email, password) {
    const user = await this.findOne({ email, isActive: true }).select('+password');

    if (!user) {
        throw new Error('Invalid login credentials');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        throw new Error('Invalid login credentials');
    }

    return user;
};

// Static method to clean up expired refresh tokens
userSchema.statics.cleanupExpiredTokens = async function() {
    const expiredDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    await this.updateMany(
        {},
        {
            $pull: {
                refreshTokens: {
                    createdAt: { $lt: expiredDate }
                }
            }
        }
    );
};

module.exports = mongoose.model('User', userSchema);