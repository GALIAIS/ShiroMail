#!/usr/bin/env bash
set -euo pipefail

# ShiroMail One-Click Installer
# Usage:
#   curl -fsSL <url>/install.sh | bash
#   curl -fsSL <url>/install.sh | bash -s -- --domain mail.example.com

SHIROMAIL_VERSION="${SHIROMAIL_VERSION:-latest}"
INSTALL_DIR="${INSTALL_DIR:-/opt/shiromail}"
COMPOSE_FILE="docker-compose.yml"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

DOMAIN=""
SMTP_PORT="25"
ADMIN_PASSWORD=""
SKIP_SSL=false
INTERACTIVE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --smtp-port) SMTP_PORT="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --skip-ssl) SKIP_SSL=true; shift ;;
    --interactive) INTERACTIVE=true; shift ;;
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --version) SHIROMAIL_VERSION="$2"; shift 2 ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

generate_secret() {
  local length="${1:-32}"
  openssl rand -base64 "$length" 2>/dev/null | tr -d '/+=' | head -c "$length"
}

check_prerequisites() {
  info "Checking prerequisites..."

  if ! command -v docker &>/dev/null; then
    err "Docker is not installed."
    echo "  Install Docker: https://docs.docker.com/engine/install/"
    exit 1
  fi
  ok "Docker found: $(docker --version | head -1)"

  if docker compose version &>/dev/null; then
    ok "Docker Compose found: $(docker compose version --short)"
  elif command -v docker-compose &>/dev/null; then
    ok "docker-compose found: $(docker-compose --version)"
    COMPOSE_CMD="docker-compose"
  else
    err "Docker Compose is not installed."
    exit 1
  fi

  if ! docker info &>/dev/null; then
    err "Docker daemon is not running or current user lacks permissions."
    echo "  Try: sudo usermod -aG docker \$USER && newgrp docker"
    exit 1
  fi
  ok "Docker daemon is accessible"
}

interactive_prompts() {
  if [[ "$INTERACTIVE" != "true" ]]; then return; fi

  echo ""
  info "Interactive setup mode"
  echo ""

  if [[ -z "$DOMAIN" ]]; then
    read -rp "  Domain name (e.g., mail.example.com): " DOMAIN
  fi
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    read -rsp "  Admin password [auto-generate]: " ADMIN_PASSWORD
    echo ""
  fi
  read -rp "  SMTP port [$SMTP_PORT]: " input_smtp
  SMTP_PORT="${input_smtp:-$SMTP_PORT}"

  if [[ "$SKIP_SSL" != "true" ]]; then
    read -rp "  Enable SSL via Let's Encrypt? [Y/n]: " ssl_choice
    if [[ "${ssl_choice,,}" == "n" ]]; then
      SKIP_SSL=true
    fi
  fi
}

create_env_file() {
  info "Generating configuration..."

  local jwt_secret
  jwt_secret="$(generate_secret 64)"
  local mysql_password
  mysql_password="$(generate_secret 24)"
  local redis_password
  redis_password="$(generate_secret 16)"
  local metrics_token
  metrics_token="$(generate_secret 32)"

  if [[ -z "$ADMIN_PASSWORD" ]]; then
    ADMIN_PASSWORD="$(generate_secret 16)"
    warn "Generated admin password: $ADMIN_PASSWORD"
    echo "  Save this password! It will not be shown again."
  fi

  local cors_origins="http://localhost:5173"
  if [[ -n "$DOMAIN" ]]; then
    cors_origins="https://$DOMAIN"
  fi

  cat > "$INSTALL_DIR/.env" <<EOF
# ShiroMail Configuration
# Generated: $(date -Iseconds)

APP_ENV=production
APP_PORT=8080
FRONTEND_PORT=80

# Database
MYSQL_ROOT_PASSWORD=$mysql_password
MYSQL_DATABASE=shiro_email
MYSQL_DSN=root:${mysql_password}@tcp(mysql:3306)/shiro_email?parseTime=true

# Redis
REDIS_ADDR=redis:6379
REDIS_PASSWORD=$redis_password

# Security
JWT_SECRET=$jwt_secret
METRICS_TOKEN=$metrics_token

# SMTP
SMTP_PORT=$SMTP_PORT

# Domain
SITE_DOMAIN=${DOMAIN:-localhost}
CORS_ALLOWED_ORIGINS=$cors_origins

# Image
SHIROMAIL_IMAGE=ghcr.io/galiais/shiromail:$SHIROMAIL_VERSION
EOF

  chmod 600 "$INSTALL_DIR/.env"
  ok "Configuration written to $INSTALL_DIR/.env"
}

