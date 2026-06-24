import { runRefundRecovery } from '../services/refundRecoveryService.js';

const JOB_INTERVAL_MS = 60 * 60 * 1000;

let recoveryIntervalId = null;
let recoveryRunning = false;

async function runRecoveryCycle(trigger = 'interval') {
  if (recoveryRunning) return;
  recoveryRunning = true;
  try {
    const summary = await runRefundRecovery({ limit: 100 });
    if (summary.inspectedCount > 0) {
      console.log(
        `[RefundRecovery] (${trigger}) inspected=${summary.inspectedCount} recovered=${summary.recoveredCount} skipped=${summary.skippedCount} failed=${summary.failedCount}`
      );
    }
  } finally {
    recoveryRunning = false;
  }
}

export function startRefundRecoveryScheduler(trigger = 'startup') {
  if (recoveryIntervalId) {
    void runRecoveryCycle(trigger);
    return;
  }
  console.log('[RefundRecovery] Job demarre (intervalle: 1h).');
  recoveryIntervalId = setInterval(() => {
    void runRecoveryCycle('interval').catch(error => {
      console.error('[RefundRecovery] interval run failed', error);
    });
  }, JOB_INTERVAL_MS);
  void runRecoveryCycle(trigger).catch(error => {
    console.error('[RefundRecovery] startup run failed', error);
  });
}
