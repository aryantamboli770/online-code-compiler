# C++ execution environment
FROM gcc:9-alpine

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
    rm -rf /var/cache/apk/* /tmp/* /var/tmp/*

# Switch to non-root user
USER coderunner

# Set compilation flags
ENV CXXFLAGS="-std=c++17 -Wall -Wextra -O2"

# Default command (compile and run)
CMD ["sh", "-c", "g++ -o main main.cpp && ./main"]