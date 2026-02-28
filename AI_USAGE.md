# AI Usage

## Tooling

This project used Codex only.

- AI tool used: Codex
- MCP servers used: none
- Codex skills used: none
- Other AI agents or coding assistants used: none

## What Codex Was Used For

Codex was used as an implementation assistant inside the repository for tasks such as:

- reading the existing codebase and summarizing architecture decisions
- discussing the document model and layout-engine design
- writing and refactoring TypeScript/React code
- adding or updating tests where needed
- implementing local persistence and refresh recovery
- generating project documentation and chat transcript files

All code generation was done against the local repository context rather than by copying code from external projects.

## Usage Boundaries

- No MCP integrations were used.
- No Figma tooling was used.
- No external skill packs or workflow skills were used.
- No autonomous deployment, hosted backend generation, or third-party code migration tools were used.

## Prompts / Codegen Reliance

Codex was prompted in natural language to help with:

- repository inspection and implementation planning
- document-model and layout-engine design tradeoffs
- editor-state ownership and refactors
- localStorage persistence and refresh restore behavior
- test execution, debugging, and code review
- generation of submission documents

The final implementation decisions, acceptance of generated code, and repository edits were reviewed in-context during development.

## Transparency

Complete Codex chat logs are being provided separately as Markdown transcripts under `docs/chats/`. Those files are the full record of AI-assisted interactions for this project.
