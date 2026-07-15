---
id: deploy-site
title: 准备 Silen 部署产物
contractVersion: 1
mode: write
requiresExplicitAuthorization: true
references:
  - cli:build
  - cli:preview
  - cli:ai
  - artifact:silen-manifest
  - artifact:llms
---

# 准备 Silen 部署产物

## 目标

生成并验证与托管平台无关的静态产物；本任务不授权外部部署。

## 步骤

1. 确认目标 base 路径和输出目录。
2. 运行 AI audit 和生产构建。
3. 预览构建产物，验证代表性的 HTML、Markdown、llms 和 manifest URL。
4. 检查产物中是否包含本地路径或密钥。

## 验证

1. 确认配置 base 下的预览请求成功。
2. 确认 Git diff 只包含预期源文件修改。
3. 报告输出目录和托管要求。

## 停止条件

没有针对该部署动作的单独授权时，在上传、推送或修改托管平台前停止。

## 最终报告

报告已验证产物、base 路径、检查结果和剩余托管动作。
