import { localAnalysisAdapter } from './localAnalysisAdapter.js';

const activeAdapter = localAnalysisAdapter;

export const buildReasoning = (matchInput, prediction, signals) => activeAdapter.buildReasoning(matchInput, prediction, signals);
export const getAiAnalysisStatus = () => activeAdapter.status();
