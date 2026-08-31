#!/usr/bin/env node
// Spec9 CLI entry point. The engine does not assume where the product
// specification lives: roots are explicit or discovered from cwd.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadRepo, buildGraph } from './graph.mjs';
import { lint, formatFinding } from './lint.mjs';
import { contextSlice, reviewSlice, why } from './slice.mjs';
import { cmdOutcomes } from './outcomes-cmd.mjs';
import { cmdCandidates } from './candidates-cmd.mjs';
import { formatFlow } from './flow.mjs';
import { draftPage } from './draft.mjs';
import { buildTrace, formatTrace } from './trace.mjs';
import { decisionReport, formatDecisionReport } from './decision.mjs';
import { buildDoctorReport, formatDoctorReport } from './doctor.mjs';
import { auditE2E, formatE2EAudit } from './e2e-audit.mjs';
import { buildReviewImpact, formatReviewImpact } from './review-impact.mjs';
import { buildOpenSpecCoverage, formatOpenSpecCoverage } from './openspec-coverage.mjs';
import { buildQualityReport, formatQualityReport } from './quality.mjs';
import { buildNextQueue, formatNextQueue } from './next.mjs';
import { buildChangeReport, formatChangeReport } from './change.mjs';
import { loadRepoAtGitRef, changedFilesBetween } from './git-snapshot.mjs';
import { buildSemanticReview, formatSemanticReview } from './semantic-review.mjs';

// CLI output must survive `| head`, `| grep`, and any consumer that closes the
// pipe before all output is written. Without an stdout error handler, a closed
// pipe raises an unhandled EPIPE. Absorb only EPIPE and let the process finish
// naturally so asynchronous pipe writes are not truncated.
process.stdout.on('error', (err) => {
  if (err && err.code === 'EPIPE') return;
  throw err;
});

let SPEC9_ROOT;
let PRODUCT_ROOT;

function takeOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) usage();
  args.splice(index, 2);
  return value;
}

function resolveRoots(argv) {
  const args = [...argv];
  const explicitSpec = takeOption(args, '--spec-root') || process.env.SPEC9_SPEC_ROOT;
  let specRoot;
  if (explicitSpec) specRoot = path.resolve(explicitSpec);
  else if (fs.existsSync(path.join(process.cwd(), 'profile.yaml'))) specRoot = process.cwd();
  else if (fs.existsSync(path.join(process.cwd(), 'spec9', 'profile.yaml'))) specRoot = path.join(process.cwd(), 'spec9');
  else usage();

  const explicitProduct = takeOption(args, '--product-root') || process.env.SPEC9_PRODUCT_ROOT;
  const productRoot = path.resolve(explicitProduct || path.dirname(specRoot));
  return { args, specRoot: path.resolve(specRoot), productRoot };
}

/**
 * A control-flow signal for displaying usage and exiting with code 2.
 * `usage()` never returns to its caller. The top-level handler catches it so
 * stdout and stderr can flush before the process exits.
 */
class UsageSignal extends Error {}

/**
 * Prints CLI usage and throws {@link UsageSignal}; it does not terminate the
 * process directly.
 */
function usage() {
  process.stderr.write(
    [
      'Usage:',
      '  spec9 [--spec-root <path>] [--product-root <path>] <command>',
      '',
      '  spec9 lint',
      '  spec9 graph',
      '  spec9 flow <id>                       (causal slice via relation_types.*.flow)',
      '  spec9 draft <kind> <context.id> --name <name>      (page skeleton on stdout)',
      '  spec9 trace [<requirement-id|context.id>] [--missing] [--json]',
      '  spec9 decision <context.ADR-id> [--json]',
      '  spec9 context <id> --slice <implement|why|review>',
      '  spec9 context --slice review --seed-files <path-list-file>',
      '  spec9 context --slice review --seed-git <git-ref>   (uses "git diff --name-only <ref>")',
      '  spec9 why <path>[#symbol]',
      '  spec9 outcomes <requirement-id>   (compare declared and code outcomes; no --fix)',
      '  spec9 candidates [--new]          (term candidates; decisions live in spec9/candidates.yaml)',
      '  spec9 doctor [--json] [--strict]  (combined health report)',
      '  spec9 quality [--all] [--json] [--strict]  (possible false-green signals)',
      '  spec9 next [--all] [--json] [--strict]     (prioritized queue)',
      '  spec9 e2e [--missing] [--json]    (E2E-to-Spec9 link precision)',
      '  spec9 review (--seed-files <file>|--seed-git <ref>) [--json]',
      '  spec9 review --base <ref> [--head <ref>] [--json] [--strict]  (semantic diff)',
      '  spec9 change (--seed-files <file>|--seed-git <ref>|--base <ref> [--head <ref>]) [--json]',
      '  spec9 coverage [--missing] [--json]  (OpenSpec requirement → spec9 norm)',
      '',
    ].join('\n'),
  );
  throw new UsageSignal();
}

