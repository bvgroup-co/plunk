#!/bin/sh
set -e

# Nginx Setup Script for Plunk
# Configures nginx reverse proxy with domain-based routing

echo "🔧 Configuring nginx reverse proxy..."

NGINX_CONFIG_DIR="/etc/nginx"
NGINX_CONF_D="${NGINX_CONFIG_DIR}/conf.d"

# Create nginx directories if they don't exist
mkdir -p "${NGINX_CONF_D}"

echo "🌐 Using domain-based routing"

# Set defaults if not provided
export API_DOMAIN="${API_DOMAIN:-api.localhost}"
export DASHBOARD_DOMAIN="${DASHBOARD_DOMAIN:-localhost}"
export SMTP_DOMAIN="${SMTP_DOMAIN:-smtp.localhost}"
export NGINX_PORT="${NGINX_PORT:-80}"
export USE_HTTPS="${USE_HTTPS:-false}"

# Determine protocol based on USE_HTTPS
if [ "$USE_HTTPS" = "true" ]; then
    PROTOCOL="https"
else
    PROTOCOL="http"
fi

# Validate required environment variables
if [ -z "$API_DOMAIN" ] || [ -z "$DASHBOARD_DOMAIN" ]; then
    echo "⚠️  Warning: Some domain variables are not set. Using defaults."
    echo "   API_DOMAIN=${API_DOMAIN}"
    echo "   DASHBOARD_DOMAIN=${DASHBOARD_DOMAIN}"
fi

# Auto-configure API URIs based on domains and protocol
export API_URI="${API_URI:-${PROTOCOL}://${API_DOMAIN}}"
export DASHBOARD_URI="${DASHBOARD_URI:-${PROTOCOL}://${DASHBOARD_DOMAIN}}"

# Generate nginx configuration from template
echo "📝 Generating nginx configuration..."

# If SMTP_DOMAIN is not set or empty, use a placeholder to prevent nginx config errors
if [ -z "$SMTP_DOMAIN" ]; then
    echo "⚠️  SMTP_DOMAIN not set - ACME challenge proxy will not be configured"
    export SMTP_DOMAIN="_"  # nginx wildcard that won't match any real domain
fi

envsubst '${NGINX_PORT} ${API_DOMAIN} ${DASHBOARD_DOMAIN} ${SMTP_DOMAIN}' \
    < /app/docker/nginx/nginx.conf.template \
    > "${NGINX_CONF_D}/plunk.conf"

# Always create nginx.conf (overwrite default from package)
cat > "${NGINX_CONFIG_DIR}/nginx.conf" << 'EOF'
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /run/nginx/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_names_hash_bucket_size 128;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;

    # Include server configurations
    include /etc/nginx/conf.d/*.conf;
}
EOF

echo "✅ Nginx configuration complete!"
echo "   Config file: ${NGINX_CONF_D}/plunk.conf"
echo "   API Domain: ${API_DOMAIN}"
echo "   Dashboard Domain: ${DASHBOARD_DOMAIN}"
echo "   SMTP Domain: ${SMTP_DOMAIN}"
