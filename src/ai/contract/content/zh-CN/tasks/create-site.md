---
id: create-site
title: 创建 Silen 知识库
contractVersion: 1
mode: write
requiresExplicitAuthorization: true
references:
  - config:title
  - config:description
  - config:lang
  - config:base
  - config:ai
  - cli:dev
  - cli:init
  - cli:build
  - cli:ai
---

# 创建 Silen 知识库

## 目标

使用已安装的 Silen 包创建最小可构建站点。

## 步骤

1. 确认内容根目录以及用户已授权创建文件。
2. 运行 `pnpm silen init <root>`，以碰撞安全的方式创建起始文件。
3. 扩展内容层级前先检查 .silen/config.ts 和 index.mdx。
4. 保持普通 Markdown 或 MDX 为事实源。
5. 只有需要交互预览时才启动开发服务。

## 验证

1. 运行 pnpm silen ai audit，并传入内容根目录。
2. 运行 pnpm silen build，并传入内容根目录。
3. 检查 Git diff 和生成的契约 URL。

## 停止条件

遇到未知配置、审计失败、构建失败或越权路径时停止。

## 最终报告

列出创建文件、构建输出、验证结果和剩余部署步骤。
