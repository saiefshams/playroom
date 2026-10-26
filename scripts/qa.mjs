import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), {
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    })
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

function vitestRows(file) {
  if (!existsSync(file)) return []
  const report = JSON.parse(readFileSync(file, 'utf8'))
  const rows = []
  for (const fileResult of report.testResults ?? []) {
    for (const assertion of fileResult.assertionResults ?? []) {
      rows.push({
        name: assertion.fullName || assertion.title,
        status: assertion.status,
        duration: assertion.duration ?? 0,
      })
    }
  }
  return {
    rows,
    passed: report.numPassedTests ?? rows.filter((row) => row.status === 'passed').length,
    failed: report.numFailedTests ?? rows.filter((row) => row.status === 'failed').length,
    total: report.numTotalTests ?? rows.length,
  }
}

function walkPlaywright(suite, rows) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const result = test.results?.[0]
      rows.push({
        name: `${suite.title} ${spec.title}`.trim(),
        status: test.status || result?.status || 'unknown',
        duration: result?.duration ?? 0,
      })
    }
  }
  for (const child of suite.suites ?? []) walkPlaywright(child, rows)
}

function playwrightRows(file) {
  if (!existsSync(file)) return { rows: [], passed: 0, failed: 0, total: 0 }
  const report = JSON.parse(readFileSync(file, 'utf8'))
  const rows = []
  for (const suite of report.suites ?? []) walkPlaywright(suite, rows)
  const failed = rows.filter((row) => row.status !== 'expected' && row.status !== 'passed').length
  return { rows, passed: rows.length - failed, failed, total: rows.length }
}

const vitestCode = await run(['npx', 'vitest', 'run', '--reporter=json', '--outputFile=qa-vitest.json', '--reporter=default'])
const playwrightCode = await run(['npx', 'playwright', 'test'], { QA_REPORT: '1' })
const unit = vitestRows('qa-vitest.json')
const browser = playwrightRows('qa-playwright.json')
const ok = vitestCode === 0 && playwrightCode === 0

const lines = [
  '# Playroom QA report',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  `Result: **${ok ? 'PASS' : 'FAIL'}**`,
  '',
  '## What this covers',
  '',
  '- Rules: Connect 4 lines, draws, illegal drops, chess castling, en passant, promotion, mate, stalemate.',
  '- Bots: Connect 4 takes a win and blocks; chess finds mate in one and stays inside a time budget.',
  '- Rooms: seats, watchers, CPU moves, clocks, reconnect grace, resign, rematch, chat, ribbon trails.',
  '- Stress: 300 connect-4 rooms opened, moved, and closed in one process.',
  '- Sockets: two players plus a watcher, reconnect, ribbon frames, 24 parallel rooms, create limit.',
  '- Browser: phone and desktop lobby, connect 4 with a watcher, chess clocks, CPU reply, Ribbon Rally cursor follow.',
  '',
  `## Automated tests`,
  '',
  `| Suite | Passed | Failed | Total |`,
  `| --- | ---: | ---: | ---: |`,
  `| Unit, rooms, sockets | ${unit.passed} | ${unit.failed} | ${unit.total} |`,
  `| Browser | ${browser.passed} | ${browser.failed} | ${browser.total} |`,
  '',
]

const failures = [...unit.rows, ...browser.rows].filter((row) => !['passed', 'expected'].includes(row.status))
if (failures.length) {
  lines.push('## Failures', '')
  for (const failure of failures) lines.push(`- ${failure.status}: ${failure.name}`)
  lines.push('')
}

lines.push('## Slowest checks', '')
const slow = [...unit.rows, ...browser.rows].sort((a, b) => b.duration - a.duration).slice(0, 8)
for (const row of slow) lines.push(`- ${row.name}: ${Math.round(row.duration)}ms`)
lines.push('')

writeFileSync('qa-report.md', `${lines.join('\n')}\n`)
console.log(`\nQA report written to qa-report.md (${ok ? 'PASS' : 'FAIL'})`)
process.exit(ok ? 0 : 1)
