import { sqliteDatabase } from './sqliteDatabase.js';

const activeDatabase = sqliteDatabase;

export const createUser = (input) => activeDatabase.createUser(input);
export const verifyUser = (input) => activeDatabase.verifyUser(input);
export const createSession = (userId) => activeDatabase.createSession(userId);
export const findUserByToken = (token) => activeDatabase.findUserByToken(token);
export const savePrediction = (input) => activeDatabase.savePrediction(input);
export const listPredictions = (userId) => activeDatabase.listPredictions(userId);
export const deletePrediction = (input) => activeDatabase.deletePrediction(input);
export const trackAnalyticsEventInDatabase = (event) => activeDatabase.trackAnalyticsEvent(event);
export const getAnalyticsSummaryFromDatabase = () => activeDatabase.getAnalyticsSummary();
export const recordProviderStatus = (snapshot) => activeDatabase.recordProviderStatus(snapshot);
export const getDatabaseStatus = () => activeDatabase.status();