download_compose() {
  info "Downloading docker-compose.yml..."
  if [[ -f "$INSTALL_DIR/$COMPOSE_FILE" ]]; then
    warn "docker-compose.yml already exists, backing up..."
    cp "$INSTALL_DIR/$COMPOSE_FILE" "$INSTALL_DIR/$COMPOSE_FILE.bak"
  fi

  # Embed the compose file directly for offline installs
  cat > "$INSTALL_DIR/$COMPOSE_FILE" <<'COMPOSEFILE'
x-backend-env: &backend-env
  APP_ENV: ${APP_ENV:-production}
  APP_PORT: 8080
  CORS_ALLOWED_ORIGINS: ${CORS_ALLOWED_ORIGINS:-http://localhost:5173}
  MYSQL_DSN: ${MYSQL_DSN:-root:root@tcp(mysql:3306)/shiro_email?parseTime=true}
  REDIS_ADDR: ${REDIS_ADDR:-redis:6379}
  REDIS_PASSWORD: ${REDIS_PASSWORD:-}
  JWT_SECRET: ${JWT_SECRET:-change-me-in-production}
  METRICS_TOKEN: ${METRICS_TOKEN:-}
  MAIL_STORAGE_PATH: /app/data/mail

services:
  mysql:
    image: mysql:8.4
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-root}
      MYSQL_DATABASE: ${MYSQL_DATABASE:-shiro_email}
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-p${MYSQL_ROOT_PASSWORD:-root}"]
      interval: 10s
      timeout: 5s
      retries: 10
    volumes:
      - mysql_data:/var/lib/mysql
    deploy:
      resources:
        limits:
          memory: 1024M

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: >-
      sh -c 'if [ -n "$$REDIS_PASSWORD" ]; then exec redis-server --requirepass "$$REDIS_PASSWORD"; else exec redis-server; fi'
    environment:
      REDIS_PASSWORD: ${REDIS_PASSWORD:-}
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10
    volumes:
      - redis_data:/data
    deploy:
      resources:
        limits:
          memory: 256M

  app:
    image: ${SHIROMAIL_IMAGE:-ghcr.io/galiais/shiromail:latest}
    restart: unless-stopped
    environment: *backend-env
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "${FRONTEND_PORT:-80}:80"
      - "${SMTP_PORT:-25}:2525"
    volumes:
      - mail_data:/app/data/mail
    deploy:
      resources:
        limits:
          memory: 512M

  worker:
    image: ${SHIROMAIL_IMAGE:-ghcr.io/galiais/shiromail:latest}
    command: ["shiro-worker"]
    restart: unless-stopped
    environment: *backend-env
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - mail_data:/app/data/mail
    deploy:
      resources:
        limits:
          memory: 512M

volumes:
  mysql_data:
  redis_data:
  mail_data:
COMPOSEFILE

  ok "docker-compose.yml created"
}

start_services() {
  info "Starting ShiroMail..."
  cd "$INSTALL_DIR"

  local compose_cmd="docker compose"
  if ! docker compose version &>/dev/null; then
    compose_cmd="docker-compose"
  fi

  $compose_cmd pull
  $compose_cmd up -d

  info "Waiting for services to be healthy..."
  local retries=30
  while [[ $retries -gt 0 ]]; do
    if $compose_cmd ps | grep -q "healthy"; then
      break
    fi
    sleep 2
    retries=$((retries - 1))
  done

  ok "ShiroMail is running!"
}

print_summary() {
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  ShiroMail installed successfully!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo "  Install directory: $INSTALL_DIR"
  echo ""

  if [[ -n "$DOMAIN" ]]; then
    echo "  Web UI:  https://$DOMAIN"
    echo "  API:     https://$DOMAIN/api/v1"
  else
    echo "  Web UI:  http://localhost"
    echo "  API:     http://localhost/api/v1"
  fi

  echo ""
  echo "  Default admin credentials:"
  echo "    Username: admin"
  echo "    Password: Secret123!"
  echo ""
  echo "  SMTP: port $SMTP_PORT"
  echo ""
  echo -e "  ${YELLOW}Important:${NC}"
  echo "    - Change the default admin password immediately"
  echo "    - Configure DNS MX records to point to this server"
  echo "    - Review $INSTALL_DIR/.env for additional settings"
  echo ""
  echo "  Commands:"
  echo "    cd $INSTALL_DIR"
  echo "    docker compose logs -f     # View logs"
  echo "    docker compose restart     # Restart services"
  echo "    docker compose down        # Stop services"
  echo "    docker compose pull && docker compose up -d  # Upgrade"
  echo ""
}

main() {
  echo ""
  echo -e "${CYAN}ShiroMail Installer v${SHIROMAIL_VERSION}${NC}"
  echo ""

  check_prerequisites
  interactive_prompts

  mkdir -p "$INSTALL_DIR"
  create_env_file
  download_compose
  start_services
  print_summary
}

main
