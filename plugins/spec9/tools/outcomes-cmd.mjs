// `spec.mjs outcomes <requirement-id>` — сверка объявленных Outcomes требования
// с исходами кода по его `code:`-якорям (конституция §10). Никакого `--fix`:
// расхождение разрешается человеком одним из трёх путей, названных в выводе.

import fs from 'node:fs';
import path from 'node:path';
import { adapterForFile, supportedExtensions } from './adapters/index.mjs';
import { buildRustWorkspaceResolver } from './rust-workspace.mjs';

/**
 * Находит требование по ID во всём репозитории (не только в одном файле).
 * @param {import('./graph.mjs').Repo} repo
 * @param {string} reqId
 * @returns {{ file: import('./parse.mjs').SpecFile, req: import('./parse.mjs').Requirement }|null}
 */
function findRequirement(repo, reqId) {
  return repo.requirementsById.get(reqId) || null;
}

/**
 * Форматирует один блок расхождения — строго в форме, заданной заданием:
 * без предложения починить, с тремя разрешениями и указанием, что выбор
 * делает человек.
 * @param {string} reqId
 * @param {string} symbol
 * @param {string} variant
 * @returns {string}
 */
function formatDiscrepancy(reqId, symbol, variant) {
  return [
    `DISCREPANCY  ${reqId}  ${symbol}`,
    `  code outcome missing from the specification: ${variant}`,
    '  resolve in exactly one way:',
    '    (a) domain outcome → add it to Outcomes and attach scenario evidence',
    '    (b) impossible outcome → change the code',
    '    (c) non-domain outcome → add its category to profile.non_domain_outcomes',
    '  a human records the choice; there is no automatic fix',
  ].join('\n');
}

/**
 * Третий исход команды — не "есть расхождение" / "расхождений нет", а
 * "проверка не состоялась": требования нет, якоря нет, файл/адаптер/символ
 * не найдены, либо ни одного варианта фактически не сравнено с Outcomes.
 * Раньше все эти пути возвращали `hasDiscrepancy: false` неотличимо от
 * настоящей полной сверки — команда-страж собственного правила fail-closed
 * (паттерн FC-002) нарушала его сама: отказ по существу был неотличим от
 * невозможности проверить (см. docs/history/engine-audit-2026-08-30.md C3).
 * @typedef {'ok'|'discrepancy'|'unchecked'} OutcomesStatus
 */

/**
 * `spec.mjs outcomes <requirement-id>`.
 * @param {import('./graph.mjs').Repo} repo
 * @param {string} reqId
 * @returns {{ text: string, hasDiscrepancy: boolean, status: OutcomesStatus }}
 */
