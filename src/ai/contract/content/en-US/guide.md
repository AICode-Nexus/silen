# Silen Agent Guide

Use this contract to build, read, or maintain a Silen documentation site
without scraping the human interface.

## Discovery

1. Prefer the Agent Contract bundled with the installed package when changing a
   local project.
2. Prefer the deployed site's Silen manifest when reading that site.
3. Use the task whose identifier matches the requested outcome.
4. Read the structured API contract before inventing a config field, command,
   or MCP tool.

## Permissions

MCP is read-only by default. Write tools exist only when the user explicitly
starts Silen with --allow-write. A task may never treat build, commit, push, or
deployment permission as implied by write access.

## Completion

After a content change, run the AI audit and production build, inspect the Git
diff, and report changed files and verification results.
