// Supported programming languages
const SUPPORTED_LANGUAGES = {
    PYTHON: 'python',
    JAVASCRIPT: 'javascript',
    CPP: 'cpp',
    JAVA: 'java'
};

// Execution status constants
const EXECUTION_STATUS = {
    SUCCESS: 'success',
    ERROR: 'error',
    TIMEOUT: 'timeout',
    MEMORY_LIMIT_EXCEEDED: 'memory_limit_exceeded',
    COMPILATION_ERROR: 'compilation_error',
    RUNTIME_ERROR: 'runtime_error'
};

// Security configuration
const SECURITY_CONFIG = {
    FORBIDDEN_PATTERNS: [
        /import\s+os/gi,
        /import\s+sys/gi,
        /import\s+subprocess/gi,
        /import\s+socket/gi,
        /require\s*\(\s*['"]fs['"]\s*\)/gi,
        /require\s*\(\s*['"]child_process['"]\s*\)/gi,
        /require\s*\(\s*['"]net['"]\s*\)/gi,
        /#include\s*<\s*stdlib\.h\s*>/gi,
        /#include\s*<\s*unistd\.h\s*>/gi,
        /system\s*\(/gi,
        /exec\s*\(/gi,
        /eval\s*\(/gi,
        /Runtime\.getRuntime\(\)\.exec/gi,
        /ProcessBuilder/gi,
        /\.\.\//gi, // Directory traversal
        /\/etc\/passwd/gi,
        /\/proc\//gi
    ]
};

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
};

// File size limits
const MAX_CODE_LENGTH = 50000; // 50KB
const MAX_INPUT_LENGTH = 10000; // 10KB
const MAX_OUTPUT_LENGTH = 100000; // 100KB

// Docker configuration
const DOCKER_CONFIG = {
    MEMORY_LIMIT: '128m',
    CPU_LIMIT: 0.5,
    TIMEOUT: 30000, // 30 seconds
    NETWORK_MODE: 'none',
    PIDS_LIMIT: 50
};

// User roles
const USER_ROLES = {
    USER: 'user',
    ADMIN: 'admin'
};

// Session configuration
const SESSION_CONFIG = {
    EXPIRY_TIME: 24 * 60 * 60 * 1000, // 24 hours
    CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour
    MAX_SESSIONS_PER_IP: 10
};

// Execution limits
const EXECUTION_LIMITS = {
    DAILY_LIMIT_USER: 100,
    DAILY_LIMIT_ADMIN: 1000,
    ANONYMOUS_SESSION_LIMIT: 20,
    MAX_CONCURRENT_EXECUTIONS: 10
};

// Language file extensions
const LANGUAGE_EXTENSIONS = {
    [SUPPORTED_LANGUAGES.PYTHON]: '.py',
    [SUPPORTED_LANGUAGES.JAVASCRIPT]: '.js',
    [SUPPORTED_LANGUAGES.CPP]: '.cpp',
    [SUPPORTED_LANGUAGES.JAVA]: '.java'
};

// Language main file names
const LANGUAGE_MAIN_FILES = {
    [SUPPORTED_LANGUAGES.PYTHON]: 'main.py',
    [SUPPORTED_LANGUAGES.JAVASCRIPT]: 'main.js',
    [SUPPORTED_LANGUAGES.CPP]: 'main.cpp',
    [SUPPORTED_LANGUAGES.JAVA]: 'Main.java'
};

// Error messages
const ERROR_MESSAGES = {
    INVALID_LANGUAGE: 'Unsupported programming language',
    CODE_TOO_LONG: `Code exceeds maximum length of ${MAX_CODE_LENGTH} characters`,
    INPUT_TOO_LONG: `Input exceeds maximum length of ${MAX_INPUT_LENGTH} characters`,
    EXECUTION_TIMEOUT: 'Code execution timed out',
    MEMORY_LIMIT: 'Memory limit exceeded',
    COMPILATION_FAILED: 'Code compilation failed',
    RUNTIME_ERROR: 'Runtime error occurred',
    UNAUTHORIZED: 'Unauthorized access',
    FORBIDDEN: 'Access forbidden',
    NOT_FOUND: 'Resource not found',
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
    DAILY_LIMIT_EXCEEDED: 'Daily execution limit exceeded',
    INVALID_TOKEN: 'Invalid or expired token',
    USER_NOT_FOUND: 'User not found',
    INVALID_CREDENTIALS: 'Invalid credentials'
};

// Success messages
const SUCCESS_MESSAGES = {
    USER_REGISTERED: 'User registered successfully',
    LOGIN_SUCCESSFUL: 'Login successful',
    LOGOUT_SUCCESSFUL: 'Logout successful',
    CODE_EXECUTED: 'Code executed successfully',
    PROFILE_UPDATED: 'Profile updated successfully',
    PASSWORD_CHANGED: 'Password changed successfully',
    ACCOUNT_DELETED: 'Account deleted successfully'
};

// HTTP status codes
const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
};

module.exports = {
    SUPPORTED_LANGUAGES,
    EXECUTION_STATUS,
    SECURITY_CONFIG,
    RATE_LIMIT_CONFIG,
    MAX_CODE_LENGTH,
    MAX_INPUT_LENGTH,
    MAX_OUTPUT_LENGTH,
    DOCKER_CONFIG,
    USER_ROLES,
    SESSION_CONFIG,
    EXECUTION_LIMITS,
    LANGUAGE_EXTENSIONS,
    LANGUAGE_MAIN_FILES,
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,
    HTTP_STATUS
};