export function cmdOutcomes(repo, reqId) {
  const found = findRequirement(repo, reqId);
  if (!found) {
    return { text: `Requirement "${reqId}" was not found — CHECK NOT PERFORMED`, hasDiscrepancy: false, status: 'unchecked' };
  }
  const { file, req } = found;
  reqId = req.qualifiedId || `${file.frontmatter.context}.${req.id}`;
  // docs/history/engine-audit-2026-08-30.md M17: профиль требует `code:` именно во frontmatter термина
  // (`kinds.операция.anchors.required: [code, test]`) — команда читала
  // только `req.evidenceAnchors` (Evidence-строки ПОД заголовком требования)
  // и для операции, оформленной строго по профилю, говорила "нет code:-якоря
  // с символом", хотя якорь был, просто во frontmatter файла термина.
  const codeAnchors = [...req.evidenceAnchors, ...file.frontmatterAnchors].filter((a) => a.type === 'code' && a.symbol);
  if (codeAnchors.length === 0) {
    return { text: `Requirement ${reqId} has no code anchor with a symbol in requirement evidence or page anchors — CHECK NOT PERFORMED`, hasDiscrepancy: false, status: 'unchecked' };
  }

  const nonDomain = new Set(repo.profile.non_domain_outcomes || []);
  const declaredOutcomes = req.outcomes ? req.outcomes.values : [];
  const outcomeMap = (file.frontmatter && file.frontmatter.outcome_map
    && (file.frontmatter.outcome_map[reqId] || file.frontmatter.outcome_map[req.id])) || null;

  const blocks = [];
  const resolveRustType = buildRustWorkspaceResolver(repo.productRoot);
  let hasDiscrepancy = false;
  // true, если хотя бы для одного якоря сверка фактически произошла: не
  // "нет адаптера/файла/символа", не "нет карты — сопоставьте вручную",
  // и вариантов для сравнения было больше нуля.
  let anyVerified = false;
  // true, если хотя бы один якорь не удалось довести до сверки — эта
  // причина обязана попасть в итоговый статус, а не потеряться за
  // "расхождений нет" по другим якорям.
  let anyUnchecked = false;

  for (const anchor of codeAnchors) {
    const absPath = path.join(repo.productRoot, anchor.file);
    if (!fs.existsSync(absPath)) {
      blocks.push(`Anchor ${anchor.type}:${anchor.target} — file not found: ${anchor.file} — CHECK NOT PERFORMED`);
      anyUnchecked = true;
      continue;
    }
    const adapter = adapterForFile(anchor.file);
    if (!adapter) {
      blocks.push(
        `Anchor ${anchor.type}:${anchor.target} — no language adapter for ${anchor.file} ` +
        `(supported: ${supportedExtensions().join(', ')}) — CHECK NOT PERFORMED`,
      );
      anyUnchecked = true;
      continue;
    }
    const source = fs.readFileSync(absPath, 'utf8');
    const extraction = adapter.extractOutcomes(
      source,
      anchor.symbol,
      adapter.language === 'rust'
        ? { resolveType: (name) => resolveRustType(name, { sourceFile: anchor.file, source }) }
        : {},
    );
    if (extraction === null) {
      blocks.push(`Symbol "${anchor.symbol}" was not found or parsed in ${anchor.file} — CHECK NOT PERFORMED`);
      anyUnchecked = true;
      continue;
    }
    const { declared: variants, escaping, confidence, unresolved } = extraction;

    // Побег мимо типа и неразобранные конструкции — не участвуют в сверке
    // с Outcomes (у них нет имени варианта для outcome_map), но обязаны
    // попасть в вывод: конституция §10 требует не терять их молча.
    if (escaping.length > 0 || unresolved.length > 0) {
      const infoLines = [`OUTCOME INFORMATION  ${reqId}  ${anchor.symbol}  (confidence: ${confidence})`];
      if (escaping.length > 0) {
        infoLines.push(`  escaping outcomes: ${escaping.join(', ')}`);
        infoLines.push('  option (b) usually applies: remove the escaping throw from code');
      }
      if (unresolved.length > 0) {
        infoLines.push(`  unresolved: ${unresolved.join(', ')}`);
        infoLines.push('  confidence is lower; review these paths manually');
      }
      blocks.push(infoLines.join('\n'));
      // A mapped subset is not a complete check when the adapter explicitly
      // says that another exit path or type detail was not resolved. Keep the
      // useful comparison below, but never report the command as verified.
      anyUnchecked = true;
    }

    if (!outcomeMap) {
      blocks.push(
        [
          `MANUAL MAPPING  ${reqId}  ${anchor.symbol}`,
          `  confidence: ${confidence}`,
          `  code outcomes: ${variants.join(', ') || '(no variants)'}`,
          `  spec outcomes: ${declaredOutcomes.join(', ') || '(Outcomes not declared)'}`,
          '  this requirement has no explicit frontmatter.outcome_map; compare manually',
        ].join('\n'),
      );
      anyUnchecked = true; // без карты автоматической сверки не было — это тоже не "проверено"
      continue;
    }

    // Адаптер нашёл символ, но не смог перечислить ни одного варианта
    // (напр. confidence:"shallow" — тип возврата не аннотирован): цикл
    // ниже не выполнится ни разу, и без этой пометки якорь молча
    // засчитался бы как "всё сопоставлено" при нуле сравнений
    // (воспроизведено Codex на реальном outcomes REV-002, см. docs/history/engine-audit-2026-08-30.md C3).
    if (variants.length === 0) {
      blocks.push(
        `Anchor ${anchor.type}:${anchor.target} (symbol "${anchor.symbol}") — the adapter extracted no ` +
        `outcome variants (confidence: ${confidence}) — CHECK NOT PERFORMED`,
      );
      anyUnchecked = true;
      continue;
    }

    for (const variant of variants) {
      anyVerified = true;
      const mapped = outcomeMap[variant];
      if (mapped === undefined) {
        blocks.push(formatDiscrepancy(reqId, anchor.symbol, variant));
        hasDiscrepancy = true;
        continue;
      }
      if (nonDomain.has(mapped)) continue; // исключено профилем — не доменный исход
      if (!declaredOutcomes.includes(mapped)) {
        blocks.push(formatDiscrepancy(reqId, anchor.symbol, `${variant} → "${mapped}"`));
        hasDiscrepancy = true;
      }
    }
  }

  /** @type {OutcomesStatus} */
  let status;
  if (hasDiscrepancy) status = 'discrepancy';
  else if (anyUnchecked || !anyVerified) status = 'unchecked';
  else status = 'ok';

  const text = blocks.length > 0
    ? blocks.join('\n\n')
    : `No discrepancies: every code outcome for ${reqId} is mapped to Outcomes.`;
  return { text, hasDiscrepancy, status };
}
