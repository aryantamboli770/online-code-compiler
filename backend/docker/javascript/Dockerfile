# Node.js execution environment
FROM node:16-alpine

# Install security updates
RUN apk update && apk upgrade

# Create non-root user
RUN addgroup -g 1001 -S coderunner && \
    adduser -S coderunner -u 1001 -G coderunner

# Set working directory
WORKDIR /app

# Create temp directory with proper permissions
RUN mkdir -p /tmp/code && chown coderunner:coderunner /tmp/code

# Remove unnecessary packages and clean up
RUN apk del --purge wget curl && \
    rm -rf /var/cache/apk/* /tmp/* /var/tmp/* /root/.npm

# Switch to non-root user
USER coderunner

# Set resource limits
ENV NODE_ENV=sandbox
ENV NODE_OPTIONS="--max-old-space-size=128"

# Default command
CMD ["node", "main.js"]