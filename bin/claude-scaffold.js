#!/usr/bin/env node

import { parseCliArgs, USAGE } from '../src/cli-args.js';

const parsed = parseCliArgs(process.argv.slice(2));

if (parsed.command === 'doctor') {
  const { runDoctor, formatReport } = await import('../src/doctor.js');
  const findings = runDoctor();
  console.log(formatReport(findings));
  process.exit(findings.some((f) => f.status === 'fail') ? 1 : 0);
} else if (parsed.command === 'help') {
  console.log(USAGE);
} else if (parsed.errors.length > 0) {
  console.error(parsed.errors.map((e) => `Error: ${e}`).join('\n'));
  console.error(`\n${USAGE}`);
  process.exit(1);
} else {
  const { run } = await import('../src/index.js');
  run(parsed).catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
