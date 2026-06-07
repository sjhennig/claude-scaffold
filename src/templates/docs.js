/**
 * Generates docs/ templates: project-brief.md, architecture.md,
 * api-integration.md (conditional), and specs/README.md
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
  return `# Feature Specs

This directory holds spec documents for features before they're built.

## Spec-Driven Workflow

1. **Describe** the feature to Claude in a conversation
2. **Ask Claude:** "Ask me hard questions about this feature, then write a spec"
3. **Save** the spec here (e.g., \`user-auth.md\`)
4. **Start a fresh Claude session** to implement — point it at the spec

Writing specs before code forces you to think through edge cases and gives Claude the context it needs to build the right thing.
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
