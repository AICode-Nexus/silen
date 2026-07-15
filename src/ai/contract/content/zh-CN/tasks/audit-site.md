---
id: audit-site
title: 审计 Silen 知识库
contractVersion: 1
mode: read
requiresExplicitAuthorization: false
references:
  - cli:ai
  - cli:build
  - mcp:build
  - mcp:citations
  - mcp:backlinks
  - artifact:silen-manifest
  - artifact:ai-index
---

# 审计 Silen 知识库

## 目标

在不修改源文件的前提下识别内容、引用、链接、索引和 Agent Contract 问题。

## 步骤

1. 运行确定性的 AI audit。
2. 通过 MCP 操作时使用安全的 build 预检。
3. 检查断链、引用、过期索引和契约资源。
4. 仅在可信本地项目环境中运行完整生产构建。

## 停止条件

除非用户单独授权维护任务，否则不要修复发现的问题。

## 最终报告

按稳定问题代码、相对路径和建议动作归类发现。
