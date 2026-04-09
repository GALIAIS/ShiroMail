# ShiroMail

<p align="center">
  <img src="frontend/public/shiromail-mark.svg" alt="ShiroMail logo" width="96" height="96" />
</p>

<p align="center">
  Temporary mailboxes, real SMTP ingest, domain management, API keys, and an admin console in one stack.
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a>
</p>

## Overview

ShiroMail is a full-stack temporary email platform built with Go, Gin, React, and MySQL/Redis. It supports public or private domain pools, mailbox lifecycle management, real inbound SMTP, message parsing, extraction rules, API key access, and an operator-facing admin console.

## Core Capabilities

- Temporary mailbox creation, extension, release, and message browsing
- Real SMTP ingest with raw EML storage and parsed message views
- Domain onboarding, DNS provider integration, verification, and change-set preview/apply
- User-managed API keys, webhooks, extraction rules, and account settings
- Admin console for users, domains, mailboxes, system settings, notices, docs, and audits
- Public API for mailboxes, messages, domains, and API-key based automation

## Architecture

- Frontend: React 19, Vite, TypeScript, TanStack Query, React Router, Zustand
- Backend: Go 1.24, Gin, GORM
- Data: MySQL 8.4, Redis 7
- Delivery path: embedded SMTP server inside the API container/process
- Deployment: single app image plus MySQL and Redis via Docker Compose

## Repository Layout

```text
backend/   Go API, SMTP ingest, services, repositories, tests
frontend/  React application, admin console, public site
docker/    container entry scripts
scripts/   local development and reset helpers
docs/      project documentation assets
```

## Quick Start

### Docker Compose

```bash
cp .env.example .env
docker compose up -d
```

Default endpoints:

- Web UI: `http://127.0.0.1:5173`
- SMTP ingress (host): `25` by default, mapped to container `2525`

To stop the stack:

```bash
docker compose down
```

### Local Development

Backend:

```bash
cd backend
go run ./cmd/api
```

Frontend:

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

## Configuration Notes

Environment variables in `.env` are used for process/bootstrap concerns such as MySQL, Redis, JWT, and exposed ports.

Important SMTP detail:

- The runtime SMTP listener configuration is read from MySQL-backed system settings, not from static container environment variables.
- The compose file exposes host port `25` to container port `2525` by default.
- In the admin panel, configure `mail.smtp` settings such as enable/disable, listen address, hostname, and max message size.
- SMTP delivery test failures now return structured diagnostics (`stage`, `code`, `hint`, `retryable`) and are also written into admin audit logs for later troubleshooting.
- Current diagnostic codes include `connect_failed`, `starttls_unavailable`, `tls_certificate_invalid`, `auth_unavailable`, `sender_rejected`, `recipient_rejected`, `data_failed`, `quit_failed`, and `timeout`.

Typical public inbound DNS shape:

```dns
example.com.    MX   10 smtp.example.com.
smtp.example.com. A  <public-ip>
```

## API Surface

ShiroMail exposes documented endpoints for:

- authentication and account flows
- domains and DNS operations
- mailbox lifecycle and message access
- extraction results, API keys, webhooks, and admin operations

See the in-app docs page after startup for the current route list and request model.

## Verification

Backend:

```bash
cd backend
go test ./...
```

Frontend build:

```bash
cd frontend
npm run build
```

Frontend tests:

```bash
cd frontend
npm run test
```

## Deployment Notes

- `docker-compose.yml` pulls `ghcr.io/galiais/shiromail:latest` by default.
- The local image build stanza is kept in the compose file as commented fallback.
- MySQL and Redis stay internal to the compose network unless you choose to publish them.
- Mail data persists in the named volume mounted at `/app/data/mail`.

## Acknowledgements

This project has been published on the [LINUX DO community](https://linux.do), and we appreciate the community's support and feedback.

## License / Status

This repository is an actively evolving application codebase. Review configuration and operational defaults before using it in a public environment.
