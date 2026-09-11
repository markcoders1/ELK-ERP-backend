const env = require('../../config/env');

/**
 * Office Scripts external fetch does not use a single fixed Origin.
 * Allow the web client, configured extras, and known Microsoft Office Script hosts.
 * Requests with no Origin (non-browser / some hosts) are allowed.
 *
 * @see https://learn.microsoft.com/en-us/office/dev/scripts/develop/external-calls
 */
/** Known Office Scripts / Excel Online hosts (not the entire microsoft.com domain). */
const OFFICE_SCRIPT_HOST_SUFFIXES = [
  'officescripts.microsoft.com',
  'officeapps.live.com',
];

const isOfficeScriptHost = (hostname) => {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return OFFICE_SCRIPT_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
};

const isAllowedCorsOrigin = (origin) => {
  if (!origin) return true;

  if (origin === env.clientUrl) return true;

  const extras = env.excelSyncCorsOrigins || [];
  if (extras.includes('*') || extras.includes(origin)) return true;

  try {
    const { hostname } = new URL(origin);
    if (isOfficeScriptHost(hostname)) return true;
  } catch {
    return false;
  }

  return false;
};

module.exports = {
  isAllowedCorsOrigin,
  isOfficeScriptHost,
};
