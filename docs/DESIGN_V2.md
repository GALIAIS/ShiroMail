# ShiroMail v2 - 系统设计文档

> 版本: 2.0  
> 日期: 2026-05-13  
> 作者: GALIAIS  
> 状态: 设计阶段

---

## 1. 项目定位与差异化

ShiroMail 是一个**自托管的临时邮箱平台**，面向开发者和隐私敏感用户。与市面上同类产品的核心差异:

| 维度 | 竞品 (Mailinator/Guerrilla) | ShiroMail |
|------|---------------------------|-----------|
| 部署方式 | SaaS 或复杂自建 | 单命令 Docker 部署 |
| DNS 管理 | 手动配置 | 内置 DNS 向导 + 多 Provider 适配 |
| 邮件提取 | 无 | 正则引擎自动提取验证码/链接 |
| API 集成 | 有限 | 完整 REST API + Webhook + WebSocket |
| 多租户 | 无 | RBAC + 域名隔离 + API Key 绑定 |
| 可观测性 | 无 | 内置 SMTP 指标 + 审计日志 + 系统监控 |

---

## 2. 当前问题分析

### 2.1 侧边栏导航问题

**问题 1: 导航项过多，缺乏层级**
- 用户侧边栏 14 个一级菜单项，管理员 17 个
- 没有折叠分组，滚动体验差
- 功能关联性不明显 (如 Webhooks 和 Webhook Logs 分离)

**问题 2: 侧边栏邮箱列表固定 3 个**
- 硬编码 `MAX_QUICK_MAILBOXES = 3`
- 无法展开查看更多
- 没有搜索/过滤能力

**问题 3: 移动端侧边栏体验**
- 折叠模式下只显示图标，无法区分相似功能
- 没有手势支持 (滑动展开)

### 2.2 分页组件问题

**问题 1: 功能过于简单**
- 只有上一页/下一页，无法跳转到指定页
- 没有每页条数选择器
- 硬编码中文文案 ("第 X / Y 页")，未走 i18n

**问题 2: 缺少服务端分页统一规范**
- 部分页面用客户端分页 (`paginateItems`)，部分用服务端分页
- 没有统一的 URL 状态同步 (刷新丢失页码)

**问题 3: 大数据量场景**
- 无虚拟滚动集成
- 无无限滚动选项
- 消息列表在邮箱量大时性能差

### 2.3 页面布局问题

**问题 1: 内容区域利用率低**
- `max-w-[1360px]` 在宽屏显示器上两侧大量留白
- 列表页和详情页共用同一宽度约束

**问题 2: 缺少分栏布局**
- 邮件列表没有 master-detail 分栏视图
- 管理员用户详情需要跳转新页面，无法快速预览

**问题 3: 响应式断点不够细**
- 只有 `sm/md/lg` 三档
- 平板竖屏 (768-1024px) 体验差

---

## 3. 优化方案

### 3.1 侧边栏重构

#### 3.1.1 分组折叠导航

将扁平列表改为可折叠的语义分组:

```
用户侧边栏:
├── 概览
│   ├── 仪表盘
│   └── 通知
├── 邮箱 (可折叠)
│   ├── 我的邮箱
│   ├── 收件箱 (快捷入口)
│   └── 提取规则
├── 集成 (可折叠)
│   ├── API 密钥
│   ├── Webhooks
│   └── 文档
├── 域名 (可折叠)
│   ├── 域名管理
│   └── DNS 记录
└── 账户
    ├── 账单
    ├── 余额
    └── 设置
```

```
管理员侧边栏:
├── 概览
│   ├── 总览
│   └── 系统监控
├── 用户管理 (可折叠)
│   ├── 用户列表
│   └── 审计日志
├── 邮件系统 (可折叠)
│   ├── 邮箱
│   ├── 消息
│   ├── 提取规则
│   └── 处理规则
├── 基础设施 (可折叠)
│   ├── 域名
│   ├── DNS
│   ├── 后台任务
│   └── SMTP 指标
├── 开发者 (可折叠)
│   ├── API 密钥
│   ├── Webhooks
│   └── 公告
└── 系统
    ├── 文档
    ├── 账户
    └── 设置
```

#### 3.1.2 侧边栏邮箱面板增强

