/**
 * Generates docs/ templates: project-brief.md, architecture.md,
 * api-integration.md (conditional), specs/README.md, specs/_template.md,
 * and the root NOTES.md decisions log.
 */

export function generateProjectBrief(config) {
  return `# Project Brief: ${config.projectName}

## What is this project?

<!-- Describe in 2-3 sentences what this project does and why it exists. -->

## Who is it for?

<!-- Target users or audience. -->

## What's the scope of v1?

Keep this to 3-5 features max. Smaller scope ships faster.

- [ ] Feature 1
- [ ] Feature 2
- [ ] Feature 3

## What's explicitly out of scope for v1?

<!-- List things you will NOT build yet, to prevent scope creep. -->

-

## Key technical decisions

- **Framework:** ${frameworkLabel(config.framework)}
- **Testing:** ${testingLabel(config.framework)}
- **Styling:** TBD

## Open questions

-
`;
}

export function generateArchitecture(config) {
  const externalServices = config.useAnthropicApi
    ? `\n## External Services\n\nSee \`docs/api-integration.md\` for Anthropic API integration details.\n`
    : '';

  return `# Architecture

## Overview

<!-- High-level description of how the system is structured. -->

## Directory Structure

\`\`\`
${directoryTree(config.framework)}
\`\`\`

## Data Model

<!-- Define your core TypeScript interfaces here. -->

\`\`\`typescript
// Example:
// interface User {
//   id: string;
//   name: string;
// }
\`\`\`

## Key Patterns

<!-- Document coding conventions and patterns used in this project. -->
${externalServices}`;
}

export function generateApiIntegration() {
  return `# Anthropic API Integration

## Authentication

The API key is stored in \`.env\` as \`ANTHROPIC_API_KEY\`.
Never commit this file — it's listed in \`.gitignore\`.

## Usage Patterns

<!-- Document your prompt templates and API call patterns here. -->

\`\`\`typescript
// Example:
// const response = await anthropic.messages.create({
//   model: 'claude-sonnet-4-20250514',
//   max_tokens: 1024,
//   messages: [{ role: 'user', content: prompt }],
// });
\`\`\`

## Error Handling

<!-- Document how API errors should be handled (rate limits, timeouts, etc.). -->
`;
}

export function generateSpecsReadme() {
  return `# Feature & Subsystem Specs

This directory holds spec documents — living, AI-maintained descriptions of what
the code is supposed to do. Two kinds live here:

- **Feature specs** — written *before* a feature is built (spec-driven workflow).
- **Subsystem specs** — one per subsystem, kept *alongside* the code as it
  evolves. Copy \`_template.md\` to start one (e.g. \`auth.md\`).

## Spec-Driven Workflow (new features)

1. **Describe** the feature to Claude in a conversation
2. **Ask Claude:** "Ask me hard questions about this feature, then write a spec"
3. **Save** the spec here (e.g., \`user-auth.md\`)
4. **Start a fresh Claude session** to implement — point it at the spec

Writing specs before code forces you to think through edge cases and gives Claude the context it needs to build the right thing.

## Subsystem Specs (the convention)

- **One spec per subsystem**, each naming the exact files it owns and its public
  interface. \`_template.md\` is the starting point.
- **Living documents.** Claude updates the relevant spec — at your direction — as
  part of finishing a change that touches the subsystem. A stale spec is worse
  than no spec, because it makes the agent confidently wrong.
- **High-signal, on-demand.** Specs are read just-in-time (when working on that
  subsystem), not loaded into every session. Keep them file-path-and-parameter
  explicit so they're worth the read.

## Drift detection (keeping specs honest)

A \`SessionStart\` hook (\`.claude/hooks/check-drift.sh\`) can warn when a
subsystem's source changed in recent commits but its spec didn't. It reads an
optional **subsystem→file map** you maintain at \`docs/specs/subsystem-map.json\`:

\`\`\`json
{
  "subsystems": [
    { "name": "auth", "files": ["src/auth.ts"], "spec": "docs/specs/auth.md" }
  ]
}
\`\`\`

The map starts empty (fresh projects have no subsystems) and the hook stays
silent until you add entries. Add a subsystem here once it's worth tracking.
`;
}

