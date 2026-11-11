import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrafficReport } from '../scripts/report-traffic.mjs';

const compact = (day = '2026-11-29', environment = 'production') =>
  JSON.stringify(['ir.req', 2, day, environment, '/api/news', 'GET', 'unknown', 'api']);

test('budget reports exact inclusive thresholds without rounding a count into an alert', () => {
  const report = createTrafficReport();
  const checks = new Map([
    [11499, 'below_observed_threshold'], [11500, 'info'], [11501, 'info'],
    [16099, 'info'], [16100, 'warning'], [16101, 'warning'],
    [20699, 'warning'], [20700, 'critical'], [20701, 'critical'],
    [22999, 'critical'], [23000, 'budget_reached'], [23001, 'budget_reached'],
    [46000, 'budget_reached'],
  ]);
  const displayedPercent = new Map([
    [11499, 49.99], [11500, 50], [11501, 50],
    [16099, 69.99], [16100, 70], [16101, 70],
    [20699, 89.99], [20700, 90], [20701, 90],
    [22999, 99.99], [23000, 100], [23001, 100], [46000, 200],
  ]);
  for (let count = 1; count <= 46000; count++) {
    report.add(compact());
    if (!checks.has(count)) continue;
    const budget = report.result().budget;
    assert.equal(budget.dailyRequests, 23000);
    assert.equal(budget.daily[0].observedRequests, count);
    assert.equal(budget.daily[0].level, checks.get(count), `count=${count}`);
    assert.equal(budget.daily[0].observedBudgetPercent, displayedPercent.get(count), `percent at count=${count}`);
    for (const threshold of budget.thresholds) {
      assert.equal(budget.daily[0].observedBudgetPercent >= threshold.percent,
        count >= threshold.requests, `display threshold ${threshold.percent} at count=${count}`);
    }
  }
  const day = report.result().budget.daily[0];
  assert.equal(day.observedBudgetPercent, 200);
  assert.deepEqual(day.reachedThresholds, ['info', 'warning', 'critical', 'budget_reached']);
});

test('budget combines hosted environments and log versions per UTC day, excluding local traffic', () => {
  const report = createTrafficReport();
  for (let i = 0; i < 6000; i++) report.add(compact());
  const legacy = JSON.stringify({ event: 'investradar.request', version: 1, day: '2026-11-29',
    environment: 'preview', endpoint: '/api/market', method: 'GET', bot: 'google', kind: 'api', count: 1 });
  for (let i = 0; i < 5500; i++) report.add(JSON.stringify({ message: legacy }));
  for (let i = 0; i < 23000; i++) report.add(compact('2026-11-29', 'development'));
  report.add(compact('2026-11-30'));
  report.add(compact('2026-11-28', 'development'));
  const result = report.result();
  assert.equal(result.daily.length, 5);
  assert.deepEqual(result.budget.daily.map(({ day, observedRequests, level }) => ({ day, observedRequests, level })), [
    { day: '2026-11-29', observedRequests: 11500, level: 'info' },
    { day: '2026-11-30', observedRequests: 1, level: 'below_observed_threshold' },
  ]);
});

test('missing or malformed logs never claim verified usage, a healthy day or remaining allowance', () => {
  const report = createTrafficReport();
  report.add('invalid');
  report.add(JSON.stringify(['ir.req', 2, '2026-02-30', 'production', '/api/news', 'GET', 'unknown', 'api']));
  const { budget, ignored } = report.result();
  assert.equal(ignored, 2);
  assert.deepEqual(budget.daily, []);
  assert.equal(budget.platformUsageVerified, false);
  assert.match(budget.notice, /incomplete platform coverage/);
  assert.deepEqual(budget.thresholds.map(t => [t.percent, t.requests]), [
    [50, 11500], [70, 16100], [90, 20700], [100, 23000],
  ]);
  report.add(compact());
  const observed = report.result().budget.daily[0];
  assert.equal(observed.level, 'below_observed_threshold');
  assert.equal('remainingRequests' in observed, false);
  assert.deepEqual(report.result(), report.result());
});
