const env = require('../../config/env');
const log = require('./dqsSync.log');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chunkArray = (items, size) => {
  const chunks = [];
  const n = Math.max(1, size || 500);
  for (let i = 0; i < items.length; i += n) {
    chunks.push(items.slice(i, i + n));
  }
  return chunks;
};

const isConfigured = () =>
  Boolean(String(env.dqsSyncUrl || '').trim() && String(env.dqsSyncToken || '').trim());

/**
 * POST one chunk to DQS with retries on network / 5xx.
 * Does not retry 401/403 (config bug). Does not retry other 4xx.
 */
const postChunk = async (body, { attempt = 0, chunkIndex = 1, chunkTotal = 1 } = {}) => {
  const url = String(env.dqsSyncUrl).trim();
  const token = String(env.dqsSyncToken).trim();
  const timeoutMs = env.dqsSyncTimeoutMs || 30000;
  const maxRetries = env.dqsSyncMaxRetries ?? 3;

  log.info('POST chunk', {
    chunk: `${chunkIndex}/${chunkTotal}`,
    attempt: attempt + 1,
    maxAttempts: maxRetries + 1,
    url,
    token: log.maskToken(token),
    mode: body.mode,
    reason: body.reason,
    skuCount: body.items?.length || 0,
    timeoutMs,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text?.slice?.(0, 2000) || text };
    }

    const elapsedMs = Date.now() - started;
    log.info('POST response', {
      chunk: `${chunkIndex}/${chunkTotal}`,
      statusCode: response.status,
      elapsedMs,
      bodyPreview:
        typeof parsed === 'object'
          ? parsed
          : String(text || '').slice(0, 500),
    });

    if (response.status === 401 || response.status === 403) {
      log.error('Auth rejected — stop retrying this token', {
        statusCode: response.status,
      });
      return {
        ok: false,
        abortAuth: true,
        statusCode: response.status,
        body: parsed,
        message: `DQS auth failed (${response.status}). Check DQS_SYNC_TOKEN.`,
      };
    }

    if (response.status >= 500) {
      if (attempt < maxRetries) {
        const delay = Math.min(8000, 500 * 2 ** attempt);
        log.warn('5xx — retrying', { statusCode: response.status, delayMs: delay });
        await sleep(delay);
        return postChunk(body, {
          attempt: attempt + 1,
          chunkIndex,
          chunkTotal,
        });
      }
      return {
        ok: false,
        statusCode: response.status,
        body: parsed,
        message: `DQS server error ${response.status} after ${maxRetries + 1} attempts`,
      };
    }

    if (response.status >= 400) {
      log.error('4xx payload/auth problem — not retrying', {
        statusCode: response.status,
        body: parsed,
      });
      return {
        ok: false,
        statusCode: response.status,
        body: parsed,
        message: `DQS rejected payload (${response.status})`,
      };
    }

    return {
      ok: true,
      statusCode: response.status,
      body: parsed,
      message: 'OK',
    };
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    log.error('Network/timeout error', {
      chunk: `${chunkIndex}/${chunkTotal}`,
      attempt: attempt + 1,
      aborted,
      message: error.message || String(error),
      elapsedMs: Date.now() - started,
    });

    if (attempt < maxRetries) {
      const delay = Math.min(8000, 500 * 2 ** attempt);
      log.warn('Retrying after network error', { delayMs: delay });
      await sleep(delay);
      return postChunk(body, {
        attempt: attempt + 1,
        chunkIndex,
        chunkTotal,
      });
    }
    return {
      ok: false,
      statusCode: null,
      body: null,
      message: aborted
        ? `DQS request timed out after ${timeoutMs}ms`
        : error.message || 'DQS network error',
    };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * POST items in chunks. Aggregates per-cell reports when present.
 */
const postCarcassBasePrices = async ({
  mode,
  reason,
  sourceUpdatedAt,
  items,
}) => {
  if (!isConfigured()) {
    log.warn('Skip POST — DQS_SYNC_URL / DQS_SYNC_TOKEN not configured');
    return {
      ok: false,
      skipped: true,
      message: 'DQS sync not configured (set DQS_SYNC_URL and DQS_SYNC_TOKEN)',
      chunks: 0,
      itemCount: 0,
      aggregate: null,
    };
  }

  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    log.info('Skip POST — no SKUs with sendable finish prices', { mode, reason });
    return {
      ok: true,
      skipped: true,
      message: 'No catalogue finish prices to send',
      chunks: 0,
      itemCount: 0,
      aggregate: {
        inserted: 0,
        updated: 0,
        unchanged: 0,
        skippedUnmappedFinish: 0,
        skippedNullPrice: 0,
        rejected: [],
      },
    };
  }

  const chunks = chunkArray(list, env.dqsSyncMaxSkusPerPost || 500);
  log.info('Starting POST batch', {
    mode,
    reason,
    sourceUpdatedAt,
    ...log.summarizeItems(list),
    chunks: chunks.length,
    maxSkusPerPost: env.dqsSyncMaxSkusPerPost || 500,
  });

  const aggregate = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skippedUnmappedFinish: 0,
    skippedNullPrice: 0,
    rejected: [],
  };

  const chunkResults = [];

  // eslint-disable-next-line no-restricted-syntax
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const body = {
      source: 'elk-erp',
      mode,
      reason,
      sourceUpdatedAt,
      items: chunk,
    };

    // eslint-disable-next-line no-await-in-loop
    const result = await postChunk(body, {
      chunkIndex: i + 1,
      chunkTotal: chunks.length,
    });
    chunkResults.push(result);

    if (result.abortAuth) {
      log.error('Batch aborted (auth)', { message: result.message });
      return {
        ok: false,
        skipped: false,
        abortAuth: true,
        message: result.message,
        chunks: chunks.length,
        itemCount: list.length,
        aggregate,
        chunkResults,
      };
    }

    if (!result.ok) {
      log.error('Batch stopped on chunk failure', {
        chunk: `${i + 1}/${chunks.length}`,
        message: result.message,
        statusCode: result.statusCode,
        body: result.body,
      });
      return {
        ok: false,
        skipped: false,
        message: result.message,
        chunks: chunks.length,
        itemCount: list.length,
        aggregate,
        chunkResults,
      };
    }

    const data = result.body?.data || result.body || {};
    aggregate.inserted += Number(data.inserted) || 0;
    aggregate.updated += Number(data.updated) || 0;
    aggregate.unchanged += Number(data.unchanged) || 0;
    aggregate.skippedUnmappedFinish += Number(data.skippedUnmappedFinish) || 0;
    aggregate.skippedNullPrice += Number(data.skippedNullPrice) || 0;
    if (Array.isArray(data.rejected)) {
      aggregate.rejected.push(...data.rejected);
    }
  }

  log.info('Batch complete', {
    mode,
    reason,
    itemCount: list.length,
    chunks: chunks.length,
    aggregate,
  });

  return {
    ok: true,
    skipped: false,
    message: `DQS ${mode} accepted (${list.length} SKUs in ${chunks.length} chunk(s))`,
    chunks: chunks.length,
    itemCount: list.length,
    aggregate,
    chunkResults,
  };
};

module.exports = {
  isConfigured,
  chunkArray,
  postCarcassBasePrices,
};
