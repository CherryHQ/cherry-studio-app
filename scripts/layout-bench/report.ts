/**
 * 产物写盘：结构化 results.json（给 A/B 对比与后续工具消费）+ 人读的 summary.md。
 *
 * 两份都留：只给 markdown 的话，跨轮对比只能靠肉眼；只给 json 的话，看一眼结论都要写脚本。
 */

import * as fs from 'fs';
import * as path from 'path';

import type { JudgeReport, Violation } from './judges';

export type KnownIssue = {
  /** 匹配 judge 名；留空表示该场景的所有判据。 */
  judge?: string;
  reason: string;
  scenario: string;
};

export type ScenarioResult = {
  checkpoints: string[];
  description: string;
  durationMs: number;
  judges: JudgeReport[];
  knownViolations: Array<Violation & { reason: string }>;
  probeEvents: number;
  scenario: string;
  violations: Violation[];
};

export type RunResult = {
  scenarios: ScenarioResult[];
  startedAt: string;
  udid: string;
};

export function partitionViolations(
  judges: JudgeReport[],
  scenario: string,
  knownIssues: KnownIssue[],
): Pick<ScenarioResult, 'knownViolations' | 'violations'> {
  const violations: Violation[] = [];
  const knownViolations: Array<Violation & { reason: string }> = [];

  for (const report of judges) {
    for (const violation of report.violations) {
      const known = knownIssues.find(
        (issue) =>
          issue.scenario === scenario &&
          (issue.judge === undefined || issue.judge === report.judge),
      );

      if (known) {
        knownViolations.push({ ...violation, reason: known.reason });
      } else {
        violations.push(violation);
      }
    }
  }

  return { knownViolations, violations };
}

export function loadKnownIssues(file: string): KnownIssue[] {
  if (!fs.existsSync(file)) {
    return [];
  }

  return JSON.parse(fs.readFileSync(file, 'utf8')) as KnownIssue[];
}

function formatViolation(violation: Violation): string {
  const detail = Object.entries(violation.detail)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ');
  return `  - \`+${(violation.atMs / 1000).toFixed(2)}s\` [${violation.phase}] ${violation.message}${detail ? ` (${detail})` : ''}`;
}

export function renderSummary(run: RunResult): string {
  const lines: string[] = [
    '# 布局基准结果',
    '',
    `- 模拟器：\`${run.udid}\``,
    `- 开始于：${run.startedAt}`,
    '',
  ];

  const total = run.scenarios.reduce((sum, scenario) => sum + scenario.violations.length, 0);
  lines.push(total === 0 ? '**全部判据通过。**' : `**${total} 条未白名单的违规。**`, '');

  for (const scenario of run.scenarios) {
    lines.push(`## ${scenario.scenario}`, '', scenario.description, '');
    lines.push(
      `探针事件 ${scenario.probeEvents} 条，耗时 ${(scenario.durationMs / 1000).toFixed(1)}s，检查点 ${scenario.checkpoints.length} 个。`,
      '',
    );

    lines.push('| 判据 | 违规 | 指标 |', '| --- | --- | --- |');
    for (const judge of scenario.judges) {
      const metrics = Object.entries(judge.metrics)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
      lines.push(`| ${judge.judge} | ${judge.violations.length} | ${metrics || '—'} |`);
    }
    lines.push('');

    if (scenario.violations.length > 0) {
      lines.push('### 违规', '');
      scenario.violations.forEach((violation) => lines.push(formatViolation(violation)));
      lines.push('');
    }

    if (scenario.knownViolations.length > 0) {
      lines.push('### 已知问题（白名单）', '');
      scenario.knownViolations.forEach((violation) =>
        lines.push(`${formatViolation(violation)} — ${violation.reason}`),
      );
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function writeRun(outputDir: string, run: RunResult): void {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'results.json'), `${JSON.stringify(run, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'summary.md'), `${renderSummary(run)}\n`);
}