```typescript
// 改进: 可展开的邮箱快捷面板
type SidebarMailboxPanel = {
  maxCollapsed: 3;        // 折叠时显示 3 个
  maxExpanded: 10;        // 展开时显示 10 个
  showSearch: boolean;    // 超过 5 个时显示搜索
  showCreateButton: true; // 快速创建入口
  sortBy: "unread" | "recent"; // 排序方式
};
```

#### 3.1.3 导航收藏/固定

允许用户将常用页面固定到侧边栏顶部:
- 右键菜单 "固定到侧边栏"
- 最多固定 5 个
- 存储在 localStorage，跨会话保持

### 3.2 分页系统重构

#### 3.2.1 统一分页组件

替换当前简单的 prev/next 按钮为功能完整的分页控件:

```typescript
type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: number[];     // [10, 20, 50, 100]
  showPageSizeSelector?: boolean; // 每页条数选择
  showQuickJumper?: boolean;      // 跳转到指定页
  showTotal?: boolean;            // 显示总数
  syncToURL?: boolean;            // 同步到 URL query params
  onChange: (page: number, pageSize: number) => void;
};
```

功能清单:
- 首页/末页快捷按钮
- 页码数字按钮 (显示当前页附近 5 页 + 省略号)
- 每页条数下拉选择 (10/20/50/100)
- 快速跳转输入框
- URL 状态同步 (`?page=2&pageSize=20`)
- 键盘快捷键 (左右箭头翻页)
- 完整 i18n 支持

#### 3.2.2 URL 状态持久化

所有列表页的筛选条件和分页状态同步到 URL:

```typescript
// 新增 hook: useURLPagination
function useURLPagination(defaults?: { page?: number; pageSize?: number }) {
  // 从 URL searchParams 读取 page/pageSize
  // 变更时更新 URL (replace, 不产生历史记录)
  // 刷新页面后恢复状态
}
```

好处:
- 刷新不丢失当前页码
- 可分享带分页状态的链接
- 浏览器前进/后退正确工作

#### 3.2.3 混合分页策略

根据数据量自动选择最优分页方式:

| 场景 | 策略 | 实现 |
|------|------|------|
| 列表 < 100 条 | 客户端分页 | `paginateItems` + 前端排序 |
| 列表 100-10000 条 | 服务端分页 | API `?page=&pageSize=` |
| 消息流/无限列表 | 游标分页 + 虚拟滚动 | `cursor` + `@tanstack/react-virtual` |
| 搜索结果 | 服务端分页 + 高亮 | Elasticsearch 风格 offset |

### 3.3 页面布局优化

#### 3.3.1 自适应内容宽度

```css
/* 替换固定 max-w-[1360px] */
.workspace-content {
  /* 列表页: 充分利用宽度 */
  &[data-layout="full"] { max-width: 100%; }
  /* 表单/设置页: 适中宽度 */
  &[data-layout="form"] { max-width: 960px; }
  /* 仪表盘: 宽屏友好 */
  &[data-layout="dashboard"] { max-width: 1600px; }
  /* 默认 */
  &[data-layout="default"] { max-width: 1360px; }
}
```

#### 3.3.2 邮件 Master-Detail 分栏

收件箱页面采用左右分栏布局:

```
┌─────────────────────────────────────────────────┐
│ 收件箱 - user@example.com          [搜索] [筛选] │
├──────────────────┬──────────────────────────────┤
│ 邮件列表 (40%)   │ 邮件详情 (60%)               │
│                  │                              │
│ ● 验证码邮件     │  From: noreply@github.com    │
│   GitHub         │  Subject: 验证码 123456      │
│   2 分钟前       │                              │
│                  │  正文内容...                  │
│ ○ 注册确认       │                              │
│   Twitter        │  [提取结果: 123456]          │
│   5 分钟前       │                              │
│                  │  附件: (无)                   │
│ ○ 密码重置       │                              │
│   Discord        │                              │
│   10 分钟前      │                              │
├──────────────────┴──────────────────────────────┤
│ 分页控件                                         │
└─────────────────────────────────────────────────┘
```

- 宽屏 (>1280px): 左右分栏
- 中屏 (768-1280px): 列表全宽，点击进入详情
- 窄屏 (<768px): 纯列表，点击进入详情页

