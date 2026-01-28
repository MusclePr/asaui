#!/bin/sh

# Default values
USER_ID=${PUID:-1000}
GROUP_ID=${PGID:-1000}
DOCKER_GID=${DOCKER_GID:-999}

echo "Starting with UID: $USER_ID, GID: $GROUP_ID, DOCKER_GID: $DOCKER_GID"

# Modify nodejs group if needed
if [ "$(id -g nextjs)" -ne "$GROUP_ID" ]; then
    # Handle user/group duplication more safely
    EXISTING_USER_WITH_UID=$(getent passwd "$USER_ID" | cut -d: -f1)
    if [ -n "$EXISTING_USER_WITH_UID" ] && [ "$EXISTING_USER_WITH_UID" != "nextjs" ]; then
        userdel -f "$EXISTING_USER_WITH_UID"
    fi

    EXISTING_GROUP_WITH_GID=$(getent group "$GROUP_ID" | cut -d: -f1)
    if [ -n "$EXISTING_GROUP_WITH_GID" ] && [ "$EXISTING_GROUP_WITH_GID" != "nodejs" ]; then
        groupdel -f "$EXISTING_GROUP_WITH_GID" || true
    fi
    
    groupmod -o -g "$GROUP_ID" nodejs
fi

# Modify nextjs user if needed
if [ "$(id -u nextjs)" -ne "$USER_ID" ]; then
    usermod -o -u "$USER_ID" nextjs
fi

# Create docker group and add nextjs to it if it doesn't exist
DOCKER_GROUP=$(getent group "$DOCKER_GID" | cut -d: -f1)
if [ -z "$DOCKER_GROUP" ]; then
    DOCKER_GROUP="docker"
    groupadd -g "$DOCKER_GID" "$DOCKER_GROUP"
fi
usermod -aG "$DOCKER_GROUP" nextjs

# Set ownership of /app to current user
chown -R nextjs:nodejs /app

echo "Checking permissions for /var/run/docker.sock..."
ls -l /var/run/docker.sock
echo "Execution identity: $(id nextjs)"

# Use su-exec with only the username to ensure all supplementary groups are loaded
exec su-exec nextjs "$@"
