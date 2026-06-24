import RefundRequest from '../models/RefundRequest.js';
import { triggerRefundExecution } from './refundExecutionService.js';

const RECOVERABLE_REFUND_STATUSES = ['requested', 'pending'];

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function isRecoverableRefundRequest(refundRequest) {
  return RECOVERABLE_REFUND_STATUSES.includes(normalizeStatus(refundRequest?.status));
}

export async function listRecoverableRefundRequests({ limit = 100 } = {}) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Number(limit))) : 100;
  return RefundRequest.find({
    status: { $in: RECOVERABLE_REFUND_STATUSES }
  })
    .sort({ requestedAt: 1 })
    .limit(safeLimit);
}

export async function recoverRefundRequest(refundRequestInput, { saleInput = null } = {}) {
  const refundRequest =
    refundRequestInput && typeof refundRequestInput.save === 'function'
      ? refundRequestInput
      : refundRequestInput?._id
        ? await RefundRequest.findById(refundRequestInput._id)
        : null;

  if (!refundRequest) {
    return { refund: null, recovered: false, skipped: true, reason: 'refund_not_found' };
  }
  if (!isRecoverableRefundRequest(refundRequest)) {
    return {
      refund: refundRequest,
      recovered: false,
      skipped: true,
      reason: `status_${normalizeStatus(refundRequest.status)}`
    };
  }

  const sale = saleInput && typeof saleInput === 'object' ? saleInput : null;
  try {
    const execution = await triggerRefundExecution(refundRequest, sale);
    return {
      refund: execution?.refund || refundRequest,
      recovered: true,
      stripeInitiated: Boolean(execution?.stripeInitiated),
      mode: execution?.mode || 'recovered'
    };
  } catch (error) {
    return {
      refund: refundRequest,
      recovered: false,
      skipped: false,
      error
    };
  }
}

export async function runRefundRecovery({ limit = 100 } = {}) {
  const summary = {
    inspectedCount: 0,
    recoveredCount: 0,
    skippedCount: 0,
    failedCount: 0
  };

  try {
    const refundRequests = await listRecoverableRefundRequests({ limit });
    summary.inspectedCount = refundRequests.length;

    for (const refundRequest of refundRequests) {
      try {
        const result = await recoverRefundRequest(refundRequest);
        if (result.recovered) {
          summary.recoveredCount += 1;
        } else if (result.skipped) {
          summary.skippedCount += 1;
        } else {
          summary.failedCount += 1;
          console.error('[RefundRecovery] refund execution failed', {
            refundId: String(refundRequest?.refundId || '').trim() || 'n/a',
            saleId: String(refundRequest?.saleId || '').trim() || 'n/a',
            status: String(refundRequest?.status || '').trim() || 'n/a',
            error: result.error?.message || 'unknown error'
          });
        }
      } catch (error) {
        summary.failedCount += 1;
        console.error('[RefundRecovery] refund processing failed', {
          refundId: String(refundRequest?.refundId || '').trim() || 'n/a',
          saleId: String(refundRequest?.saleId || '').trim() || 'n/a',
          error: error?.message || 'unknown error'
        });
      }
    }
  } catch (error) {
    console.error('[RefundRecovery] cycle failed', error);
  }

  return summary;
}