#### 3.3.3 管理员快速预览面板

管理员列表页支持侧滑预览面板 (Sheet):
- 用户列表: 点击行展开用户详情 Sheet
- 邮箱列表: 点击行展开邮箱信息 + 最近消息
- 避免频繁页面跳转

---

## 4. 新增功能设计

### 4.1 邮箱模板系统

**目标**: 让用户快速创建预配置的邮箱

```typescript
type MailboxTemplate = {
  id: string;
  name: string;                    // "GitHub 注册专用"
  localPartPattern: string;        // "gh-{random:6}"
  domainId: number;                // 绑定域名
  ttlHours: number | null;         // null = 永久
  extractorRuleIds: number[];      // 自动绑定提取规则
  webhookIds: number[];            // 自动绑定 Webhook
  autoForward?: string;            // 自动转发地址
  tags: string[];                  // 标签
};
```

用户可以:
- 从模板一键创建邮箱
- 保存当前邮箱配置为模板
- 分享模板 (公开/私有)

### 4.2 邮件搜索增强

**当前**: 基础的 subject/from 搜索  
**目标**: 全文搜索 + 高级筛选

```typescript
type SearchQuery = {
  q: string;                       // 全文关键词
  from?: string;                   // 发件人
  subject?: string;                // 主题
  hasAttachment?: boolean;         // 有附件
  dateRange?: [Date, Date];        // 时间范围
  mailboxId?: number;              // 指定邮箱
  extractedValue?: string;         // 提取结果包含
  isRead?: boolean;                // 已读/未读
  sortBy?: "date" | "relevance";   // 排序
};
```

UI 设计:
- 全局搜索 (Ctrl+K) 支持邮件搜索
- 搜索结果高亮匹配词
- 搜索历史记录 (最近 10 条)
- 保存搜索条件为 "智能文件夹"

### 4.3 邮箱标签与分组

```typescript
type MailboxTag = {
  id: number;
  name: string;
  color: string;    // hex color
  userId: number;
};
```

- 用户可以给邮箱打标签 (如 "工作"、"测试"、"社交")
- 侧边栏按标签分组显示
- 标签筛选器

### 4.4 实时邮件通知增强

当前 WebSocket 只推送通用事件，增强为:

```typescript
type RealtimeEvent =
  | { type: "mail.received"; payload: { mailboxId: number; messageId: number; subject: string; from: string; preview: string } }
  | { type: "mail.extracted"; payload: { mailboxId: number; messageId: number; values: string[] } }
  | { type: "mailbox.expiring"; payload: { mailboxId: number; expiresAt: string; hoursLeft: number } }
  | { type: "domain.verified"; payload: { domainId: number; domain: string } }
  | { type: "webhook.failed"; payload: { webhookId: number; statusCode: number } }
  | { type: "system.announcement"; payload: { title: string; body: string; level: "info" | "warning" } };
```

前端通知行为:
- 浏览器 Notification API (需用户授权)
- 声音提示 (可配置)
- 桌面角标 (未读数)
- Toast 弹窗 (应用内)

### 4.5 批量操作增强

当前批量操作有限，扩展为:

**邮箱批量操作:**
- 批量延期
- 批量释放
- 批量导出配置
- 批量应用模板

**消息批量操作:**
- 批量标记已读/未读
- 批量删除
- 批量导出 (.eml / .mbox)
- 批量提取

**管理员批量操作:**
- 批量封禁/解封用户
- 批量审核域名
- 批量清理过期数据

### 4.6 数据导出与备份

```typescript
type ExportOptions = {
  format: "json" | "csv" | "mbox" | "eml";
  scope: "mailbox" | "all" | "search_result";
  includeAttachments: boolean;
  dateRange?: [Date, Date];
  compression: "none" | "zip" | "tar.gz";
};
```

- 用户可导出自己的邮件数据
- 管理员可导出系统报告
- 支持定时自动备份 (配置 cron)
- 导出任务异步执行，完成后通知下载

### 4.7 API Playground

内置交互式 API 测试工具:
- 类似 Swagger UI 但更轻量
- 自动填充当前用户的 API Key
- 请求/响应实时预览
- 代码生成 (cURL / Python / JavaScript / Go)
- 保存常用请求为收藏

