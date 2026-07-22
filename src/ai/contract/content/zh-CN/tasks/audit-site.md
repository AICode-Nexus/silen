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

在不修改源文件、不使用模型的前提下识别内容、引用、链接、生产索引、检索和
Agent Contract 问题。

## 步骤

1. 仅在可信本地项目环境中运行完整生产构建。
2. 针对构建产物运行确定性的 AI audit。
3. 如果存在 `.silen/ai-evals.json`，针对生产
   `.silen/dist/search-index.json` 运行 `silen ai eval`。
4. 通过 MCP 操作时使用安全的 build 预检。
5. 检查断链、引用、生产索引失败、检索未命中和契约资源。可选的
   `.silen/ai/index.json` 工作区缓存缺失或过期只作为提示，因为 MCP 搜索仍在
   内存中完成。

## 停止条件

除非用户单独授权维护任务，否则不要修复发现的问题。

## 最终报告

按稳定问题代码、相对路径和建议动作归类发现。AI 评测退出码 `0` 表示通过、`1`
表示检索失败、`2` 表示初始化或配置失败；CI 使用 `--json` 输出。
