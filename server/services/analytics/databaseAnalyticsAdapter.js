import crypto from 'crypto';
import { getAnalyticsSummaryFromDatabase, trackAnalyticsEventInDatabase } from '../database/index.js';

const enabled = process.env.ANALYTICS_ENABLED !== 'false';
const maxPayloadKeys = 18;
const allowedEventPattern = /^[a-z][a-z0-9_]{1,60}$/;

const isWeakSalt = (salt) => !salt || salt === 'change-me-before-production' || salt.length < 16;

const safeValue = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 160);
  if (Array.isArray(value)) return value.slice(0, 8).map(safeValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, maxPayloadKeys)
        .map(([key, item]) => [String(key).slice(0, 60), safeValue(item)]),
    );
  }
  return String(value).slice(0, 160);
};

const anonymizeIp = (ip = '') => {
  const salt = process.env.ANALYTICS_SALT || (process.env.NODE_ENV === 'production' ? '' : 'local-development-salt');
  if (isWeakSalt(salt) && process.env.NODE_ENV === 'production') {
    return 'salt-not-configured';
  }
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 16);
};

export const databaseAnalyticsAdapter = {
  id: 'database-analytics',
  name: 'Database Analytics Adapter',
  type: 'analytics',
  async trackEvent({ eventName, sessionId, payload = {}, request }) {
    if (!enabled) {
      return { stored: false, reason: 'analytics-disabled' };
    }

    if (!allowedEventPattern.test(eventName || '')) {
      return { stored: false, reason: 'invalid-event-name' };
    }

    return trackAnalyticsEventInDatabase({
      eventName,
      sessionId: String(sessionId || 'anonymous').slice(0, 80),
      payload: safeValue(payload),
      requestId: request?.id,
      ipHash: anonymizeIp(request?.ip || request?.socket?.remoteAddress || ''),
      userAgentFamily: String(request?.get?.('user-agent') || '').split(' ').slice(0, 3).join(' ').slice(0, 120),
    });
  },
  async getSummary() {
    return getAnalyticsSummaryFromDatabase();
  },
  async status() {
    const salt = process.env.ANALYTICS_SALT || '';
    const needsSalt = process.env.NODE_ENV === 'production' && isWeakSalt(salt);

    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: enabled && !needsSalt ? 'online' : needsSalt ? 'needs_config' : 'disabled',
      mode: enabled ? 'database' : 'disabled',
      updateCadence: 'Events are stored in the configured database adapter',
    };
  },
};
