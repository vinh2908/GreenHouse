/**
 * R9 — customer job-detail page must not call any hook after its early
 * returns (Rules-of-Hooks crash, proven live 2026-11-14).
 *
 * ROOT CAUSE: the R7-added `focus='edit'` useEffect
 * (apps/mobile/app/job-detail/[id].tsx:717 at base f8942ca) was called
 * AFTER `if (jLoading) return <LoadingSpinner />` (line 540) and
 * `if (!job) return ...` (line 541). The loading render therefore called
 * N hooks and the loaded render N+1, so React threw "Rendered more hooks
 * than during the previous render" (production: minified React error #310)
 * on EVERY loading -> loaded transition, and the RootErrorBoundary showed
 * "Lỗi hiển thị màn hình" on all customer job-detail pages, all statuses.
 * The effect body was fully guarded — the bug was the hook CALL position,
 * not the body — so no render-time null-safety check could catch it.
 *
 * FIX: the effect (and its dep `canEdit`, also derived after the returns)
 * were hoisted above the early returns, next to the existing focus effect.
 * `canEdit` is now `!!job && !...includes(job.status)` so it is safe while
 * job is still null; there is exactly one definition.
 *
 * FAIL-ON-OLD: R9-1, R9-2 and R9-3 FAIL on base f8942ca (the line-717
 * effect sits after the returns; `canEdit` is defined after them too) and
 * PASS after the fix. R9-4 (helper detail guard) passes on base AND after.
 *
 * HARNESS: none — static source scan of the mobile detail pages. The
 * mobile app has no jest harness, so this API-side spec is the regression
 * guard (same pattern as the R-round static guards).
 */
import * as fs from 'fs';
import * as path from 'path';

const CUSTOMER_DETAIL_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'mobile',
  'app',
  'job-detail',
  '[id].tsx',
);
const HELPER_DETAIL_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'mobile',
  'app',
  'helper-job-detail',
  '[id].tsx',
);

// Any React hook call (built-in, React Query, or custom use* hook).
const HOOK_CALL =
  /\b(useEffect|useState|useMemo|useRef|useCallback|useQuery|useMutation|use[A-Z][A-Za-z]*)\s*\(/;

function readLines(filePath: string): string[] {
  return fs.readFileSync(filePath, 'utf8').split('\n');
}

/** Code part of a line: trailing `//` comments cannot contain a hook call. */
function codePart(line: string): string {
  const idx = line.indexOf('//');
  return idx === -1 ? line : line.slice(0, idx);
}

/**
 * Hook calls on lines (startLine, endLine] in the file, skipping full-line
 * comments. Returns `lineNo: source` entries (1-based).
 */
function hookCallsAfter(lines: string[], startLine: number, endLine: number): string[] {
  const found: string[] = [];
  for (let i = startLine; i < endLine && i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    if (HOOK_CALL.test(codePart(lines[i]))) found.push(`${i + 1}: ${trimmed}`);
  }
  return found;
}

describe('R9 job-detail hooks order', () => {
  const lines = readLines(CUSTOMER_DETAIL_PATH);

  // Main component = from `export default function JobDetailScreen()` to the
  // separate `JobVoucherRow` sub-component below it (its own hooks are fine).
  const componentStart = lines.findIndex(l => /export default function JobDetailScreen/.test(l));
  const voucherRowStart = lines.findIndex(
    (l, i) => i > componentStart && /^function JobVoucherRow/.test(l),
  );
  const loadingReturn = lines.findIndex(
    (l, i) => i > componentStart && /if \(jLoading\) return/.test(l),
  );
  const notFoundReturn = lines.findIndex((l, i) => i > loadingReturn && /if \(!job\) \{/.test(l));

  it('R9-0: scan markers exist (spec must not silently pass on a refactor)', () => {
    expect(componentStart).toBeGreaterThan(-1);
    expect(voucherRowStart).toBeGreaterThan(loadingReturn);
    expect(loadingReturn).toBeGreaterThan(-1);
    expect(notFoundReturn).toBeGreaterThan(loadingReturn);
  });

  it('R9-1: no hook call after the early returns in the main component', () => {
    // Scan from the `if (jLoading) return` line to the VoucherSection
    // sub-component. Any useEffect/useState/... here runs on the loaded
    // render only -> "Rendered more hooks than during the previous render".
    const violations = hookCallsAfter(lines, loadingReturn + 1, voucherRowStart);
    expect(violations).toEqual([]);
  });

  it("R9-2: the focus='edit' effect sits above the early returns", () => {
    const focusEditEffect = lines.findIndex(
      (l, i) => i > componentStart && /focus !== 'edit'/.test(l),
    );
    expect(focusEditEffect).toBeGreaterThan(-1);
    expect(focusEditEffect).toBeLessThan(loadingReturn);
  });

  it('R9-3: canEdit is defined exactly once, above the early returns', () => {
    // The effect's dep array reads canEdit, so hoisting the effect alone
    // would hit the TDZ (ReferenceError) if canEdit stayed below the
    // returns. Exactly one definition, hoisted with the effect.
    const defs = lines
      .map((l, i) => ({ line: i + 1, text: l }))
      .filter(({ text }) => /^\s*const canEdit =/.test(text));
    expect(defs.map(d => d.line)).toHaveLength(1);
    expect(defs[0].line).toBeLessThan(loadingReturn + 1);
    expect(defs[0].text).toContain('!!job');
  });

  it('R9-4 (guard): helper detail page has no hook after its early returns', () => {
    const helperLines = readLines(HELPER_DETAIL_PATH);
    const helperNotFound = helperLines.findIndex(l => /if \(!job\)/.test(l));
    expect(helperNotFound).toBeGreaterThan(-1);
    const violations = hookCallsAfter(helperLines, helperNotFound + 1, helperLines.length);
    expect(violations).toEqual([]);
  });
});
