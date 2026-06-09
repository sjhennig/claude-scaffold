#!/usr/bin/env node

const command = process.argv[2];

if (command === 'doctor') {
  const { runDoctor, formatReport } = await import('../src/doctor.js');
  const findings = runDoctor();
  console.log(formatReport(findings));
  process.exit(findings.some((f) => f.status === 'fail') ? 1 : 0);
} else if (command !== undefined) {
  console.error(
    `Unknown command: ${command}\nUsage: claude-scaffold          scaffold a new project\n       claude-scaffold doctor   check Claude Code + guardrail config health`,
  );
  process.exit(1);
} else {
  const { run } = await import('../src/index.js');
  run().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
