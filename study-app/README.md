# 学习资料平台 · 安卓客户端

复用错题本（wrongbook）工程框架的 Flutter 客户端：Riverpod + Dio + go_router，Cookie 会话。

## 功能

- 登录（管理员 / 老师 / 学生，按角色跳转）
- 首页科目卡片（含已开放文件数）
- 科目页：按老师分组的文件列表
- 预览：Markdown 渲染、图片缩放查看；PPT/Word 通过系统应用打开
- 老师工作台：选科目上传（支持多选、中文文件名）、开放开关、改标题、删除
- 服务器地址可配置：预设局域网直连与公网域名

## 工程结构（与错题本一致）

```
app/
  lib/
    core/       config / api_client(Dio+CookieJar) / router / theme
    models/     SessionUser / Subject / FileItem
    services/   platform_service.dart（全部业务接口）
    providers/  auth_provider / files_provider
    pages/      splash / login / server_config / home / subject / preview / teacher
    utils/      format
android/        AndroidManifest + network_security_config（局域网明文白名单）
ci/             patch_sdk_versions.py / disable_minify.py（复用错题本）
.github/workflows/build-apk.yml   push 自动编译 APK 并发 Release
```

## 构建与下载

- push 到 `main` 自动触发 Actions 编译 release APK
- 固定下载地址：`https://github.com/<owner>/<repo>/releases/latest/download/study-app-latest.apk`

## 后端

对应服务端为 `study-materials-platform`（Node + SQLite 本地自托管，API 契约见其 README）。
