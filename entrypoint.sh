#!/bin/sh

# Set timezone if TZ is provided
if [ -n "$TZ" ] && [ -f "/usr/share/zoneinfo/$TZ" ]; then
    ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime && echo "$TZ" > /etc/timezone
    echo "Timezone set to $TZ"
fi

# Default values
USER_ID=${PUID:-1000}
GROUP_ID=${PGID:-1000}
DOCKER_GID=${DOCKER_GID:-999}

# Detect host path for /cluster (DooD volume path resolution)
export HOST_CLUSTER_DIR=$(cat /proc/self/mountinfo | grep ' /cluster ' | cut -d ' ' -f 4)
if [ -z "$HOST_CLUSTER_DIR" ]; then
    echo "Error: Could not determine HOST_CLUSTER_DIR from /proc/self/mountinfo. Make sure /cluster is bind-mounted."
    exit 1
fi

echo "Starting with UID: $USER_ID, GID: $GROUP_ID, DOCKER_GID: $DOCKER_GID, HOST_CLUSTER_DIR: $HOST_CLUSTER_DIR"

# Modify nodejs group if needed
if [ "$(id -g nextjs)" -ne "$GROUP_ID" ]; then
    # Handle user/group duplication more safely
    EXISTING_USER_WITH_UID=$(getent passwd "$USER_ID" | cut -d: -f1)
    if [ -n "$EXISTING_USER_WITH_UID" ] && [ "$EXISTING_USER_WITH_UID" != "nextjs" ]; then
        userdel -f "$EXISTING_USER_WITH_UID"
    fi

    EXISTING_GROUP_WITH_GID=$(getent group "$GROUP_ID" | cut -d: -f1)
    if [ -n "$EXISTING_GROUP_WITH_GID" ] && [ "$EXISTING_GROUP_WITH_GID" != "nodejs" ]; then
        groupdel "$EXISTING_GROUP_WITH_GID" || true
    fi
    
    groupmod -o -g "$GROUP_ID" nodejs
fi

# Modify nextjs user if needed
if [ "$(id -u nextjs)" -ne "$USER_ID" ]; then
    usermod -o -u "$USER_ID" nextjs
fi

# Create docker group and add nextjs to it if it doesn't exist
DOCKER_GROUP_BY_GID=$(getent group "$DOCKER_GID" | cut -d: -f1)

if [ -n "$DOCKER_GROUP_BY_GID" ]; then
    # Group with the target GID already exists, use its name
    DOCKER_GROUP="$DOCKER_GROUP_BY_GID"
    echo "Using existing group $DOCKER_GROUP with GID $DOCKER_GID"
else
    # Group with target GID doesn't exist.
    # Check if 'docker' name is already taken by another GID
    if getent group docker > /dev/null; then
        echo "Updating existing 'docker' group to GID $DOCKER_GID"
        groupmod -o -g "$DOCKER_GID" docker
        DOCKER_GROUP="docker"
    else
        echo "Creating 'docker' group with GID $DOCKER_GID"
        groupadd -g "$DOCKER_GID" docker
        DOCKER_GROUP="docker"
    fi
fi

usermod -aG "$DOCKER_GROUP" nextjs

# Ensure /cluster is writable by nextjs user
# We only chown the directory itself to avoid recursive delay
# /app (static files) doesn't need to be chowned recursively
chown nextjs:nodejs /cluster 2>/dev/null || true

echo "Checking permissions for /var/run/docker.sock..."
ls -l /var/run/docker.sock
echo "Execution identity: $(id nextjs)"

# Use gosu with only the username to ensure all supplementary groups are loaded
exec gosu nextjs "$@"