export function generateSubsystemSpecTemplate() {
  return `# <Subsystem> Spec

<!--
Living doc — Claude updates this at the author's direction whenever the owning
files change. One spec per subsystem. Copy this file to e.g. docs/specs/auth.md
and register it in docs/specs/subsystem-map.json so drift detection can watch it.
Keep it file-path-and-parameter explicit: it earns its place by being more
precise than re-reading the code.
-->

## Purpose

<!-- One paragraph: what this subsystem is responsible for, and what it is NOT. -->

## Owning files

<!-- The exact files this spec governs, each with a one-line role. -->

- \`src/path/to/file.ts\` — <role>

## Public interface

<!-- Exported functions / types other code depends on, with signatures and the
     meaning of each parameter and return value. -->

\`\`\`
functionName(param: Type) -> ReturnType   // what it does; what each param means
\`\`\`

## Invariants & constraints

<!-- Rules that must always hold (ordering, validation, idempotency, limits). -->

-

## Edge cases

<!-- Inputs/states that need deliberate handling, and the expected behavior. -->

-

## Open decisions

<!-- Unresolved questions or deferred tradeoffs. Move resolved ones to NOTES.md. -->

-
`;
}

export function generateNotesLog() {
  return `# NOTES — decisions log

Long-horizon memory that survives context resets. When a non-obvious decision is
made or reversed — a tradeoff, a constraint discovered, an approach abandoned —
**Claude appends a dated entry here** (at the author's direction). Read this
before starting long-horizon work; it's the cheapest way to avoid re-litigating
settled questions or repeating a dead end.

This is for *decisions and their rationale*, not a task list or a changelog. Keep
entries short and high-signal. Newest at the top.

## Format

\`\`\`
## YYYY-MM-DD — <short title>

**Context** — what prompted the decision.
**Decision** — what was chosen.
**Consequences** — what this commits us to, and what it rules out.
\`\`\`

---

## (example) 2025-01-01 — Seed the decisions log

**Context** — New project; no place to record cross-session decisions yet.
**Decision** — Keep a dated decisions log at \`NOTES.md\` in the repo root.
**Consequences** — Non-obvious choices get written down once and reused; delete
this example entry when you record your first real one.
`;
}

function frameworkLabel(framework) {
  switch (framework) {
    case 'react-vite-ts':
      return 'React + Vite + TypeScript';
    case 'nextjs-ts':
      return 'Next.js + TypeScript';
    case 'node-ts':
      return 'Node + TypeScript';
    case 'none':
      return 'None (guardrails only — choose your stack)';
    default:
      return framework;
  }
}

function testingLabel(framework) {
  switch (framework) {
    case 'react-vite-ts':
    case 'nextjs-ts':
      return 'Vitest + React Testing Library (TDD workflow)';
    case 'node-ts':
    case 'none':
      return 'Vitest (TDD workflow)';
    default:
      return 'Vitest (TDD workflow)';
  }
}

function directoryTree(framework) {
  switch (framework) {
    case 'react-vite-ts':
      return `src/
├── components/   ← Reusable UI components
├── hooks/        ← Custom React hooks
├── utils/        ← Pure utility functions
├── types/        ← Shared TypeScript interfaces
├── assets/       ← Static assets (images, fonts)
├── App.tsx       ← Root component
└── main.tsx      ← Entry point`;
    case 'nextjs-ts':
      return `src/
├── app/          ← Next.js App Router (pages, layouts, API routes)
├── components/   ← Reusable UI components
├── hooks/        ← Custom React hooks
├── utils/        ← Pure utility functions
├── types/        ← Shared TypeScript interfaces
└── assets/       ← Static assets (images, fonts)`;
    case 'node-ts':
      return `src/
├── utils/        ← Pure utility functions
├── types/        ← Shared TypeScript interfaces
└── index.ts      ← Entry point`;
    case 'none':
      return `src/
└── smoke.test.js ← Starter test (add your own code alongside)`;
    default:
      return 'src/';
  }
}