### 4.8 系统健康仪表盘 (管理员)

```typescript
type SystemHealth = {
  uptime: number;
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; percent: number };
  disk: { used: number; total: number; percent: number };
  mysql: { connections: number; slowQueries: number; status: "healthy" | "degraded" };
  redis: { memory: number; connections: number; hitRate: number };
  smtp: { queueSize: number; deliveryRate: number; bounceRate: number };
  workers: { active: number; pending: number; failed: number };
  certificates: { domain: string; expiresAt: string; daysLeft: number }[];
};
```

可视化:
- 实时折线图 (CPU/内存/网络)
- SMTP 吞吐量仪表盘
- 邮件投递成功率
- 队列深度告警

---

## 5. 部署优化

### 5.1 一键部署脚本

创建 `install.sh` 支持多种环境:

```bash
# 最简部署 (适合个人)
curl -fsSL https://raw.githubusercontent.com/galiais/shiromail/main/install.sh | bash

# 交互式安装
curl -fsSL ... | bash -s -- --interactive

# 指定参数
curl -fsSL ... | bash -s -- \
  --domain mail.example.com \
  --smtp-port 25 \
  --admin-password "MySecret123!"
```

脚本功能:
- 检测系统环境 (Docker/Docker Compose 版本)
- 自动安装缺失依赖
- 生成随机 JWT_SECRET
- 配置 Let's Encrypt SSL (可选)
- 创建 systemd service (可选)
- 配置防火墙规则提示
- 输出访问地址和默认凭据

### 5.2 环境配置简化

#### 5.2.1 .env 模板生成器

```bash
# 生成 .env 文件
docker run --rm ghcr.io/galiais/shiromail:latest shiro-api env-init > .env
```

生成内容:
```env
# === ShiroMail Configuration ===
# 生成时间: 2026-05-13T12:00:00Z

# 基础配置
APP_ENV=production
APP_PORT=8080
FRONTEND_PORT=80

# 数据库 (自动生成强密码)
MYSQL_ROOT_PASSWORD=<auto-generated-32-char>
MYSQL_DSN=root:<auto-generated>@tcp(mysql:3306)/shiro_email?parseTime=true

# Redis
REDIS_ADDR=redis:6379
REDIS_PASSWORD=<auto-generated-16-char>

# 安全 (自动生成)
JWT_SECRET=<auto-generated-64-char>
METRICS_TOKEN=<auto-generated-32-char>

# SMTP
SMTP_PORT=25
SMTP_ENABLED=true

# 域名 (必须修改)
SITE_DOMAIN=mail.example.com
CORS_ALLOWED_ORIGINS=https://mail.example.com

# 可选: SSL
SSL_ENABLED=false
SSL_EMAIL=admin@example.com
```

#### 5.2.2 配置验证命令

```bash
docker run --rm --env-file .env ghcr.io/galiais/shiromail:latest shiro-api config-check
```

输出:
```
[OK] JWT_SECRET: 64 characters (strong)
[OK] MYSQL_DSN: connection successful
[OK] REDIS_ADDR: ping successful
[WARN] CORS_ALLOWED_ORIGINS: contains localhost (not recommended for production)
[WARN] SMTP_PORT: 25 requires root or CAP_NET_BIND_SERVICE
[ERR] SITE_DOMAIN: still using default value, please update
```

### 5.3 Docker Compose 增强

#### 5.3.1 生产级 docker-compose.prod.yml

```yaml
# 新增:
# - Traefik 反向代理 + 自动 SSL
# - 自动备份 sidecar
# - 日志收集 (可选 Loki)
# - 健康检查 + 自动重启策略
# - 资源限制合理化

services:
  traefik:
    image: traefik:v3
    command:
      - --providers.docker=true
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.email=${SSL_EMAIL}
      - --certificatesresolvers.letsencrypt.acme.storage=/acme/acme.json
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - acme_data:/acme

  app:
    labels:
      - traefik.enable=true
      - traefik.http.routers.shiromail.rule=Host(`${SITE_DOMAIN}`)
      - traefik.http.routers.shiromail.tls.certresolver=letsencrypt

  backup:
    image: ghcr.io/galiais/shiromail:latest
    command: ["shiro-api", "backup", "--cron", "0 3 * * *"]
    volumes:
      - backup_data:/backups
      - mail_data:/app/data/mail:ro
```

