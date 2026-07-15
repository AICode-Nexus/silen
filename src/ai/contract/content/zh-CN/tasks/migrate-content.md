---
id: migrate-content
title: 将 Markdown 内容迁移到 Silen
contractVersion: 1
mode: write
requiresExplicitAuthorization: true
references:
  - config:title
  - config:description
  - config:lang
  - config:base
  - cli:build
  - cli:ai
---

# 将 Markdown 内容迁移到 Silen

## 目标

把现有 Markdown 或可信 MDX 内容迁入 Silen，不虚构尚未支持的导入器。

## 步骤

1. 清点 Markdown、MDX、公开资源、内部链接和语言根目录。
2. 尽可能保留源文本和文件历史。
3. 只添加有效构建所需的 Silen 配置与路由调整。
4. 使用标准 Markdown 路径修复链接。
5. 显式标记私有、草稿或不应提供给 AI 的页面。

## 验证

1. 运行 pnpm silen ai audit，并传入内容根目录。
2. 运行 pnpm silen build，并传入内容根目录。
3. 对比源内容与迁移内容数量，并检查 Git diff。

## 停止条件

源内容需要未支持的二进制导入、包含不可信可执行 MDX 或存在归属决策时停止。

## 最终报告

报告迁移文件、排除项、修复链接和验证结果。
