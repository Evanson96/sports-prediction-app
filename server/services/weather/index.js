import { openMeteoWeatherAdapter } from './openMeteoWeatherAdapter.js';

const activeAdapter = openMeteoWeatherAdapter;

export const getMatchWeather = (matchInput) => activeAdapter.getMatchWeather(matchInput);
export const getWeatherStatus = () => activeAdapter.status();