#### 5.3.2 开发环境一键启动

```bash
# 开发模式: 热重载前后端
docker compose -f docker-compose.dev.yml up

# 包含:
# - MySQL + Redis (持久化)
# - Go API (air 热重载)
# - Vite dev server (HMR)
# - Mailpit (本地 SMTP 测试)
```

### 5.4 多平台部署支持

#### 5.4.1 支持的部署目标

| 平台 | 方式 | 复杂度 |
|------|------|--------|
| Docker Compose | 单机部署 | 低 |
| Kubernetes | Helm Chart | 中 |
| Railway/Render | 一键模板 | 低 |
| Fly.io | fly.toml | 低 |
| 裸机 Linux | systemd + nginx | 中 |
| Windows Server | Docker Desktop | 低 |

#### 5.4.2 Helm Chart (Kubernetes)

```bash
helm repo add shiromail https://galiais.github.io/shiromail-charts
helm install my-mail shiromail/shiromail \
  --set domain=mail.example.com \
  --set smtp.enabled=true \
  --set persistence.size=10Gi
```

#### 5.4.3 一键云平台模板

提供 "Deploy to X" 按钮:
- Railway: `railway.json` 模板
- Render: `render.yaml` Blueprint
- Fly.io: `fly.toml` 配置

### 5.5 升级与迁移

#### 5.5.1 无停机升级

```bash
# 拉取新版本
docker compose pull

# 滚动更新 (零停机)
docker compose up -d --no-deps --build app
docker compose up -d --no-deps --build worker
```

#### 5.5.2 数据迁移工具

```bash
# 从其他平台导入
shiro-api migrate --from mailinator --api-key xxx
shiro-api migrate --from guerrilla --db-url xxx

# 版本间迁移 (自动)
shiro-api migrate --auto
```

---

## 6. 技术架构改进

### 6.1 后端改进

#### 6.1.1 API 版本管理

```
/api/v1/...  -- 当前版本 (稳定)
/api/v2/...  -- 下一版本 (实验性)
```

v2 改进:
- 统一响应格式: `{ data, meta, errors }`
- 游标分页: `?cursor=xxx&limit=20`
- 字段选择: `?fields=id,address,status`
- 关联加载: `?include=messages,extractors`

#### 6.1.2 事件总线

替换当前直接调用的 WebSocket 广播为事件总线:

```go
type EventBus interface {
    Publish(ctx context.Context, event Event) error
    Subscribe(topic string, handler EventHandler) Subscription
}

// 支持多种后端:
// - 内存 (单实例)
// - Redis Pub/Sub (多实例)
// - NATS (高吞吐)
```

好处:
- 解耦模块间通信
- 支持水平扩展
- 事件可持久化/重放

#### 6.1.3 插件系统

```go
type Plugin interface {
    Name() string
    Version() string
    Init(ctx PluginContext) error
    Routes() []Route           // 注册额外 API 路由
    Hooks() []Hook             // 注册生命周期钩子
    Shutdown() error
}

// 内置钩子点:
// - BeforeMailReceived
// - AfterMailReceived
// - BeforeMailboxCreated
// - AfterUserRegistered
// - BeforeMailDeleted
```

用例:
- 垃圾邮件过滤插件
- 自定义存储后端 (S3/MinIO)
- 第三方通知 (Telegram/Slack/Discord)
- 自定义认证 (LDAP/SAML)

### 6.2 前端改进

#### 6.2.1 离线支持 (PWA)

```typescript
// Service Worker 策略
const cacheStrategies = {
  api: "network-first",      // API 请求优先网络
  static: "cache-first",     // 静态资源优先缓存
  pages: "stale-while-revalidate", // 页面后台更新
};
```

- 离线时显示缓存的邮件列表
- 网络恢复后自动同步
- 可安装为桌面应用 (PWA)

#### 6.2.2 主题系统增强

当前只有 light/dark，扩展为:

```typescript
type ThemeConfig = {
  mode: "light" | "dark" | "system";
  accent: string;           // 主题色 (用户可选)
  radius: number;           // 圆角大小
  density: "compact" | "default" | "comfortable"; // 信息密度
  font: "system" | "inter" | "jetbrains-mono";    // 字体
};
```

