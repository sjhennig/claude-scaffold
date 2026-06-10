# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in claude-scaffold, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please use [GitHub's private vulnerability reporting](https://github.com/sjhennig/claude-scaffold/security/advisories/new) to submit your report.

I'll acknowledge receipt within 48 hours and aim to release a fix within 7 days for critical issues.

## Scope

claude-scaffold is a project scaffolding tool that generates files locally. It does not:

- Run a server or accept network connections
- Process user data beyond the interactive prompts
- Execute generated code (it only writes files)

The primary security concerns for this project are:

- **Supply chain:** ensuring dependencies don't introduce vulnerabilities
- **Generated output:** ensuring scaffolded projects don't contain insecure defaults
- **Secret leakage:** ensuring no credentials end up in the repository

## Known residual risks

The generated devcontainer is the effective isolation layer on most setups (the
inner bubblewrap sandbox is dormant on Docker Desktop). It deliberately shares
your host `~/.claude` credentials and grants the container user passwordless
sudo, so it is **not** a boundary against a malicious dependency. This is an
accepted ergonomics tradeoff and the mitigations are documented in
[`docs/sandbox.md` § Trust model & residual risk](docs/sandbox.md#trust-model--residual-risk).

## Supported Versions

Only the latest release on the `main` branch is supported with security updates.
