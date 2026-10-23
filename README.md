# 学习资料平台

基于 **Cloudflare Pages + Pages Functions + R2 + D1** 的在线学习资料预览与管理平台。

## 角色

| 角色 | 权限 |
|---|---|
| 管理员 | 全部功能：文件/用户/科目/权限管理，批量创建用户 |
| 老师 | 上传文件到自己被分配的科目，控制文件是否对学生开放 |
| 学生 | 浏览并预览老师已开放（published）的文件 |

文件按 **科目 → 老师 → 文件** 归类，支持在线预览 Markdown / PPTX / DOCX / 图片。

## 本地开发

```bash
npm install
npm run dev
```

## 创建 Cloudflare 资源

```bash
# R2 桶
wrangler r2 bucket create YOUR_R2_BUCKET_NAME

# D1 数据库（记下输出的 database_id）
wrangler d1 create YOUR_D1_DATABASE_NAME

# 初始化 schema
wrangler d1 execute YOUR_D1_DATABASE_NAME --file=./schema.sql
```

将得到的名称/ID 填入 `wrangler.toml`。

## 生成管理员密码哈希

```bash
node scripts/hash-password.mjs 你的密码
# 输出形如 pbkdf2$100000$xxxx$yyyy
```

**切勿将明文密码或哈希提交到仓库**，仅配置到 Cloudflare Pages 环境变量。

## Cloudflare Pages 环境变量

| 变量 | 说明 |
|---|---|
| `ADMIN_USERNAME` | 初始管理员用户名 |
| `ADMIN_PASSWORD_HASH` | 上一步生成的 PBKDF2 哈希 |
| `SESSION_SECRET` | 32 字节以上随机字符串（如 `openssl rand -hex 32`） |

## GitHub Secrets

在仓库 Settings → Secrets → Actions 配置：

- `CLOUDFLARE_API_TOKEN`：需要 **Pages Edit + R2 Edit + D1 Edit** 权限的 API Token
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID

## 部署

1. 全局替换 `YOUR_PROJECT_NAME`（`wrangler.toml` 与 `.github/workflows/deploy.yml`）
2. 推送到 `main` 分支，GitHub Actions 自动构建并部署到 Cloudflare Pages

## 首次使用

1. 用 `ADMIN_USERNAME` / 管理员密码登录，进入 `/admin`
2. 「用户管理 → 批量创建」创建老师/学生账号（勾选角色与科目），系统生成一次性随机密码
3. 「科目管理」创建或调整科目
4. 老师登录 `/teacher`：选择科目上传文件，用开关控制是否对学生开放

## 安全说明

- 前端隐藏按钮**不是安全边界**；所有写接口在服务端逐请求校验（登录 → 角色 → 资源归属）
- R2 key 只由服务端生成，禁止信任前端路径
- 老师只能上传到被分配的科目，只能管理自己上传的文件
- 学生只能查看 `published` 文件；`/api/file` 与 `/api/manifest` 双处独立校验
- 管理员不能禁用、降级或删除自己
- 批量创建的初始密码只返回一次，D1 只存 PBKDF2 哈希，日志不打印密码
- 科目有文件引用时禁止删除（409）
- Cookie 为 `HttpOnly; Secure; SameSite=Strict`，会话 8 小时过期
- PBKDF2-SHA256 100000 次迭代 + 恒定时间比较；登录失败延迟 500ms 防爆破

## 设计原则

本项目刻意保持克制（参考 Linear / Notion / Vercel Dashboard 气质），避免：

- ❌ 大面积渐变背景、玻璃拟态、霓虹发光
- ❌ 超过一个强调色的装饰性配色（全站唯一强调色 indigo，成功/警告/危险仅用于状态反馈）
- ❌ 无意义插画、Emoji 当图标、图标风格混用（仅 lucide 线性图标）
- ❌ 重阴影、每个卡片都浮起来
- ❌ 全屏 loading spinner（用骨架屏）、动画满天飞
- ❌ 花哨的 hover 位移超过 2px、弹跳缓动
- ❌ 组件库默认皮肤直接上（全部按统一规范用 Tailwind 手写）

**为什么**：教育工具的核心是内容与效率。克制的视觉让注意力回到资料本身，也让界面在长期使用中不易过时——「像个正经产品，而不是模板或作业」。

## 技术栈

React 18 · TypeScript · Vite · Tailwind CSS · react-router-dom · lucide-react · `@lamberl-lee/file-preview`（docx-preview / @aiden0z/pptx-renderer / markdown-it） · Cloudflare Pages Functions · R2 · D1
