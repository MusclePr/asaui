#!/bin/sh

# Default values
USER_ID=${PUID:-1000}
GROUP_ID=${PGID:-1000}
DOCKER_GID=${DOCKER_GID:-999}

echo "Starting with UID: $USER_ID, GID: $GROUP_ID, DOCKER_GID: $DOCKER_GID"

# Modify nodejs group if needed
if [ "$(id -g nextjs)" -ne "$GROUP_ID" ]; then
    groupmod -o -g "$GROUP_ID" nodejs
fi

# Modify nextjs user if needed
if [ "$(id -u nextjs)" -ne "$USER_ID" ]; then
    usermod -o -u "$USER_ID" nextjs
fi

# Create docker group and add nextjs to it if it doesn't exist
if ! getent group docker > /dev/null; then
    groupadd -g "$DOCKER_GID" docker
fi
usermod -aG docker nextjs

# Set ownership of /app to current user (for static files etc)
# User said they will manually chown /cluster, but /app belongs to the build process
chown -R nextjs:nodejs /app

# Final check of permissions for /cluster (just in case)
# chown nextjs:nodejs /cluster

exec su-exec nextjs:nodejs "$@"
