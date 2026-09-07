/**
 * Pings the public health URL on an interval so hosted platforms
 * (e.g. Render free tier) are less likely to idle-sleep the service.
 *
 * Important: the URL must be the *public* HTTPS URL so the request
 * arrives as inbound traffic. Localhost pings do not prevent cold starts.
 */

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;

const resolveKeepAliveUrl = (env) => {
  if (env.keepAliveUrl) return env.keepAliveUrl.replace(/\/+$/, '');

  if (env.renderExternalUrl) {
    return `${env.renderExternalUrl.replace(/\/+$/, '')}/api/health`;
  }

  return null;
};

const startKeepAlive = (env) => {
  if (env.keepAliveEnabled === false) {
    return null;
  }

  const url = resolveKeepAliveUrl(env);
  if (!url) {
    if (env.nodeEnv === 'production') {
      console.warn(
        'Keep-alive skipped: set KEEP_ALIVE_URL (or RENDER_EXTERNAL_URL) to your public /api/health URL.'
      );
    }
    return null;
  }

  // Only run in production by default (Render / VPS). Opt-in locally with KEEP_ALIVE_ENABLED=true.
  if (env.nodeEnv !== 'production' && env.keepAliveEnabled !== true) {
    return null;
  }

  const intervalMs = env.keepAliveIntervalMs || DEFAULT_INTERVAL_MS;

  const ping = async () => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        console.warn(`Keep-alive ping returned HTTP ${response.status} for ${url}`);
        return;
      }
      console.log(`Keep-alive ping ok (${response.status})`);
    } catch (err) {
      console.warn(`Keep-alive ping failed: ${err.message}`);
    }
  };

  // First ping shortly after boot, then on the interval.
  const initial = setTimeout(ping, 30 * 1000);
  const timer = setInterval(ping, intervalMs);

  console.log(
    `Keep-alive enabled: pinging ${url} every ${Math.round(intervalMs / 60000)} minute(s)`
  );

  return {
    stop() {
      clearTimeout(initial);
      clearInterval(timer);
    },
  };
};

module.exports = {
  startKeepAlive,
  resolveKeepAliveUrl,
  DEFAULT_INTERVAL_MS,
};