function changedFilesFromArgs(args) {
  const seedFilesIdx = args.indexOf('--seed-files');
  const seedGitIdx = args.indexOf('--seed-git');
  if ((seedFilesIdx === -1) === (seedGitIdx === -1)) usage();
  if (seedFilesIdx !== -1) {
    const listPath = args[seedFilesIdx + 1];
    if (!listPath) usage();
    return fs.readFileSync(listPath, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  const ref = args[seedGitIdx + 1];
  if (!ref) usage();
  return execFileSync('git', ['diff', '--name-only', ref], { cwd: PRODUCT_ROOT, encoding: 'utf8' })
    .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function withSemanticInputs(args, callback) {
  if (args.includes('--seed-files') || args.includes('--seed-git')) usage();
  const baseIdx = args.indexOf('--base');
  if (baseIdx === -1 || !args[baseIdx + 1]) usage();
  const baseRef = args[baseIdx + 1];
  const headIdx = args.indexOf('--head');
  const headRef = headIdx === -1 ? null : args[headIdx + 1];
  if (headIdx !== -1 && !headRef) usage();

  const baseSnapshot = loadRepoAtGitRef(PRODUCT_ROOT, SPEC9_ROOT, baseRef);
  let headSnapshot = null;
  try {
    headSnapshot = headRef ? loadRepoAtGitRef(PRODUCT_ROOT, SPEC9_ROOT, headRef) : null;
    const headRepo = headSnapshot?.repo || loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    const changedFiles = changedFilesBetween(PRODUCT_ROOT, baseRef, headRef);
    return callback({
      baseRepo: baseSnapshot.repo,
      headRepo,
      changedFiles,
      labels: { base: `${baseRef}@${baseSnapshot.commit.slice(0, 12)}`, head: headSnapshot ? `${headRef}@${headSnapshot.commit.slice(0, 12)}` : 'worktree' },
    });
  } finally {
    if (headSnapshot) headSnapshot.cleanup();
    baseSnapshot.cleanup();
  }
}

/**
 * @param {string[]} argv
 */
function main(argv) {
  const roots = resolveRoots(argv);
  SPEC9_ROOT = roots.specRoot;
  PRODUCT_ROOT = roots.productRoot;
  const [cmd, ...rest] = roots.args;

  if (cmd === 'lint') {
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    const findings = lint(repo);
    for (const f of findings) process.stdout.write(formatFinding(f) + '\n');
    const hasError = findings.some((f) => f.level === 'ERROR');
    process.exitCode = hasError ? 1 : 0;
    return;
  }

  if (cmd === 'graph') {
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    const graph = buildGraph(repo);
    const outPath = path.join(SPEC9_ROOT, 'graph.json');
    fs.writeFileSync(outPath, JSON.stringify(graph, null, 2) + '\n', 'utf8');
    process.stdout.write(`graph written: ${path.relative(process.cwd(), outPath)} (nodes: ${graph.nodes.length}, edges: ${graph.edges.length})\n`);
    return;
  }

  if (cmd === 'flow') {
    const [id] = rest;
    if (!id) usage();
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    try {
      process.stdout.write(formatFlow(repo, id) + '\n');
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === 'draft') {
    const [kind, qualifiedId] = rest;
    if (!kind || !qualifiedId) usage();
    const nameIdx = rest.indexOf('--name');
    const name = nameIdx !== -1 ? rest[nameIdx + 1] : undefined;
    if (nameIdx !== -1 && !name) usage();
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    try {
      process.stdout.write(draftPage(repo, kind, qualifiedId, name));
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === 'trace') {
    const target = rest.find((arg) => !arg.startsWith('--')) || null;
    const missingOnly = rest.includes('--missing');
    const json = rest.includes('--json');
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    try {
      const rows = buildTrace(repo, { target, missingOnly });
      process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : `${formatTrace(rows, { missingOnly })}\n`);
      process.exitCode = missingOnly && rows.length > 0 ? 1 : 0;
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 2;
    }
    return;
  }

  if (cmd === 'decision') {
    const id = rest.find((arg) => !arg.startsWith('--'));
    if (!id) usage();
    const json = rest.includes('--json');
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    try {
      const report = decisionReport(repo, id);
      process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${formatDecisionReport(report)}\n`);
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 2;
    }
    return;
  }

  if (cmd === 'context') {
    const sliceIdx = rest.indexOf('--slice');
    const sliceName = sliceIdx !== -1 ? rest[sliceIdx + 1] : null;
    if (!sliceName) usage();
    const seedFilesIdx = rest.indexOf('--seed-files');
    const seedGitIdx = rest.indexOf('--seed-git');

    if (seedFilesIdx !== -1 || seedGitIdx !== -1) {
      // Seed the review slice with changed files. There is no positional ID;
      // the seed comes from a path-list file or a Git diff against a ref.
      let seedFiles;
      if (seedFilesIdx !== -1) {
        const listPath = rest[seedFilesIdx + 1];
        if (!listPath) usage();
        seedFiles = fs.readFileSync(listPath, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      } else {
        const ref = rest[seedGitIdx + 1];
        if (!ref) usage();
        seedFiles = execFileSync('git', ['diff', '--name-only', ref], { cwd: PRODUCT_ROOT, encoding: 'utf8' })
          .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      }
      const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
      try {
        process.stdout.write(reviewSlice(repo, seedFiles) + '\n');
      } catch (e) {
        process.stderr.write(`${e.message}\n`);
        process.exitCode = 1;
      }
      return;
    }

    const id = rest[0];
    if (!id) usage();
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    try {
      process.stdout.write(contextSlice(repo, id, sliceName) + '\n');
    } catch (e) {
      process.stderr.write(`${e.message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === 'why') {
    const [target] = rest;
    if (!target) usage();
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    process.stdout.write(why(repo, target) + '\n');
    return;
  }

  if (cmd === 'outcomes') {
    const [reqId] = rest;
    if (!reqId) usage();
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    const { text, status } = cmdOutcomes(repo, reqId);
    process.stdout.write(text + '\n');
    // Three states use three exit codes: 0 means a completed clean comparison,
    // 1 means a completed comparison with drift, and 2 means comparison was
    // impossible. CI must never interpret "not checked" as clean.
    process.exitCode = status === 'discrepancy' ? 1 : status === 'unchecked' ? 2 : 0;
    return;
  }

  if (cmd === 'candidates') {
    const onlyNew = rest.includes('--new');
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    const { text, hasNew } = cmdCandidates(repo, { onlyNew });
    process.stdout.write(text + '\n');
    process.exitCode = onlyNew && hasNew ? 1 : 0;
    return;
  }

  if (cmd === 'doctor') {
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    const report = buildDoctorReport(repo);
    process.stdout.write(rest.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : `${formatDoctorReport(report)}\n`);
    process.exitCode = report.status === 'error' || (report.status === 'warn' && rest.includes('--strict')) ? 1 : 0;
    return;
  }

  if (cmd === 'quality') {
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    const report = buildQualityReport(repo);
    process.stdout.write(rest.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : `${formatQualityReport(report, { all: rest.includes('--all') })}\n`);
    process.exitCode = rest.includes('--strict') && report.total ? 1 : 0;
    return;
  }

  if (cmd === 'next') {
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    const report = buildNextQueue(repo);
    process.stdout.write(rest.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : `${formatNextQueue(report, { all: rest.includes('--all') })}\n`);
    process.exitCode = rest.includes('--strict') && (report.counts.P0 || report.counts.P1) ? 1 : 0;
    return;
  }

  if (cmd === 'e2e') {
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    const report = auditE2E(repo);
    process.stdout.write(rest.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : `${formatE2EAudit(report, { missingOnly: rest.includes('--missing') })}\n`);
    process.exitCode = report.counts.missing || report.counts.invalid ? 1 : 0;
    return;
  }

  if (cmd === 'review') {
    if (rest.includes('--base')) {
      const report = withSemanticInputs(rest, ({ baseRepo, headRepo, changedFiles, labels }) => buildSemanticReview(baseRepo, headRepo, changedFiles, labels));
      process.stdout.write(rest.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : `${formatSemanticReview(report)}\n`);
      process.exitCode = report.semantic.risk === 'high' || (rest.includes('--strict') && report.semantic.risk === 'medium') ? 1 : 0;
      return;
    }
    const changedFiles = changedFilesFromArgs(rest);
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    const report = buildReviewImpact(repo, changedFiles);
    process.stdout.write(rest.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : `${formatReviewImpact(report)}\n`);
    return;
  }

  if (cmd === 'change') {
    if (rest.includes('--base')) {
      const report = withSemanticInputs(rest, ({ baseRepo, headRepo, changedFiles, labels }) => {
        const semantic = buildSemanticReview(baseRepo, headRepo, changedFiles, labels).semantic;
        return buildChangeReport(headRepo, changedFiles, { semanticDiff: semantic });
      });
      process.stdout.write(rest.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : `${formatChangeReport(report)}\n`);
      process.exitCode = report.risk === 'high' ? 1 : 0;
      return;
    }
    const changedFiles = changedFilesFromArgs(rest);
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    const report = buildChangeReport(repo, changedFiles);
    process.stdout.write(rest.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : `${formatChangeReport(report)}\n`);
    process.exitCode = report.risk === 'high' ? 1 : 0;
    return;
  }

  if (cmd === 'coverage') {
    const repo = loadRepo(SPEC9_ROOT, PRODUCT_ROOT);
    const report = buildOpenSpecCoverage(repo);
    process.stdout.write(rest.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : `${formatOpenSpecCoverage(report, { missingOnly: rest.includes('--missing') })}\n`);
    process.exitCode = report.counts.missing || report.counts.duplicate || report.counts.unknown ? 1 : 0;
    return;
  }

  usage();
}

// Use process.exitCode and natural completion. Immediate process termination
// can truncate asynchronous writes when stdout is piped.
try {
  main(process.argv.slice(2));
} catch (e) {
  if (e instanceof UsageSignal) {
    process.exitCode = 2;
  } else {
    throw e;
  }
}
