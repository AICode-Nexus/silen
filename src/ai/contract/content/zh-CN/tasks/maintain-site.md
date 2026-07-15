---
id: maintain-site
title: 维护现有 Silen 知识库
contractVersion: 1
mode: write
requiresExplicitAuthorization: true
references:
  - mcp:guide
  - mcp:list
  - mcp:search
  - mcp:read
  - mcp:backlinks
  - mcp:citations
  - mcp:write
  - mcp:link
  - mcp:append
  - cli:ai
  - cli:build
---

# 维护现有 Silen 知识库

## 目标

完成有边界、可审查，并经过链接和构建验证的文档修改。

## 步骤

1. 使用只读 MCP 工具定位相关页面和依赖。
2. 确认服务已经暴露写工具，且用户授权了本次修改。
3. 使用范围最小的匹配写操作。
4. 重新读取修改页面，并检查受影响的反向链接或引用。

## 验证

1. 运行 pnpm silen ai audit，并传入内容根目录。
2. 运行 pnpm silen build，并传入内容根目录。
3. 检查 Git diff；没有单独授权时不得提交或部署。

## 停止条件

写工具不存在、路径越过内容根目录，或审计、构建失败时停止。

## 最终报告

报告修改文件、检查结果、警告和未提交 diff 状态。
