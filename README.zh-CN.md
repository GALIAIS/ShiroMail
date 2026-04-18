# ShiroMail

<p align="center">
  <img src="frontend/public/shiromail-mark.svg" alt="ShiroMail logo" width="96" height="96" />
</p>

<p align="center">
  一个集临时邮箱、真实 SMTP 收件、域名管理、API Key 与管理后台于一体的完整系统。
</p>

<p align="center">
  <a href="./README.md">English</a>
</p>

## 项目简介

ShiroMail 是一个基于 Go、Gin、React、MySQL 与 Redis 的临时邮箱平台。它支持私有/公共域名池、邮箱生命周期管理、真实 SMTP 入站收件、邮件解析、提取规则、API Key 自动化调用，以及面向运营的管理后台。

## 核心能力

- 临时邮箱的创建、续期、释放与消息查看
- 真实 SMTP 收件，原始 EML 保存与结构化邮件展示
- 域名接入、DNS 服务商绑定、验证、变更预览与应用
- 用户侧 API Key、Webhook、提取规则、账户设置
- 管理员侧用户、域名、邮箱、系统设置、公告、文档、审计管理
- 面向自动化的公开 API：邮箱、消息、域名、提取结果等

## 技术架构

- 前端：React 19、Vite、TypeScript、TanStack Query、React Router、Zustand
- 后端：Go 1.24、Gin、GORM
- 数据层：MySQL 8.4、Redis 7
- 收件链路：API 进程内置 SMTP Server
- 部署形态：单应用镜像 + MySQL + Redis 的 Docker Compose 结构

## 仓库结构

```text
backend/   Go API、SMTP 收件、业务服务、仓储层、测试
frontend/  React 前端、管理后台、公开站点
docker/    容器启动脚本
scripts/   本地开发与重置辅助脚本
docs/      项目文档资源
```

## 快速开始

### Docker Compose 部署

```bash
cp .env.example .env
docker compose up -d
```

默认入口：

- Web 界面：`http://127.0.0.1:5173`
- SMTP 收件：宿主机默认端口 `25`，映射到容器内 `2525`

停止服务：

```bash
docker compose down
```

### 本地开发

后端：

```bash
cd backend
go run ./cmd/api
```

前端：

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

## 配置说明

`.env` 主要负责进程与基础设施启动参数，例如 MySQL、Redis、JWT、对外暴露端口等。

SMTP 相关需要特别注意：

- 运行时 SMTP 监听配置来自 MySQL 中的系统设置，而不是固定写死在容器环境变量里。
- `docker-compose.yml` 默认将宿主机 `25` 映射到容器内 `2525`。
- 请在管理后台里配置 `mail.smtp` 对应的启用状态、监听地址、Hostname / MX Target、最大邮件大小等参数。
- SMTP 测试发信失败时，接口会返回结构化诊断字段：`stage`、`code`、`hint`、`retryable`，同时也会写入管理员审计日志，方便后续排障。
- 当前内置的诊断码包括：`connect_failed`、`starttls_unavailable`、`tls_certificate_invalid`、`auth_unavailable`、`sender_rejected`、`recipient_rejected`、`data_failed`、`quit_failed`、`timeout`。

典型公网收件 DNS 结构：

```dns
example.com.       MX   10 smtp.example.com.
smtp.example.com.  A    <你的公网 IP>
```

## API 能力

ShiroMail 已提供较完整的接口，覆盖：

- 认证与账户流程
- 域名与 DNS 操作
- 邮箱生命周期与消息访问
- 提取结果、API Key、Webhook 与管理员接口

启动后可直接在站内文档页查看当前版本的接口说明。

## 校验命令

后端：

```bash
cd backend
go test ./...
```

前端构建：

```bash
cd frontend
npm run build
```

前端测试：

```bash
cd frontend
npm run test
```

## 部署说明

- `docker-compose.yml` 默认拉取 `ghcr.io/galiais/shiromail:latest`
- Compose 内仍保留本地构建段落作为注释 fallback
- MySQL 与 Redis 默认仅在 Compose 网络内使用，不对外暴露
- 邮件原始数据保存在挂载到 `/app/data/mail` 的命名卷中

## 致谢

本项目已在 [LINUX DO 社区](https://linux.do) 发布，感谢社区的支持与反馈。

## 参考项目

本项目也参考了 [Inbucket](https://github.com/inbucket/inbucket) 这一开源临时邮箱 / 邮件测试项目。

## 说明

这是一个持续迭代中的应用仓库。如果要用于公网环境，请先审查默认配置、鉴权策略、域名与 SMTP 部署方式后再上线。
