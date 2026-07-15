---
id: read-site
title: 读取已部署的 Silen 站点
contractVersion: 1
mode: read
requiresExplicitAuthorization: false
references:
  - artifact:silen-manifest
  - artifact:llms
  - artifact:markdown-routes
  - artifact:ai-index
  - mcp:list
  - mcp:search
  - mcp:read
---

# 读取已部署的 Silen 站点

## 目标

从 Silen 的规范内容中回答问题，并保留来源链接。

## 步骤

1. 优先读取 Silen manifest。
2. 根据上下文规模选择 llms.txt、干净 Markdown 页面或 AI 索引。
3. 本地 MCP 可用时，先 list 或 search，再读取有限范围。
4. 引用公开规范页面 URL，不引用本地文件路径。

## 停止条件

如果不支持 manifest Schema，只保持只读，并退回 llms.txt 和 Markdown。

## 最终报告

给出答案、规范来源，以及契约或新鲜度限制。