#### 6.2.3 国际化完善

当前: en-US, zh-CN  
扩展: ja-JP, ko-KR, de-DE, fr-FR, es-ES

- 日期/时间本地化
- 数字格式本地化
- RTL 布局支持 (ar-SA)
- 社区贡献翻译机制

---

## 7. 安全增强

### 7.1 新增安全功能

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 登录设备管理 | 查看/踢出活跃会话 | P0 |
| IP 白名单 | API Key 绑定 IP | P0 |
| 速率限制可视化 | 管理员查看限流状态 | P1 |
| 安全日志 | 登录/密码修改/2FA 变更记录 | P1 |
| CSP 报告 | Content-Security-Policy 违规收集 | P2 |
| 邮件内容加密 | 静态加密存储 | P2 |
| 自动封禁 | 异常行为自动封禁 IP | P1 |

### 7.2 API Key 权限细化

当前 scope 粒度:
```
mailboxes:read, mailboxes:write, messages:read, ...
```

增强为资源级别:
```
mailboxes:read:*              -- 所有邮箱
mailboxes:read:123            -- 指定邮箱
messages:read:domain:abc.com  -- 指定域名下的消息
```

---

## 8. 实施路线图

### Phase 1: 基础优化 (2 周)

- [ ] 分页组件重构 (URL 同步 + 页码选择 + i18n)
- [ ] 侧边栏分组折叠
- [ ] 内容区域自适应宽度
- [ ] 邮件 Master-Detail 分栏视图
- [ ] 部署脚本 `install.sh`
- [ ] `.env` 模板生成器

### Phase 2: 功能增强 (3 周)

- [ ] 邮箱模板系统
- [ ] 邮件搜索增强
- [ ] 邮箱标签与分组
- [ ] 批量操作增强
- [ ] 管理员快速预览面板
- [ ] 实时通知增强 (浏览器通知)

### Phase 3: 平台能力 (4 周)

- [ ] API Playground
- [ ] 数据导出与备份
- [ ] 系统健康仪表盘
- [ ] 事件总线 (Redis Pub/Sub)
- [ ] PWA 离线支持
- [ ] Helm Chart

### Phase 4: 生态建设 (持续)

- [ ] 插件系统
- [ ] 社区翻译平台
- [ ] 第三方集成 (Telegram/Slack)
- [ ] API v2
- [ ] 更多云平台模板

---

## 9. 与竞品的技术差异总结

| 特性 | ShiroMail | Mailinator | Guerrilla Mail | TempMail |
|------|-----------|------------|----------------|----------|
| 自托管 | 完整支持 | 不支持 | 部分 | 不支持 |
| 一键部署 | Docker 单命令 | N/A | 手动 | N/A |
| DNS 自动化 | 多 Provider 适配 | 无 | 无 | 无 |
| 邮件提取引擎 | 正则 + 模板 | 无 | 无 | 无 |
| API 完整度 | REST + WS + Webhook | REST | 无 | REST |
| 多语言 | i18n 6+ 语言 | 英文 | 多语言 | 多语言 |
| 2FA/TOTP | 支持 | 无 | 无 | 无 |
| RBAC | 多角色 + API Key scope | 无 | 无 | 无 |
| 审计日志 | 完整操作审计 | 无 | 无 | 无 |
| 插件系统 | Go 插件接口 | 无 | 无 | 无 |
| 实时推送 | WebSocket + 浏览器通知 | 轮询 | 轮询 | 轮询 |
| 邮件存储 | 本地文件 + 可扩展 | 云端 | 本地 | 云端 |
| 开源协议 | MIT | 商业 | MIT | 商业 |

---

## 10. 设计原则

1. **开箱即用**: 零配置启动，合理默认值，渐进式配置
2. **开发者友好**: 完整 API 文档，Playground，多语言 SDK
3. **安全优先**: 默认安全配置，最小权限原则，审计可追溯
4. **可观测**: 结构化日志，指标暴露，健康检查，告警
5. **可扩展**: 插件系统，事件总线，自定义存储后端
6. **国际化**: 完整 i18n，RTL 支持，本地化日期/数字
7. **无障碍**: WCAG 2.1 AA 级别，键盘导航，屏幕阅读器支持

