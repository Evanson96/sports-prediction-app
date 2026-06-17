import { databaseAnalyticsAdapter } from './databaseAnalyticsAdapter.js';

const activeAdapter = databaseAnalyticsAdapter;

export const trackAnalyticsEvent = (event) => activeAdapter.trackEvent(event);
export const getAnalyticsSummary = () => activeAdapter.getSummary();
export const getAnalyticsStatus = () => activeAdapter.status();
