# Silen official Agent instructions

Use `@aicode-nexus/silen/agent/manifest.json` as the source of truth for the
installed Silen version. Use `/silen/.well-known/silen/manifest.json` as the
source of truth for this deployed official site.

Start read-only. Local MCP write tools are available only after the user
explicitly starts the server with `--allow-write`; build, commit, push, and
deployment require their own authorization. If a client does not support this
contract schema version, fall back to the public Markdown resources and remain
read-only.

For Chinese tasks, select the `zh-CN` guide and task resources with the same
task ids.

## Silen 官方 Agent 指令

操作本地项目时，以已安装版本中的
`@aicode-nexus/silen/agent/manifest.json` 为准；读取当前官方站点时，以
`/silen/.well-known/silen/manifest.json` 为准。

默认保持只读。只有用户显式使用 `--allow-write` 启动本地 MCP 后，写工具才会
出现；构建、提交、推送和部署仍需要分别授权。如果客户端不支持当前契约版本，
请退回公开 Markdown 资源，并继续保持只读。
