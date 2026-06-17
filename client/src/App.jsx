import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Flag,
  Globe2,
  History,
  Loader2,
  MapPin,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { api, clearAuthToken, saveAuthToken } from './services/api.js';

const today = new Date().toISOString().slice(0, 10);
const heroImage = '/kenya-matchday-hero.jpg';
const fanImage = '/kenya-analytics-fan.jpg';
const ageGateKey = 'kenya-sports-predictor-age-ok';
const analyticsSessionKey = 'kenya-sports-predictor-session';

const initialForm = {
  teamA: 'Gor Mahia',
  teamB: 'AFC Leopards',
  sport: '',
  league: '',
  matchDate: today,
};

const storageKey = 'kenya-sports-predictor-history';

const readStoredFlag = (key) => {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
};

const getAnalyticsSessionId = () => {
  try {
    const existing = localStorage.getItem(analyticsSessionKey);
    if (existing) return existing;
    const next = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(analyticsSessionKey, next);
    return next;
  } catch {
    return 'anonymous';
  }
};

const trackEvent = (eventName, payload = {}) => {
  try {
    api.trackEvent(eventName, getAnalyticsSessionId(), payload).catch(() => {});
  } catch {
    // Analytics should never interrupt the betting research flow.
  }
};

const matchToForm = (match) => ({
  teamA: match.teamA,
  teamB: match.teamB,
  sport: match.sport,
  league: match.league,
  matchDate: match.matchDate,
  country: match.country,
  venue: match.venue,
  kickoffTime: match.kickoffTime,
  providerFixtureId: match.providerFixtureId || '',
  providerLeagueId: match.providerLeagueId || '',
  providerSeason: match.providerSeason || '',
  providerHomeTeamId: match.providerHomeTeamId || '',
  providerAwayTeamId: match.providerAwayTeamId || '',
  homeLogo: match.homeLogo || '',
  awayLogo: match.awayLogo || '',
});

const getConfidenceTone = (value) => {
  if (value >= 75) {
    return {
      text: 'text-emerald-700',
      bg: 'bg-emerald-600',
      soft: 'bg-emerald-50',
      border: 'border-emerald-200',
      label: 'High confidence',
    };
  }
  if (value >= 55) {
    return {
      text: 'text-yellow-700',
      bg: 'bg-yellow-500',
      soft: 'bg-yellow-50',
      border: 'border-yellow-200',
      label: 'Medium confidence',
    };
  }
  return {
    text: 'text-red-700',
    bg: 'bg-red-600',
    soft: 'bg-red-50',
    border: 'border-red-200',
    label: 'Low confidence',
  };
};

const getStatusTone = (status) => {
  if (status === 'Live') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'Finished') return 'border-ink/10 bg-ink/5 text-ink/55';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
};

const formatCount = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const getProviderLabel = (provider) => {
  if (!provider) return 'Fixture provider loading';
  return provider.mode === 'real-api' ? `Live fixtures via ${provider.name}` : `${provider.name} ${provider.mode}`;
};

const formatOdds = (value) => (typeof value === 'number' ? value.toFixed(2) : 'N/A');

const formatTotalOdds = (value, line, label) => {
  if (typeof value !== 'number') return 'N/A';
  return `${label} ${typeof line === 'number' ? line : '2.5'} @ ${value.toFixed(2)}`;
};

const formatUpdatedAt = (value) => {
  if (!value) return 'Update time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Update time unavailable';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getOddsSourceTone = (mode) => {
  if (mode === 'real-api') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (mode === 'missing') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-ink/10 bg-ink/5 text-ink/60';
};

const getDataQualityTone = (status) => {
  if (['strong', 'real', 'derived_real'].includes(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['mixed', 'partial_real', 'estimated'].includes(status)) return 'border-yellow-200 bg-yellow-50 text-yellow-700';
  if (status === 'not_available') return 'border-ink/10 bg-ink/5 text-ink/60';
  if (status === 'insufficient') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-red-200 bg-red-50 text-red-700';
};

const getBestMarketOdds = (rows = [], marketKey) =>
  rows.reduce((best, row) => {
    const price = row.markets?.[marketKey];
    if (typeof price !== 'number') return best;
    if (!best || price > best.odds) {
      return { bookmaker: row.bookmaker, odds: price };
    }
    return best;
  }, null);

const teamInitials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'FC';

const splitMatchName = (match = '') => {
  const [teamA = 'Team A', teamB = 'Team B'] = match.split(' vs ');
  return { teamA, teamB };
};

const multiplyOdds = (legs) =>
  Number(
    legs
      .reduce((total, leg) => total * (typeof leg.odds === 'number' ? leg.odds : 1), 1)
      .toFixed(2),
  );

const averageConfidence = (legs) => {
  const values = legs.map((leg) => leg.confidence).filter((value) => typeof value === 'number');
  if (!values.length) return 55;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const buildAccumulatorIdeas = () => [];

const todaySectionOrder = ['recommended', 'valuePicks', 'researchOnly', 'insufficientData', 'accumulators'];

const todaySectionFallbackTitles = {
  recommended: 'Recommended slips',
  valuePicks: 'Value picks',
  researchOnly: 'Research-only picks',
  insufficientData: 'Insufficient data',
  accumulators: 'Accumulator ideas',
};

const todayRiskFilters = [
  { label: 'All confidence', value: 'all' },
  { label: 'Research only', value: 'low' },
  { label: 'Medium confidence', value: 'medium' },
  { label: 'High confidence', value: 'high' },
  { label: 'Strongest signals', value: 'strongest' },
];

const todayTypeFilters = [
  { label: 'All picks', value: 'all' },
  { label: 'Single picks', value: 'single' },
  { label: 'Accumulators', value: 'accumulator' },
  { label: 'Insufficient data', value: 'insufficient' },
];

const todaySportFilters = [
  { label: 'Football only', value: 'Football' },
  { label: 'All sports if supported', value: 'All' },
];

const readHistory = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch {
    localStorage.removeItem(storageKey);
    return [];
  }
};

const validateForm = (form) => {
  const errors = {};
  const required = ['teamA', 'teamB', 'matchDate'];

  required.forEach((field) => {
    if (!form[field]?.trim()) errors[field] = 'Required';
  });

  if (form.teamA.trim() && form.teamB.trim() && form.teamA.trim().toLowerCase() === form.teamB.trim().toLowerCase()) {
    errors.teamB = 'Choose a different opponent';
  }

  if (form.matchDate && Number.isNaN(Date.parse(form.matchDate))) {
    errors.matchDate = 'Use a valid date';
  }

  return errors;
};

function App() {
  const matchRequestRef = useRef(0);
  const [activeFlow, setActiveFlow] = useState('browse');
  const [form, setForm] = useState(initialForm);
  const [prediction, setPrediction] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [countries, setCountries] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countriesError, setCountriesError] = useState('');
  const [matchProvider, setMatchProvider] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [sports, setSports] = useState([]);
  const [sportsLoading, setSportsLoading] = useState(false);
  const [sportsError, setSportsError] = useState('');
  const [selectedSport, setSelectedSport] = useState('');
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState('');
  const [selectedMatchDate, setSelectedMatchDate] = useState(today);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [reasoningOpen, setReasoningOpen] = useState(true);
  const [sourceStatus, setSourceStatus] = useState(null);
  const [historyNotice, setHistoryNotice] = useState('');
  const [ageAccepted, setAgeAccepted] = useState(() => readStoredFlag(ageGateKey));
  const [complianceModal, setComplianceModal] = useState('');
  const [selectedAccumulator, setSelectedAccumulator] = useState(null);
  const [todayResearch, setTodayResearch] = useState(null);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todayError, setTodayError] = useState('');
  const [todayFilters, setTodayFilters] = useState({ risk: 'all', type: 'all', sport: 'Football' });
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');

  useEffect(() => {
    setHistory(readHistory());

    api.getSourceStatus()
      .then(setSourceStatus)
      .catch(() => setSourceStatus(null));

    api.me()
      .then(async (data) => {
        setAuthUser(data.user);
        await loadServerHistory();
      })
      .catch(() => {
        clearAuthToken();
      });

    loadCountries();
  }, []);

  useEffect(() => {
    if (ageAccepted) {
      trackEvent('app_opened', { date: today });
    }
  }, [ageAccepted]);

  const loadCountries = async () => {
    setCountriesLoading(true);
    setCountriesError('');

    try {
      const data = await api.getCountries();

      setMatchProvider(data.provider || null);
      setCountries(data.countries || []);
    } catch (err) {
      setCountriesError(err.message || 'Could not load countries.');
    } finally {
      setCountriesLoading(false);
    }
  };

  const loadSports = async (country) => {
    trackEvent('country_selected', { country });
    setSelectedCountry(country);
    setSelectedSport('');
    setSelectedMatchId('');
    setPrediction(null);
    setError('');
    setSports([]);
    setMatches([]);
    setSportsLoading(true);
    setSportsError('');
    setMatchesError('');

    try {
      const data = await api.getSports(country);

      setMatchProvider(data.provider || matchProvider);
      setSports(data.sports || []);
    } catch (err) {
      setSportsError(err.message || 'Could not load sports.');
    } finally {
      setSportsLoading(false);
    }
  };

  const loadMatches = async (sport, matchDate = selectedMatchDate) => {
    trackEvent('sport_selected', { country: selectedCountry, sport, matchDate });
    const requestId = matchRequestRef.current + 1;
    matchRequestRef.current = requestId;
    setSelectedSport(sport);
    setSelectedMatchId('');
    setPrediction(null);
    setError('');
    setMatches([]);
    setMatchesLoading(true);
    setMatchesError('');

    try {
      const data = await api.getMatches({ country: selectedCountry, sport, date: matchDate });

      if (requestId === matchRequestRef.current) {
        setMatchProvider(data.provider || matchProvider);
        setMatches(data.matches || []);
        trackEvent('matches_loaded', {
          country: selectedCountry,
          sport,
          matchDate,
          count: (data.matches || []).length,
          provider: data.provider?.name,
        });
      }
    } catch (err) {
      if (requestId === matchRequestRef.current) {
        setMatchesError(err.message || 'Could not load matches.');
      }
    } finally {
      if (requestId === matchRequestRef.current) {
        setMatchesLoading(false);
      }
    }
  };

  const handleBrowseDateChange = async (matchDate) => {
    setSelectedMatchDate(matchDate);
    setSelectedMatchId('');
    setPrediction(null);

    if (selectedCountry && selectedSport) {
      await loadMatches(selectedSport, matchDate);
    }
  };

  const saveHistory = (item) => {
    const key = `${item.match}-${item.matchDate}`;
    setHistory((currentHistory) => {
      const next = [
        item,
        ...currentHistory.filter((entry) => `${entry.match}-${entry.matchDate}` !== key),
      ].slice(0, 12);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
    setHistoryNotice('Saved on this device for next time');
    window.setTimeout(() => setHistoryNotice(''), 1800);

    if (authUser) {
      api.saveUserHistory(item)
        .then(() => setAuthNotice('Prediction synced to your account'))
        .catch(() => setAuthNotice('Saved on device. Account sync will retry later.'));
    }
  };

  const loadServerHistory = async () => {
    const data = await api.getUserHistory();
    const serverHistory = data.history || [];

    setHistory((currentHistory) => {
      const merged = [...serverHistory, ...currentHistory];
      const unique = [];
      const keys = new Set();

      merged.forEach((item) => {
        const key = `${item.match}-${item.matchDate}-${item.savedAt || item.id || ''}`;
        if (!keys.has(key)) {
          unique.push(item);
          keys.add(key);
        }
      });

      const next = unique.slice(0, 20);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const handleAuthSubmit = async (mode, credentials) => {
    setAuthLoading(true);
    setAuthError('');
    setAuthNotice('');

    try {
      const data = mode === 'register' ? await api.register(credentials) : await api.login(credentials);
      saveAuthToken(data.token);
      setAuthUser(data.user);
      setAuthNotice(mode === 'register' ? 'Account created. History sync is on.' : 'Logged in. History sync is on.');
      await loadServerHistory();
      trackEvent('auth_completed', { mode });
    } catch (err) {
      setAuthError(err.message || 'Could not complete sign in.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuthToken();
    setAuthUser(null);
    setAuthNotice('Logged out. Device history is still available.');
    trackEvent('auth_logged_out');
  };

  const requestPrediction = async (payload, options = {}) => {
    const { validate = true, matchId = '' } = options;
    const nextFieldErrors = validate ? validateForm(payload) : {};
    setFieldErrors(nextFieldErrors);
    setError('');
    setSelectedMatchId(matchId);

    if (Object.keys(nextFieldErrors).length > 0) {
      setError('Please fix the highlighted match details.');
      return;
    }

    setLoading(true);
    trackEvent('prediction_requested', {
      sport: payload.sport || 'auto',
      league: payload.league || 'auto',
      matchDate: payload.matchDate,
      fromBrowse: Boolean(matchId),
    });

    try {
      const data = await api.getPrediction(payload);

      setPrediction(data);
      setForm((current) => ({
        ...current,
        teamA: data.match?.split(' vs ')?.[0] || current.teamA,
        teamB: data.match?.split(' vs ')?.[1] || current.teamB,
        sport: data.sport || current.sport,
        league: data.league || current.league,
        matchDate: data.matchDate || current.matchDate,
      }));
      setReasoningOpen(true);
      saveHistory({ ...data, savedAt: new Date().toISOString() });
      trackEvent('prediction_received', {
        sport: data.sport,
        league: data.league,
        confidence: data.mainPrediction?.confidence,
        oddsMode: data.oddsSource?.mode,
      });
    } catch (err) {
      if (err.details) {
        setFieldErrors(err.details);
      }
      setError(err.message || 'Prediction failed. Check the server and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await requestPrediction({
      teamA: form.teamA,
      teamB: form.teamB,
      matchDate: form.matchDate,
    });
  };

  const handleMatchPrediction = async (match) => {
    const payload = matchToForm(match);
    setForm(payload);
    await requestPrediction(payload, { validate: false, matchId: match.id });
  };

  const handleRerunPrediction = async (item) => {
    const { teamA, teamB } = splitMatchName(item.match);
    const payload = {
      teamA,
      teamB,
      sport: item.sport || '',
      league: item.league || '',
      matchDate: item.matchDate,
      country: item.matchResolution?.country || '',
      kickoffTime: item.matchResolution?.kickoffTime || '',
    };
    setForm(payload);
    await requestPrediction(payload, { validate: false });
  };

  const handleAcceptAgeGate = () => {
    localStorage.setItem(ageGateKey, 'true');
    setAgeAccepted(true);
    trackEvent('age_gate_accepted');
  };

  const openComplianceModal = (modal) => {
    setComplianceModal(modal);
    trackEvent('compliance_modal_opened', { modal });
  };

  const scrollToDashboardTarget = (target) => {
    const sectionId = target === 'home' ? '' : target;
    const scrollToTarget = () => {
      if (target === 'home') {
        window.scrollTo({ top: 0, behavior: 'auto' });
        return;
      }

      const element = document.getElementById(sectionId);
      if (!element) return;

      const stickyOffset = 96;
      const targetTop = element.getBoundingClientRect().top + window.scrollY - stickyOffset;
      window.scrollTo({ top: Math.max(targetTop, 0), behavior: 'auto' });
    };

    window.requestAnimationFrame(() => {
      window.setTimeout(scrollToTarget, 0);
      window.setTimeout(scrollToTarget, 220);
    });
  };

  const loadTodayResearch = async ({ sport = todayFilters.sport, scroll = true } = {}) => {
    const nextSport = sport || 'Football';
    setTodayFilters((current) => ({ ...current, sport: nextSport }));
    setActiveFlow('browse');
    setTodayError('');
    setTodayLoading(true);

    if (scroll) {
      scrollToDashboardTarget('today-research');
    }

    try {
      const data = await api.getTodayPredictions({ date: today, sport: nextSport, limit: 12 });
      setTodayResearch(data);
      trackEvent('today_research_loaded', {
        sport: nextSport,
        matches: data.summary?.totalMatches,
        slips: data.summary?.totalSlipCount,
      });
    } catch (err) {
      setTodayError(err.message || 'Could not generate today research slips.');
      trackEvent('today_research_failed', { sport: nextSport });
    } finally {
      setTodayLoading(false);
      if (scroll) {
        window.setTimeout(() => scrollToDashboardTarget('today-research'), 120);
      }
    }
  };

  const handleTopNav = (target) => {
    if (target === 'today') {
      void loadTodayResearch();
      trackEvent('top_nav_clicked', { target });
      return;
    }

    if (target === 'accumulators' || target === 'predictions') {
      setActiveFlow('browse');
    }

    scrollToDashboardTarget(target);
    trackEvent('top_nav_clicked', { target });
  };

  const confidence = prediction?.mainPrediction?.confidence || 0;
  const confidenceTone = getConfidenceTone(confidence);
  const accumulatorIdeas = useMemo(
    () => buildAccumulatorIdeas({ matches, selectedCountry, selectedSport, selectedMatchDate }),
    [matches, selectedCountry, selectedSport, selectedMatchDate],
  );
  const statusLabel = useMemo(() => {
    const online = sourceStatus?.sources?.filter((source) => source.status === 'online').length || 0;
    const needsConfig = sourceStatus?.sources?.filter((source) => source.status === 'needs_config').length || 0;
    const total = sourceStatus?.sources?.length || 0;
    if (!total) return 'Adapters loading';
    return needsConfig ? `${online}/${total} active, ${needsConfig} needs key` : `${online}/${total} adapters active`;
  }, [sourceStatus]);

  return (
    <main className="min-h-screen bg-cloud text-ink">
      <TopNav onNavigate={handleTopNav} onOpen={openComplianceModal} />
      <HeroSection statusLabel={statusLabel} matchProvider={matchProvider} />

      <section className="mx-auto grid max-w-7xl scroll-mt-24 gap-5 px-3 pb-96 pt-4 sm:px-6 sm:pb-48 sm:pt-5 lg:grid-cols-[390px_minmax(0,1fr)] lg:px-8 lg:pb-28" id="predictions">
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <FlowTabs activeFlow={activeFlow} setActiveFlow={setActiveFlow} />
          <TodayActionPanel loading={todayLoading} onLoad={() => loadTodayResearch()} />
          <HowItWorks />

          {activeFlow === 'browse' ? (
            <BrowseMatchesPanel
              countries={countries}
              countriesLoading={countriesLoading}
              countriesError={countriesError}
              matchProvider={matchProvider}
              selectedCountry={selectedCountry}
              onRefreshCountries={loadCountries}
              onCountrySelect={loadSports}
              sports={sports}
              sportsLoading={sportsLoading}
              sportsError={sportsError}
              selectedSport={selectedSport}
              selectedMatchDate={selectedMatchDate}
              onMatchDateChange={handleBrowseDateChange}
              onReloadMatches={() => loadMatches(selectedSport, selectedMatchDate)}
              onSportSelect={loadMatches}
              matches={matches}
              matchesLoading={matchesLoading}
              matchesError={matchesError}
              selectedMatchId={selectedMatchId}
              predictionLoading={loading}
              onMatchPrediction={handleMatchPrediction}
            />
          ) : (
            <MatchForm
              form={form}
              setForm={setForm}
              loading={loading}
              onSubmit={handleSubmit}
              fieldErrors={fieldErrors}
            />
          )}

          <TrustPanel sourceStatus={sourceStatus} onOpen={openComplianceModal} />

          <AuthPanel
            user={authUser}
            loading={authLoading}
            error={authError}
            notice={authNotice}
            onSubmit={handleAuthSubmit}
            onLogout={handleLogout}
          />

          <HistoryPanel
            history={history}
            setHistory={setHistory}
            setPrediction={setPrediction}
            notice={historyNotice}
            onRerunPrediction={handleRerunPrediction}
          />
        </aside>

        <div className="min-w-0 space-y-5">
          <TodayResearchPanel
            data={todayResearch}
            loading={todayLoading}
            error={todayError}
            filters={todayFilters}
            onLoad={() => loadTodayResearch()}
            onFilterChange={(patch) => setTodayFilters((current) => ({ ...current, ...patch }))}
            onSportChange={(sport) => loadTodayResearch({ sport })}
          />

          {error && <ErrorBanner message={error} />}

          {loading ? (
            <LoadingState />
          ) : !prediction ? (
            <EmptyState activeFlow={activeFlow} />
          ) : (
            <>
              <MatchDetailHeader prediction={prediction} />
              <DataQualityPanel dataQuality={prediction.dataQuality} sourceSummary={prediction.sourceSummary} />
              <ProviderInsightsPanel prediction={prediction} />

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]" id="prediction-picks">
                <div className={`ui-card ui-card-pad ${confidenceTone.border}`} data-testid="prediction-summary">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink/50">{prediction.league}</p>
                      <h2 className="mt-1 break-words text-xl font-black leading-tight sm:text-2xl">{prediction.match}</h2>
                      <p className="mt-2 flex items-center gap-2 text-sm text-ink/60">
                        <Calendar className="h-4 w-4 shrink-0" />
                        {prediction.matchDate}
                      </p>
                    </div>
                    <Trophy className="h-8 w-8 shrink-0 text-sun" />
                  </div>

                  <div className="mt-5">
                    <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink/60">Main read</p>
                        <p className={`break-words text-2xl font-black ${confidenceTone.text}`}>{prediction.mainPrediction.pick}</p>
                      </div>
                      <p className={`text-sm font-bold ${confidenceTone.text}`}>{confidenceTone.label}</p>
                    </div>
                    <ConfidenceMeter value={confidence} />
                  </div>
                </div>

                <ValueBetCard valueBets={prediction.valueBets} />
              </section>

              <PredictionCards predictions={prediction.predictions} />
              <OddsTable rows={prediction.oddsComparison} source={prediction.oddsSource} />

              <section className="ui-card" data-testid="reasoning-section" id="prediction-stats">
                <button
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                  onClick={() => setReasoningOpen((open) => !open)}
                  type="button"
                >
                  <span className="flex items-center gap-2 font-black">
                    <Sparkles className="h-5 w-5 text-pitch" />
                    Why this pick
                  </span>
                  {reasoningOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </button>
                {reasoningOpen && <p className="border-t border-ink/10 p-4 text-sm leading-6 text-ink/75">{prediction.reasoning}</p>}
              </section>
            </>
          )}

          <CompactAccumulatorSection
            ideas={accumulatorIdeas}
            matchesAvailable={matches.length > 0}
            matchesLoading={matchesLoading}
            hasSelection={Boolean(selectedCountry && selectedSport)}
            selectedAccumulator={selectedAccumulator}
            onBrowseMatches={() => handleTopNav('predictions')}
            onSelect={(idea) => {
              setSelectedAccumulator(idea);
              trackEvent('accumulator_selected', {
                id: idea.id,
                horizon: idea.horizon,
                legs: idea.legs.length,
                combinedOdds: idea.combinedOdds,
              });
            }}
          />
        </div>
      </section>

      {!ageAccepted && <AgeGateModal onAccept={handleAcceptAgeGate} />}
      {complianceModal && <ComplianceModal type={complianceModal} onClose={() => setComplianceModal('')} />}
    </main>
  );
}

function TopNav({ onNavigate, onOpen }) {
  const links = [
    { label: 'Predictions', target: 'predictions' },
    { label: 'Accumulators', target: 'accumulators' },
    { label: 'Today', target: 'today' },
    { label: 'History', target: 'history' },
  ];
  const mobileLinks = [
    { label: 'Home', target: 'home' },
    { label: 'Predictions', target: 'predictions' },
    { label: 'Today', target: 'today' },
    { label: 'Accumulators', target: 'accumulators' },
    { label: 'History', target: 'history' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2 sm:px-6 lg:px-8">
        <button
          className="flex min-w-0 items-center gap-2 font-black text-ink"
          type="button"
          onClick={() => onNavigate('home')}
          aria-label="Kenya Matchday Predictor home"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-pitch text-sm text-white">KM</span>
          <span className="truncate">Matchday Predictor</span>
        </button>
        <nav className="hidden items-center gap-1 sm:flex">
          {links.map((link) => (
            <button
              key={link.label}
              className="rounded px-3 py-2 text-sm font-black text-ink/65 hover:bg-pitch/5 hover:text-pitch"
              type="button"
              onClick={() => onNavigate(link.target)}
            >
              {link.label}
            </button>
          ))}
          <button className="rounded px-3 py-2 text-sm font-black text-ink/65 hover:bg-pitch/5 hover:text-pitch" type="button" onClick={() => onOpen('responsible')}>
            Safety
          </button>
        </nav>
        <button className="ui-button-secondary hidden items-center gap-2 px-3 py-2 text-xs sm:flex" type="button" onClick={() => onNavigate('predictions')}>
          View picks
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <nav className="flex gap-2 overflow-x-auto border-t border-ink/10 px-3 py-2 sm:hidden" aria-label="Mobile navigation">
        {mobileLinks.map((link) => (
          <button
            key={link.label}
            className="shrink-0 rounded border border-ink/10 bg-white px-3 py-2 text-xs font-black text-ink/65 hover:border-pitch/30 hover:text-pitch"
            type="button"
            onClick={() => onNavigate(link.target)}
          >
            {link.label}
          </button>
        ))}
      </nav>
    </header>
  );
}

function HeroSection({ statusLabel, matchProvider }) {
  return (
    <section className="border-b border-ink/10 bg-white" id="top">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
        <div className="relative min-h-[220px] overflow-hidden rounded border border-ink/10 bg-ink text-white shadow-sm sm:min-h-[250px]">
          <img
            className="absolute inset-0 h-full w-full object-cover object-center"
            src={heroImage}
            alt="Kenyan football fans at a Nairobi stadium during matchday"
          />
          <div className="absolute inset-0 bg-ink/70" />
          <div className="relative grid min-h-[220px] gap-4 p-4 sm:min-h-[250px] sm:p-5 lg:grid-cols-[minmax(0,1fr)_310px]">
            <div className="flex max-w-2xl flex-col justify-between gap-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-lime">Karibu, mchezaji smart</p>
                <h1 className="mt-2 text-2xl font-black leading-tight sm:text-4xl">Kenya Matchday Predictor</h1>
                <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-white/80">
                  Pick a country, choose a sport, open a real fixture, then read the prediction before kickoff.
                </p>
              </div>

              <div className="hidden flex-wrap gap-2 sm:flex">
                <span className="rounded border border-white/20 bg-white/10 px-3 py-2 text-xs font-black text-white">
                  1X2
                </span>
                <span className="rounded border border-white/20 bg-white/10 px-3 py-2 text-xs font-black text-white">
                  BTTS
                </span>
                <span className="rounded border border-white/20 bg-white/10 px-3 py-2 text-xs font-black text-white">
                  Over/Under 2.5
                </span>
                <span className="rounded border border-white/20 bg-white/10 px-3 py-2 text-xs font-black text-white">
                  Correct Score
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-end gap-3">
              <div className="rounded border border-white/15 bg-white/10 p-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-lime">Dashboard status</p>
                <div className="mt-3 grid gap-2 text-sm font-bold text-white/85">
                  <p className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-lime" />
                    {statusLabel}
                  </p>
                  <p className="flex items-center gap-2">
                    <Globe2 className="h-4 w-4 text-sun" />
                    {getProviderLabel(matchProvider)}
                  </p>
                  <p className="flex items-center gap-2">
                    <Save className="h-4 w-4 text-white" />
                    Local saved history
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 rounded border border-sun/35 bg-sun/15 p-3 text-xs font-semibold text-ink sm:text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-clay" />
          <p>Predictions are informational only. Betting involves risk. Hakuna guaranteed wins, and this app does not place bets.</p>
        </div>
      </div>
    </section>
  );
}

function AgeGateModal({ onAccept }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4">
      <section className="max-w-lg rounded border border-white/10 bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-pitch" />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-pitch">18+ responsible use</p>
            <h2 className="mt-2 text-2xl font-black">Before you continue</h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              This app provides informational sports analysis only. It does not place bets, does not guarantee wins, and should only be used by adults.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded border border-sun/35 bg-sun/15 p-3 text-sm font-semibold text-ink/75">
          If betting stops being fun, take a break. Never stake money you cannot afford to lose.
        </div>
        <button className="ui-button-primary mt-4 w-full" type="button" onClick={onAccept} data-testid="age-accept-button">
          I am 18+ and understand the risk
        </button>
      </section>
    </div>
  );
}

function TrustPanel({ sourceStatus, onOpen }) {
  const needsConfig = sourceStatus?.sources?.filter((source) => source.status === 'needs_config') || [];
  const realSources = sourceStatus?.sources?.filter((source) => source.mode === 'real-api') || [];

  return (
    <section className="ui-card ui-card-pad">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-pitch" />
        <div>
          <h2 className="font-black">Trust & safety</h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-ink/55">
            Built for 18+ informational research. No deposits, no bet placement, no guaranteed wins.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs font-bold text-ink/65">
        <p className="rounded border border-pitch/15 bg-pitch/5 px-3 py-2">
          {realSources.length ? `${realSources.length} real-data source${realSources.length === 1 ? '' : 's'} active` : 'Real data activates when provider keys are configured'}
        </p>
        {needsConfig.length > 0 && (
          <p className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-yellow-700">
            {needsConfig.length} source{needsConfig.length === 1 ? '' : 's'} need API keys before launch.
          </p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button className="ui-button-secondary px-2 py-2 text-xs" type="button" onClick={() => onOpen('responsible')}>
          Safety
        </button>
        <button className="ui-button-secondary px-2 py-2 text-xs" type="button" onClick={() => onOpen('privacy')}>
          Privacy
        </button>
        <button className="ui-button-secondary px-2 py-2 text-xs" type="button" onClick={() => onOpen('terms')}>
          Terms
        </button>
      </div>
    </section>
  );
}

function AuthPanel({ user, loading, error, notice, onSubmit, onLogout }) {
  const [mode, setMode] = useState('login');
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const update = (field) => (event) => setCredentials((current) => ({ ...current, [field]: event.target.value }));

  if (user) {
    return (
      <section className="ui-card ui-card-pad">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-pitch" />
          <div className="min-w-0">
            <h2 className="font-black">Account sync</h2>
            <p className="mt-1 truncate text-xs font-semibold text-ink/55">{user.email}</p>
          </div>
        </div>
        {notice && <p className="mt-3 rounded border border-pitch/15 bg-pitch/5 px-3 py-2 text-xs font-bold text-pitch">{notice}</p>}
        <button className="ui-button-secondary mt-3 w-full" type="button" onClick={onLogout}>
          Log out
        </button>
      </section>
    );
  }

  return (
    <section className="ui-card ui-card-pad">
      <div className="mb-3 flex items-start gap-2">
        <Save className="mt-0.5 h-5 w-5 text-pitch" />
        <div>
          <h2 className="font-black">Save across devices</h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-ink/55">
            Optional account sync for saved predictions. You can still use device history without logging in.
          </p>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        {['login', 'register'].map((item) => (
          <button
            key={item}
            className={`rounded px-3 py-2 text-xs font-black ${mode === item ? 'bg-pitch text-white' : 'bg-ink/5 text-ink/60'}`}
            type="button"
            onClick={() => setMode(item)}
          >
            {item === 'login' ? 'Login' : 'Register'}
          </button>
        ))}
      </div>

      <div className="grid gap-2">
        <input
          className="ui-input"
          type="email"
          placeholder="Email"
          value={credentials.email}
          onInput={update('email')}
          onChange={update('email')}
          data-testid="auth-email"
        />
        <input
          className="ui-input"
          type="password"
          placeholder="Password"
          value={credentials.password}
          onInput={update('password')}
          onChange={update('password')}
          data-testid="auth-password"
        />
      </div>

      {error && <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
      {notice && <p className="mt-2 rounded border border-pitch/15 bg-pitch/5 px-3 py-2 text-xs font-bold text-pitch">{notice}</p>}

      <button
        className="ui-button-primary mt-3 flex w-full items-center justify-center gap-2"
        type="button"
        disabled={loading}
        onClick={() => onSubmit(mode, credentials)}
        data-testid="auth-submit"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {loading ? 'Please wait' : mode === 'login' ? 'Login' : 'Create account'}
      </button>
    </section>
  );
}

function ComplianceModal({ type, onClose }) {
  const content = {
    responsible: {
      title: 'Responsible play',
      body: [
        'Use predictions as research, not instructions. Results are uncertain and odds move quickly.',
        'Only adults should use betting-related tools. Set limits, take breaks, and never chase losses.',
        'This app does not accept deposits, place bets, automate bets, or guarantee wins.',
      ],
    },
    privacy: {
      title: 'Privacy summary',
      body: [
        'Saved predictions stay in this browser through LocalStorage.',
        'Product analytics are anonymous event counts used to improve the app. They do not include payment data, bet placement, or account credentials.',
        'Before a public launch, connect a full privacy policy, cookie notice, deletion flow, and ODPC compliance review.',
      ],
    },
    terms: {
      title: 'Terms summary',
      body: [
        'Predictions are informational only and may be wrong.',
        'Odds and fixtures depend on third-party providers and may be delayed, incomplete, or unavailable.',
        'Before launch, replace this summary with lawyer-reviewed terms and any regulator-required disclosures.',
      ],
    },
  }[type];

  if (!content) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4">
      <section className="max-w-lg rounded border border-ink/10 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-pitch">Production guardrail</p>
            <h2 className="mt-2 text-2xl font-black">{content.title}</h2>
          </div>
          <button className="ui-icon-button" type="button" onClick={onClose} aria-label="Close modal">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 grid gap-3 text-sm leading-6 text-ink/70">
          {content.body.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
        <button className="ui-button-primary mt-5 w-full" type="button" onClick={onClose}>
          Got it
        </button>
      </section>
    </div>
  );
}

function FlowTabs({ activeFlow, setActiveFlow }) {
  const tabs = [
    { id: 'browse', label: 'Browse Matches', icon: Globe2 },
    { id: 'search', label: 'Search Match', icon: Search },
  ];

  return (
    <div className="ui-card grid grid-cols-2 gap-2 p-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeFlow === tab.id;

        return (
          <button
            key={tab.id}
            className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-black transition ${
              isActive ? 'bg-pitch text-white' : 'text-ink/60 hover:bg-ink/5'
            }`}
            type="button"
            onClick={() => {
              setActiveFlow(tab.id);
              trackEvent('tab_changed', { tab: tab.id });
            }}
            aria-pressed={isActive}
            data-testid={`tab-${tab.id}`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function TodayActionPanel({ loading, onLoad }) {
  return (
    <section className="ui-card ui-card-pad">
      <div className="flex items-start gap-2">
        <Calendar className="mt-0.5 h-5 w-5 text-pitch" />
        <div>
          <h2 className="font-black">Today picks</h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-ink/55">
            Generate AI research slips from today&apos;s available fixtures before choosing a match.
          </p>
        </div>
      </div>
      <button
        className="ui-button-primary mt-3 flex w-full items-center justify-center gap-2"
        type="button"
        disabled={loading}
        onClick={onLoad}
        data-testid="today-action-button"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? 'Researching today' : 'Today AI slips'}
      </button>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    'Select country',
    'Choose sport and date',
    'Open match prediction',
  ];

  return (
    <section className="ui-card ui-card-pad">
      <h2 className="flex items-center gap-2 font-black">
        <CheckCircle2 className="h-5 w-5 text-pitch" />
        How it works
      </h2>
      <div className="mt-3 grid gap-2">
        {steps.map((step, index) => (
          <div key={step} className="flex items-center gap-2 rounded border border-ink/10 bg-ink/[0.02] px-3 py-2 text-sm font-black text-ink/70">
            <span className="grid h-6 w-6 place-items-center rounded bg-pitch text-xs text-white">{index + 1}</span>
            {step}
          </div>
        ))}
      </div>
    </section>
  );
}

function BrowseMatchesPanel({
  countries,
  countriesLoading,
  countriesError,
  matchProvider,
  selectedCountry,
  onRefreshCountries,
  onCountrySelect,
  sports,
  sportsLoading,
  sportsError,
  selectedSport,
  selectedMatchDate,
  onMatchDateChange,
  onReloadMatches,
  onSportSelect,
  matches,
  matchesLoading,
  matchesError,
  selectedMatchId,
  predictionLoading,
  onMatchPrediction,
}) {
  const [activeMatchId, setActiveMatchId] = useState('');
  const canLoadMatches = Boolean(selectedCountry && selectedSport && selectedMatchDate && !matchesLoading);
  const activeMatch = matches.find((match) => match.id === activeMatchId) || null;

  useEffect(() => {
    setActiveMatchId('');
  }, [selectedCountry, selectedSport, selectedMatchDate]);

  useEffect(() => {
    if (matches.length > 0 && !matches.some((match) => match.id === activeMatchId)) {
      setActiveMatchId(matches[0].id);
    }
  }, [matches, activeMatchId]);

  return (
    <section className="ui-card overflow-hidden" data-testid="browse-flow-panel">
      <div className="border-b border-ink/10 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-black">
              <Flag className="h-5 w-5 text-pitch" />
              Start with a match
            </h2>
            <p className="mt-1 text-xs font-semibold text-ink/50">
              Country, sport, date, then pick the game you want.
            </p>
          </div>
          <button
            className="ui-icon-button"
            type="button"
            onClick={onRefreshCountries}
            disabled={countriesLoading}
            aria-label="Refresh countries"
          >
            <RefreshCw className={`h-4 w-4 ${countriesLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <BrowseProgress
          selectedCountry={selectedCountry}
          selectedSport={selectedSport}
          selectedMatchDate={selectedMatchDate}
          selectedMatchId={selectedMatchId}
          matchCount={matches.length}
        />
      </div>

      <div className="grid gap-4 p-4">
        {matchProvider && (
          <div className="flex items-center gap-2 rounded border border-pitch/15 bg-pitch/5 px-3 py-2 text-xs font-black text-pitch">
            <Globe2 className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{getProviderLabel(matchProvider)}</span>
          </div>
        )}

        {countriesError && <InlineError message={countriesError} />}

        <label className="ui-label">
          Country / region
          <select
            className="ui-input min-h-11 w-full"
            value={selectedCountry}
            onChange={(event) => {
              const country = event.target.value;
              setActiveMatchId('');
              if (country) onCountrySelect(country);
            }}
            disabled={countriesLoading}
            data-testid="country-select"
          >
            <option value="">{countriesLoading ? 'Loading countries...' : 'Select country'}</option>
            {countries.map((item) => (
              <option key={item.country} value={item.country}>
                {item.country}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
          <label className="ui-label">
            Sport
            <select
              className="ui-input min-h-11 w-full"
              value={selectedSport}
              onChange={(event) => {
                const sport = event.target.value;
                setActiveMatchId('');
                if (sport) onSportSelect(sport);
              }}
              disabled={!selectedCountry || sportsLoading || sports.length === 0}
              data-testid="sport-select"
            >
              <option value="">
                {!selectedCountry
                  ? 'Select country first'
                  : sportsLoading
                    ? 'Loading sports...'
                    : sports.length
                      ? 'Select sport'
                      : 'No sports found'}
              </option>
              {sports.map((item) => (
                <option key={item.sport} value={item.sport}>
                  {item.sport} ({item.leagueCount})
                </option>
              ))}
            </select>
          </label>

          <label className="ui-label">
            Fixture date
            <input
              className="ui-input min-h-11"
              type="date"
              min={today}
              value={selectedMatchDate}
              onChange={(event) => onMatchDateChange(event.target.value)}
              disabled={!selectedCountry}
              data-testid="fixture-date-input"
            />
          </label>
        </div>

        {sportsError && <InlineError message={sportsError} />}

        {selectedCountry && !sportsLoading && sports.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {sports.map((item) => (
              <button
                key={item.sport}
                className={`tap-card py-2 ${selectedSport === item.sport ? 'tap-card-active' : ''}`}
                type="button"
                onClick={() => {
                  setActiveMatchId('');
                  onSportSelect(item.sport);
                }}
                aria-pressed={selectedSport === item.sport}
                data-testid={`sport-${item.sport}`}
              >
                <p className="text-sm font-black">{item.sport}</p>
                <p className="mt-1 text-xs font-semibold text-ink/45">{formatCount(item.leagueCount, 'league')}</p>
              </button>
            ))}
          </div>
        )}

        {selectedCountry && !sportsLoading && sports.length === 0 && !sportsError && (
          <PanelEmptyState
            title="No sports feed found"
            message="This region is available, but the fixture provider did not return supported sports. Try International or another country."
          />
        )}

        <button
          className="ui-button-secondary flex items-center justify-center gap-2"
          type="button"
          onClick={onReloadMatches}
          disabled={!canLoadMatches}
          data-testid="load-games-button"
        >
          {matchesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {matchesLoading ? 'Loading games' : 'Refresh games'}
        </button>

        {selectedCountry && selectedSport && (
          <div className="rounded border border-ink/10 bg-ink/[0.02] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 font-black">
                  <Calendar className="h-4 w-4 text-pitch" />
                  Available matches
                </h3>
                <p className="mt-1 truncate text-xs font-semibold text-ink/50">
                  {selectedCountry} - {selectedSport} - {selectedMatchDate}
                </p>
                <p className="mt-1 text-xs font-bold text-pitch">Times shown in Kenya time</p>
              </div>
              <span className="rounded border border-ink/10 bg-white px-2 py-1 text-xs font-black text-ink/55">
                {matchesLoading ? '...' : matches.length}
              </span>
            </div>

            {matchesError && <InlineError message={matchesError} />}

            {matchesLoading && (
              <div className="space-y-2">
                {Array.from({ length: 3 }, (_, index) => (
                  <div key={index} className="h-24 animate-pulse rounded border border-ink/10 bg-white" />
                ))}
              </div>
            )}

            {!matchesLoading && matches.length === 0 && !matchesError && (
              <PanelEmptyState
                title="Hakuna matches found"
                message="No real fixtures were returned for this country, sport, and date. Try another date from the calendar."
              />
            )}

            {!matchesLoading && matches.length > 0 && (
              <div className="grid gap-3">
                <label className="ui-label">
                  Quick match picker
                  <select
                    className="ui-input min-h-11 w-full"
                    value={activeMatchId}
                    onChange={(event) => setActiveMatchId(event.target.value)}
                    data-testid="match-select"
                  >
                    {matches.map((match) => (
                      <option key={match.id} value={match.id}>
                        {match.teamA} vs {match.teamB} - {match.kickoffTime}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className="ui-button-primary flex w-full items-center justify-center gap-2"
                  type="button"
                  onClick={() => activeMatch && onMatchPrediction(activeMatch)}
                  disabled={!activeMatch || predictionLoading}
                  data-testid="view-selected-prediction"
                >
                  {predictionLoading && activeMatch?.id === selectedMatchId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  View selected prediction
                </button>

                <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
                  {matches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      isSelected={selectedMatchId === match.id || activeMatchId === match.id}
                      isBusy={predictionLoading && selectedMatchId === match.id}
                      disabled={predictionLoading}
                      onPrediction={() => onMatchPrediction(match)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function BrowseProgress({ selectedCountry, selectedSport, selectedMatchDate, selectedMatchId, matchCount }) {
  const steps = [
    {
      label: '1 Country',
      value: selectedCountry || 'Chagua region',
      done: Boolean(selectedCountry),
      active: !selectedCountry,
    },
    {
      label: '2 Sport',
      value: selectedSport || 'Chagua sport',
      done: Boolean(selectedSport),
      active: Boolean(selectedCountry && !selectedSport),
    },
    {
      label: '3 Date',
      value: selectedSport ? selectedMatchDate : 'Waiting',
      done: Boolean(selectedSport && selectedMatchDate),
      active: Boolean(selectedCountry && selectedSport && !selectedMatchDate),
    },
    {
      label: '4 Pick',
      value: selectedMatchId ? 'Opened' : matchCount ? formatCount(matchCount, 'match', 'matches') : 'Pick a game',
      done: Boolean(selectedMatchId),
      active: Boolean(selectedSport && matchCount > 0 && !selectedMatchId),
    },
  ];

  return (
    <div className="mt-4" data-testid="browse-progress">
      <div className="grid grid-cols-2 gap-2">
        {steps.map((step) => (
          <div
            key={step.label}
            className={`rounded border px-2.5 py-2 ${
              step.done
                ? 'border-pitch/25 bg-pitch/5'
                : step.active
                  ? 'border-sun/45 bg-sun/10'
                  : 'border-ink/10 bg-ink/[0.02]'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-ink/45">
              {step.done ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-pitch" /> : <span className="h-2 w-2 shrink-0 rounded-full bg-ink/25" />}
              {step.label}
            </div>
            <p className="mt-1 truncate text-sm font-black text-ink">{step.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelEmptyState({ title, message, className = '' }) {
  return (
    <div className={`rounded border border-dashed border-ink/20 bg-ink/[0.02] p-4 ${className}`}>
      <p className="font-black text-ink">{title}</p>
      <p className="mt-1 text-sm leading-5 text-ink/55">{message}</p>
    </div>
  );
}

function MatchCard({ match, isSelected, isBusy, disabled, onPrediction }) {
  return (
    <article
      className={`rounded border p-3 transition ${isSelected ? 'border-pitch bg-pitch/5' : 'border-ink/10 bg-white hover:border-pitch/30'}`}
      data-testid={`match-card-${match.id}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded border border-pitch/20 bg-pitch/5 text-xs font-black text-pitch">
          {teamInitials(match.teamA)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-xs font-bold uppercase tracking-[0.12em] text-ink/45">{match.league}</p>
            <span className={`shrink-0 rounded border px-2 py-1 text-xs font-black ${getStatusTone(match.status)}`}>
              {match.status}
            </span>
          </div>
          <h3 className="mt-1 break-words text-base font-black leading-tight">{match.teamA} vs {match.teamB}</h3>
          <div className="mt-2 grid gap-1 text-xs font-semibold text-ink/55">
            <p className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {match.matchDate} at {match.kickoffTime}
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{match.country} - {match.venue}</span>
            </p>
          </div>
        </div>
      </div>

      <button
        className="ui-button-primary mt-3 flex w-full items-center justify-center gap-2 py-2.5"
        type="button"
        onClick={onPrediction}
        disabled={disabled}
        data-testid={`view-prediction-${match.id}`}
      >
        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {isBusy ? 'Reading game' : 'View Prediction'}
      </button>
    </article>
  );
}

function CompactAccumulatorSection({
  ideas,
  matchesAvailable,
  matchesLoading,
  hasSelection,
  selectedAccumulator,
  onBrowseMatches,
  onSelect,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const canShowIdeas = Boolean(selectedAccumulator || (matchesAvailable && ideas.length > 0));
  const featuredIdea = canShowIdeas ? selectedAccumulator || ideas[0] : null;
  const featuredTone = featuredIdea ? getConfidenceTone(featuredIdea.confidence) : null;

  return (
    <section className="ui-card scroll-mt-24 overflow-hidden" data-testid="accumulator-section" id="accumulators">
      <button
        className="flex w-full items-start justify-between gap-3 border-b border-ink/10 bg-white p-4 text-left"
        type="button"
        onClick={() => canShowIdeas && setIsOpen((open) => !open)}
        aria-expanded={canShowIdeas ? isOpen : true}
      >
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-pitch">
            <Trophy className="h-4 w-4 text-sun" />
            Accumulators
          </p>
          <h2 className="mt-1 text-xl font-black leading-tight">Acca of the day & long-term multis</h2>
          <p className="mt-1 text-sm font-semibold text-ink/55">
            Optional bet-builder ideas for research. Verify live markets before staking anywhere.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden rounded border border-sun/35 bg-sun/15 px-3 py-2 text-xs font-black text-ink sm:inline-flex">
            Research only
          </span>
          {canShowIdeas && (isOpen ? <ChevronUp className="h-5 w-5 text-ink/45" /> : <ChevronDown className="h-5 w-5 text-ink/45" />)}
        </div>
      </button>

      {!canShowIdeas ? (
        <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="rounded border border-dashed border-ink/20 bg-ink/[0.02] p-4">
            <p className="font-black">
              {matchesLoading
                ? 'Loading accumulator fixtures'
                : matchesAvailable
                  ? 'Accumulator ideas need real odds-backed legs.'
                  : hasSelection
                    ? 'No odds-backed accumulator legs found.'
                  : 'Select matches to build an accumulator.'}
            </p>
            <p className="mt-2 text-sm leading-6 text-ink/55">
              {matchesLoading
                ? 'Fetching available games now. Accumulator ideas will appear when fixtures are ready.'
                : matchesAvailable
                  ? 'The old sample multibet builder is disabled here so the app does not invent odds or apply football markets to other sports. Use Today AI slips for real-odds accumulator ideas.'
                  : hasSelection
                    ? 'No fixture cards with real odds are available for this country, sport, and date yet. Try Today AI slips or another date.'
                    : 'Start with country, sport, and date. Accumulator ideas will appear only when connected providers return enough real odds-backed legs.'}
            </p>
          </div>
          <button className="ui-button-primary flex items-center justify-center gap-2 px-4 py-2.5" type="button" onClick={onBrowseMatches}>
            Browse fixtures
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : !isOpen ? (
        <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="ui-chip">{featuredIdea.horizon}</span>
              <span className={`rounded border px-2 py-1 text-xs font-black ${featuredTone.soft} ${featuredTone.text}`}>
                {featuredIdea.confidence}% confidence
              </span>
              <span className="ui-chip">{featuredIdea.legs.length} legs</span>
            </div>
            <h3 className="mt-2 text-lg font-black">{featuredIdea.title}</h3>
            <p className="mt-1 text-sm font-semibold text-ink/55">{featuredIdea.subtitle}</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-3 sm:flex">
            <div className="rounded border border-ink/10 bg-ink/[0.03] px-3 py-2 text-right">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-ink/45">Combined</p>
              <p className="text-xl font-black text-pitch">{formatOdds(featuredIdea.combinedOdds)}</p>
            </div>
            <button className="ui-button-secondary whitespace-nowrap" type="button" onClick={() => setIsOpen(true)}>
              Show multibets
            </button>
          </div>
        </div>
      ) : null}

      {canShowIdeas && isOpen && (
        <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid gap-3">
            {ideas.map((idea) => {
              const tone = getConfidenceTone(idea.confidence);
              const isSelected = selectedAccumulator?.id === idea.id;

              return (
                <article
                  key={idea.id}
                  className={`rounded border p-4 transition ${isSelected ? 'border-pitch bg-pitch/5' : 'border-ink/10 bg-white hover:border-pitch/35'}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <span className="ui-chip">{idea.horizon}</span>
                        <span className={`rounded border px-2 py-1 text-xs font-black ${tone.soft} ${tone.text}`}>{idea.confidence}% confidence</span>
                        <span className="ui-chip">{idea.risk} risk</span>
                      </div>
                      <h3 className="mt-3 text-xl font-black">{idea.title}</h3>
                      <p className="mt-1 text-sm font-semibold text-ink/55">{idea.subtitle}</p>
                    </div>
                    <div className="rounded border border-ink/10 bg-ink/[0.03] px-3 py-2 text-right">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-ink/45">Combined</p>
                      <p className="text-2xl font-black text-pitch">{formatOdds(idea.combinedOdds)}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2">
                    {idea.legs.map((leg, index) => (
                      <div key={leg.id} className="rounded border border-ink/10 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-ink/40">Leg {index + 1} - {leg.market}</p>
                            <p className="mt-1 break-words font-black">{leg.pick}</p>
                            <p className="mt-1 break-words text-xs font-semibold text-ink/55">{leg.match} - {leg.league}</p>
                          </div>
                          <span className="shrink-0 rounded bg-pitch/5 px-2 py-1 text-sm font-black text-pitch">{formatOdds(leg.odds)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button className="ui-button-primary mt-4 flex w-full items-center justify-center gap-2 py-2.5" type="button" onClick={() => onSelect(idea)}>
                    {isSelected ? <CheckCircle2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    {isSelected ? 'Selected' : 'Pick this multibet'}
                  </button>
                </article>
              );
            })}
          </div>

          <SelectedAccumulatorCard selectedAccumulator={selectedAccumulator} />
        </div>
      )}
    </section>
  );
}

function SelectedAccumulatorCard({ selectedAccumulator }) {
  if (!selectedAccumulator) {
    return (
      <aside className="rounded border border-dashed border-ink/20 bg-ink/[0.02] p-4">
        <p className="font-black">Your selected multibet</p>
        <p className="mt-2 text-sm leading-6 text-ink/55">
          Choose an accumulator card to review the legs here. This is a watchlist only, not a betting slip.
        </p>
      </aside>
    );
  }

  const tone = getConfidenceTone(selectedAccumulator.confidence);

  return (
    <aside className="rounded border border-pitch/20 bg-pitch p-4 text-white">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-lime">Selected multibet</p>
      <h3 className="mt-2 text-2xl font-black">{selectedAccumulator.title}</h3>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded bg-white/10 p-3">
          <p className="text-white/60">Combined odds</p>
          <p className="text-xl font-black">{formatOdds(selectedAccumulator.combinedOdds)}</p>
        </div>
        <div className="rounded bg-white/10 p-3">
          <p className="text-white/60">Confidence</p>
          <p className="text-xl font-black">{selectedAccumulator.confidence}%</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {selectedAccumulator.legs.map((leg, index) => (
          <p key={leg.id} className="rounded bg-white/10 p-2 text-sm font-semibold text-white/85">
            {index + 1}. {leg.pick} - {formatOdds(leg.odds)}
          </p>
        ))}
      </div>
      <p className={`mt-4 rounded bg-white p-3 text-xs font-black ${tone.text}`}>
        Verify live odds before using this anywhere. No automatic bet placement.
      </p>
    </aside>
  );
}

function FilterPillGroup({ label, options, value, onChange, disabled }) {
  return (
    <div>
      <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-ink/45">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            className={`rounded border px-3 py-2 text-xs font-black transition ${
              value === option.value
                ? 'border-pitch bg-pitch text-white'
                : 'border-ink/10 bg-white text-ink/60 hover:border-pitch/30 hover:text-pitch'
            }`}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TodayResearchPanel({ data, loading, error, filters, onLoad, onFilterChange, onSportChange }) {
  const groups = todaySectionOrder.map((key) => {
    const group = data?.groups?.[key] || { key, title: todaySectionFallbackTitles[key], items: [] };
    const items = (group.items || []).filter((item) => {
      const riskMatches = filters.risk === 'all' || item.confidenceBand === filters.risk;
      const typeMatches = filters.type === 'all' || item.kind === filters.type;
      return riskMatches && typeMatches;
    });

    return {
      ...group,
      title: group.title || todaySectionFallbackTitles[key],
      items,
    };
  });
  const visibleGroups = groups.filter((group) => group.items.length > 0);
  const totalVisible = visibleGroups.reduce((total, group) => total + group.items.length, 0);

  return (
    <section className="ui-card scroll-mt-24 overflow-hidden" id="today-research" data-testid="today-research-panel">
      <div className="border-b border-ink/10 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-pitch">
              <Sparkles className="h-4 w-4 text-sun" />
              Today
            </p>
            <h2 className="mt-1 text-xl font-black leading-tight">AI-researched betting slip ideas</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-ink/55">
              Research suggestions from connected fixture, odds, form, standings, injuries, prediction-source, and weather data. No guaranteed wins.
            </p>
          </div>
          <button
            className="ui-button-primary flex shrink-0 items-center justify-center gap-2"
            type="button"
            disabled={loading}
            onClick={onLoad}
            data-testid="today-refresh-button"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {loading ? 'Generating' : data ? 'Refresh today' : 'Generate Today'}
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <FilterPillGroup
            label="Sport"
            options={todaySportFilters}
            value={filters.sport}
            disabled={loading}
            onChange={(sport) => onSportChange(sport)}
          />
          <div className="grid gap-3 lg:grid-cols-2">
            <FilterPillGroup
              label="Confidence"
              options={todayRiskFilters}
              value={filters.risk}
              disabled={loading}
              onChange={(risk) => onFilterChange({ risk })}
            />
            <FilterPillGroup
              label="Pick type"
              options={todayTypeFilters}
              value={filters.type}
              disabled={loading}
              onChange={(type) => onFilterChange({ type })}
            />
          </div>
        </div>
      </div>

      {loading && <TodaySkeleton />}

      {!loading && error && (
        <div className="p-4">
          <InlineError message={error} />
        </div>
      )}

      {!loading && !error && !data && (
        <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <PanelEmptyState
            title="Ready for today's research"
            message="Click Today AI slips to fetch available matches and generate research-only singles and accumulators."
          />
          <button className="ui-button-secondary flex items-center justify-center gap-2" type="button" onClick={onLoad}>
            Start research
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <div className="grid gap-4 p-4">
          <div className="grid gap-2 sm:grid-cols-4">
            <TodayMetric label="Matches" value={data.summary?.totalMatches || 0} />
            <TodayMetric label="Analyzed" value={data.analyzedMatches || 0} />
            <TodayMetric label="Slip ideas" value={data.summary?.totalSlipCount || 0} />
            <TodayMetric label="Sport" value={data.sport || filters.sport} />
          </div>

          <div className="rounded border border-sun/35 bg-sun/15 p-3 text-sm font-semibold leading-6 text-ink/75">
            {data.summary?.note || 'AI research suggestions are informational only. Betting involves risk.'}
          </div>

          {data.emptyState && totalVisible === 0 && (
            <PanelEmptyState
              title="No reliable slips generated"
              message={data.emptyState}
            />
          )}

          {!data.emptyState && totalVisible === 0 && (
            <PanelEmptyState
              title="No slips match this filter"
              message="Try All confidence, All picks, or Football only. Missing odds or prediction-source data moves matches into Research-only or Insufficient data."
            />
          )}

          {visibleGroups.map((group) => (
            <TodaySlipGroup key={group.key} group={group} />
          ))}

          {data.skippedMatches?.length > 0 && (
            <details className="rounded border border-ink/10 bg-ink/[0.02] p-3">
              <summary className="cursor-pointer text-sm font-black">Matches skipped because provider data was unavailable</summary>
              <div className="mt-3 grid gap-2">
                {data.skippedMatches.slice(0, 8).map((item) => (
                  <p key={`${item.match}-${item.reason}`} className="rounded bg-white p-2 text-xs font-bold text-ink/60">
                    {item.match} - {item.reason}
                  </p>
                ))}
              </div>
            </details>
          )}

          <p className="rounded border border-red-100 bg-red-50 p-3 text-xs font-black text-red-700">
            {data.riskWarning || 'Predictions are informational only. Betting involves risk.'}
          </p>
        </div>
      )}
    </section>
  );
}

function TodaySkeleton() {
  return (
    <div className="grid gap-4 p-4" data-testid="today-loading-state">
      <div className="grid gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-20 animate-pulse rounded border border-ink/10 bg-ink/[0.03]" />
        ))}
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="h-40 animate-pulse rounded border border-ink/10 bg-ink/[0.03]" />
      ))}
    </div>
  );
}

function TodayMetric({ label, value }) {
  return (
    <div className="rounded border border-ink/10 bg-white p-3">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-ink/40">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-ink">{value}</p>
    </div>
  );
}

function TodaySlipGroup({ group }) {
  return (
    <section className="rounded border border-ink/10 bg-ink/[0.02] p-3" data-testid={`today-group-${group.key}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-black">{group.title}</h3>
        <span className="rounded border border-ink/10 bg-white px-2 py-1 text-xs font-black text-ink/55">
          {group.items.length}
        </span>
      </div>
      <div className="grid gap-3">
        {group.items.map((slip) => (
          <TodaySlipCard key={slip.id} slip={slip} />
        ))}
      </div>
    </section>
  );
}

function TodaySlipCard({ slip }) {
  const tone = getConfidenceTone(slip.confidence);

  return (
    <article className={`rounded border bg-white p-4 ${tone.border}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded border px-2 py-1 text-xs font-black ${tone.soft} ${tone.text}`}>{slip.confidence}%</span>
            <span className="ui-chip">{slip.confidenceLabel || 'Research signal'}</span>
            <span className="ui-chip">
              {slip.kind === 'accumulator' ? 'Accumulator' : slip.kind === 'insufficient' ? 'Insufficient data' : 'Single pick'}
            </span>
            <QualityBadge status={slip.dataQuality?.status || 'limited'} />
          </div>
          <h4 className="mt-3 break-words text-lg font-black">{slip.title}</h4>
          <p className="mt-1 text-sm font-semibold leading-6 text-ink/55">{slip.note}</p>
        </div>
        <div className="rounded border border-ink/10 bg-ink/[0.03] px-3 py-2 text-right">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-ink/45">
            {slip.kind === 'accumulator' ? 'Combined' : 'Odds'}
          </p>
          <p className="text-xl font-black text-pitch">{formatOdds(slip.combinedOdds || slip.legs?.[0]?.odds)}</p>
          {!(slip.combinedOdds || slip.legs?.[0]?.odds) && (
            <p className="mt-1 text-xs font-bold text-ink/45">Unavailable</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {slip.legs.map((leg, index) => (
          <div key={leg.id} className="rounded border border-ink/10 bg-ink/[0.02] p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-ink/40">Leg {index + 1} - {leg.market}</p>
                <p className="mt-1 break-words font-black">{leg.pick}</p>
                <p className="mt-1 break-words text-xs font-semibold text-ink/55">
                  {leg.match} - {leg.league} - {leg.kickoffTime}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded px-2 py-1 text-xs font-black ${getConfidenceTone(leg.confidence).soft} ${getConfidenceTone(leg.confidence).text}`}>
                  {leg.confidence}%
                </span>
                <span className="rounded bg-pitch/5 px-2 py-1 text-sm font-black text-pitch">{formatOdds(leg.odds)}</span>
              </div>
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-ink/60">{leg.reason}</p>
            {leg.dataQuality?.missing?.length > 0 && (
              <p className="mt-2 text-xs font-bold text-red-700">Missing: {leg.dataQuality.missing.join(', ')}</p>
            )}
            {leg.dataQuality?.notAvailable?.length > 0 && (
              <p className="mt-2 text-xs font-bold text-ink/55">
                Not available: {leg.dataQuality.notAvailable.join(', ')}
              </p>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

function InlineError({ message }) {
  return (
    <p className="my-3 rounded border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700" role="alert">{message}</p>
  );
}

function ErrorBanner({ message }) {
  return (
    <div className="flex gap-2 rounded border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function MatchForm({ form, setForm, loading, onSubmit, fieldErrors }) {
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <form onSubmit={onSubmit} className="ui-card ui-card-pad" data-testid="manual-search-form">
      <div className="mb-4 overflow-hidden rounded border border-ink/10">
        <img className="h-32 w-full object-cover object-center" src={fanImage} alt="Kenyan sports fan checking match analytics" />
      </div>

      <div className="mb-4 flex items-start gap-2">
        <BarChart3 className="mt-0.5 h-5 w-5 text-pitch" />
        <div>
          <h2 className="text-lg font-black">Search Match</h2>
          <p className="mt-1 text-xs font-semibold text-ink/50">
            Type the teams and date. The app detects the sport and league automatically.
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        <Field label="Team A" value={form.teamA} onChange={update('teamA')} error={fieldErrors.teamA} testId="manual-team-a" />
        <Field label="Team B" value={form.teamB} onChange={update('teamB')} error={fieldErrors.teamB} testId="manual-team-b" />
        <label className="ui-label">
          Match date
          <input
            className={`ui-input ${fieldErrors.matchDate ? 'ui-input-error' : ''}`}
            type="date"
            value={form.matchDate}
            onInput={update('matchDate')}
            onChange={update('matchDate')}
            data-testid="manual-match-date"
          />
          {fieldErrors.matchDate && <span className="text-xs font-bold text-red-600">{fieldErrors.matchDate}</span>}
        </label>
        <div className="rounded border border-pitch/15 bg-pitch/5 p-3 text-xs font-bold leading-5 text-pitch">
          Sport and league will be detected from fixture data. If a fixture is not found, the app uses a clearly marked fallback.
        </div>
      </div>

      <button
        className="ui-button-primary mt-4 flex w-full items-center justify-center gap-2"
        disabled={loading}
        type="submit"
        data-testid="manual-search-button"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        {loading ? 'Reading match' : 'Search Match'}
      </button>
    </form>
  );
}

function Field({ label, value, onChange, error, testId }) {
  return (
    <label className="ui-label">
      {label}
      <input
        className={`ui-input ${error ? 'ui-input-error' : ''}`}
        value={value}
        onInput={onChange}
        onChange={onChange}
        data-testid={testId}
      />
      {error && <span className="text-xs font-bold text-red-600">{error}</span>}
    </label>
  );
}

function ConfidenceMeter({ value }) {
  const tone = getConfidenceTone(value);

  return (
    <div>
      <div className="h-3 overflow-hidden rounded bg-ink/10">
        <div className={`h-full rounded ${tone.bg}`} style={{ width: `${value}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs font-bold text-ink/55">
        <span>Low</span>
        <span className={`text-base ${tone.text}`}>{value}%</span>
        <span>High</span>
      </div>
    </div>
  );
}

const formatStatValue = (value) => (value === null || value === undefined || value === '' ? 'N/A' : value);

const formatFormValue = (form = []) => (form.length ? form.join(' ') : 'N/A');

function QualityBadge({ status }) {
  const label = status || 'missing';
  return <span className={`w-fit rounded border px-2 py-1 text-xs font-black uppercase ${getDataQualityTone(label)}`}>{label}</span>;
}

function ProviderInsightsPanel({ prediction }) {
  const stats = prediction.statsSource;
  const teamNews = prediction.teamNews;
  const predictionSource = prediction.predictionSource;

  if (!stats && !teamNews && !predictionSource) return null;

  return (
    <section className="grid gap-3 xl:grid-cols-3" data-testid="provider-insights">
      <LeagueTableCard stats={stats} sport={prediction.sport} />
      <TeamNewsCard teamNews={teamNews} sport={prediction.sport} />
      <PredictionSourceCard predictionSource={predictionSource} />
    </section>
  );
}

function LeagueTableCard({ stats, sport }) {
  const home = stats?.teams?.home;
  const away = stats?.teams?.away;
  const football = ['football', 'soccer'].includes(String(sport || '').toLowerCase());

  return (
    <article className="ui-card ui-card-pad">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-ink/45">League table</p>
          <h2 className="mt-1 font-black">Ranking snapshot</h2>
        </div>
        <QualityBadge status={stats?.dataQuality?.status || 'missing'} />
      </div>
      {stats?.standingsAvailable ? (
        <div className="mt-4 space-y-3">
          {[home, away].map((team) => (
            <div className="rounded border border-ink/10 bg-white p-3" key={team?.name}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-black">{team?.name}</p>
                <span className="rounded bg-pitch/10 px-2 py-1 text-xs font-black text-pitch">
                  Rank {formatStatValue(team?.ranking)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-xs font-bold text-ink/65">
                <span>Pts {formatStatValue(team?.points)}</span>
                <span>W {formatStatValue(team?.wins)}</span>
                <span>D {formatStatValue(team?.draws)}</span>
                <span>L {formatStatValue(team?.losses)}</span>
                <span>GF {formatStatValue(team?.goalsFor)}</span>
                <span>GA {formatStatValue(team?.goalsAgainst)}</span>
                <span className="col-span-2">Form {formatFormValue(team?.form)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p
          className={`mt-4 rounded border p-3 text-sm font-semibold ${
            football ? 'border-red-100 bg-red-50 text-red-700' : 'border-ink/10 bg-ink/[0.03] text-ink/60'
          }`}
        >
          {football
            ? 'League table ranking is missing for this match.'
            : 'League ranking is not available from connected providers for this sport or fixture.'}
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-ink/55">{stats?.dataQuality?.note || 'Provider status unavailable.'}</p>
    </article>
  );
}

function TeamNewsCard({ teamNews, sport }) {
  const teams = [teamNews?.home, teamNews?.away].filter(Boolean);
  const cricket = String(sport || '').toLowerCase() === 'cricket';
  const unavailable = teamNews?.dataQuality?.status === 'not_available';

  return (
    <article className="ui-card ui-card-pad">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-ink/45">
            {cricket ? 'Squad news' : 'Team news'}
          </p>
          <h2 className="mt-1 font-black">{cricket ? 'Availability snapshot' : 'Injuries and lineups'}</h2>
        </div>
        <QualityBadge status={teamNews?.dataQuality?.status || 'missing'} />
      </div>
      <div className="mt-4 space-y-3">
        {teams.length ? (
          teams.map((team) => (
            <div className="rounded border border-ink/10 bg-white p-3" key={team.team}>
              <p className="font-black">{team.team}</p>
              <p className="mt-1 text-xs leading-5 text-ink/60">{team.summary || 'No provider data available for this match.'}</p>
              {team.lineup?.starters?.length > 0 && (
                <p className="mt-2 text-xs font-bold text-pitch">
                  Starters: {team.lineup.starters.slice(0, 5).join(', ')}
                  {team.lineup.starters.length > 5 ? '...' : ''}
                </p>
              )}
            </div>
          ))
        ) : (
          <p
            className={`rounded border p-3 text-sm font-semibold ${
              unavailable ? 'border-ink/10 bg-ink/[0.03] text-ink/60' : 'border-red-100 bg-red-50 text-red-700'
            }`}
          >
            No provider data available for this match.
          </p>
        )}
      </div>
      {teamNews?.dataQuality?.missingFields?.length > 0 && (
        <p className="mt-3 text-xs font-bold text-red-700">Missing: {teamNews.dataQuality.missingFields.join(', ')}</p>
      )}
      {teamNews?.dataQuality?.notAvailableFields?.length > 0 && (
        <p className="mt-3 text-xs font-bold text-ink/55">
          Not available: {teamNews.dataQuality.notAvailableFields.join(', ')}
        </p>
      )}
    </article>
  );
}

function PredictionSourceCard({ predictionSource }) {
  const sources = predictionSource?.sources || [];

  return (
    <article className="ui-card ui-card-pad">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-ink/45">Prediction source</p>
          <h2 className="mt-1 font-black">Provider consensus</h2>
        </div>
        <QualityBadge status={predictionSource?.dataQuality?.status || 'missing'} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded border border-ink/10 bg-white p-3">
          <p className="text-xs font-bold text-ink/45">Home</p>
          <p className="text-lg font-black">{formatStatValue(predictionSource?.homeConsensus)}%</p>
        </div>
        <div className="rounded border border-ink/10 bg-white p-3">
          <p className="text-xs font-bold text-ink/45">Away</p>
          <p className="text-lg font-black">{formatStatValue(predictionSource?.awayConsensus)}%</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {sources.length ? (
          sources.map((source) => (
            <div className="rounded border border-ink/10 bg-white p-3" key={`${source.label}-${source.name}`}>
              <p className="text-xs font-black uppercase text-ink/45">{source.label}</p>
              <p className="mt-1 text-sm font-black">{source.pick}</p>
              <p className="text-xs font-semibold text-ink/55">{source.name} - {formatStatValue(source.confidence)}%</p>
            </div>
          ))
        ) : (
          <p className="rounded border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">
            No API-Football prediction or bookmaker-derived probability is available.
          </p>
        )}
      </div>
      {predictionSource?.dataQuality?.missingFields?.length > 0 && (
        <p className="mt-3 text-xs font-bold text-red-700">Missing: {predictionSource.dataQuality.missingFields.join(', ')}</p>
      )}
    </article>
  );
}

function DataQualityPanel({ dataQuality, sourceSummary }) {
  if (!dataQuality) return null;

  const tone = getDataQualityTone(dataQuality.status);
  const chips = [
    { label: 'Real', value: dataQuality.real?.length || 0, className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    { label: 'Missing', value: dataQuality.missing?.length || 0, className: 'border-red-200 bg-red-50 text-red-700' },
    { label: 'N/A', value: dataQuality.notAvailable?.length || 0, className: 'border-ink/10 bg-ink/[0.03] text-ink/60' },
    { label: 'Estimated', value: dataQuality.estimated?.length || 0, className: 'border-yellow-200 bg-yellow-50 text-yellow-700' },
  ];

  return (
    <section className="ui-card ui-card-pad" data-testid="data-quality-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/45">Data quality</p>
          <h2 className="mt-1 text-lg font-black">Prediction source badge</h2>
          <p className="mt-1 text-sm leading-6 text-ink/60">
            {sourceSummary?.note || 'Signals are labelled so missing provider data is not presented as real.'}
          </p>
        </div>
        <span className={`w-fit rounded border px-3 py-2 text-xs font-black uppercase ${tone}`}>
          {dataQuality.status} - {dataQuality.score}%
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {chips.map((chip) => (
          <div key={chip.label} className={`rounded border px-3 py-2 text-sm font-black ${chip.className}`}>
            {chip.label}: {chip.value}
          </div>
        ))}
      </div>
      {dataQuality.notes?.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {dataQuality.notes.map((note) => (
            <div key={note.key} className="rounded border border-ink/10 bg-ink/[0.02] p-3">
              <p className="font-black capitalize">{note.key.replace(/([A-Z])/g, ' $1')}</p>
              <p className="mt-1 text-xs font-bold text-ink/55">{note.status}</p>
              {note.note && <p className="mt-2 text-xs leading-5 text-ink/60">{note.note}</p>}
              {note.missingFields?.length > 0 && (
                <p className="mt-2 text-xs font-bold text-red-700">Missing: {note.missingFields.join(', ')}</p>
              )}
              {note.notAvailableFields?.length > 0 && (
                <p className="mt-2 text-xs font-bold text-ink/55">
                  Not available: {note.notAvailableFields.join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {sourceSummary?.predictionSources?.length > 0 && (
        <div className="mt-4 rounded border border-pitch/15 bg-pitch/5 p-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-pitch">Prediction sources</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sourceSummary.predictionSources.map((source) => (
              <span className="rounded bg-white px-2 py-1 text-xs font-black text-ink/65" key={`${source.label}-${source.name}`}>
                {source.label}: {source.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PredictionCards({ predictions }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-5">
      {predictions.map((item) => {
        const tone = getConfidenceTone(item.confidence);

        return (
          <article key={item.market} className={`ui-card ui-card-pad ${tone.border}`}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink/45">{item.market}</p>
            <h3 className="mt-2 break-words text-lg font-black text-ink">{item.pick}</h3>
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <span className={`rounded px-2 py-1 text-xs font-black ${tone.soft} ${tone.text}`}>{item.level}</span>
              <span className={`font-black ${tone.text}`}>{item.confidence}%</span>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function MatchDetailHeader({ prediction }) {
  const { teamA, teamB } = splitMatchName(prediction.match);
  const homeOdds = getBestMarketOdds(prediction.oddsComparison, 'homeWin');
  const drawOdds = getBestMarketOdds(prediction.oddsComparison, 'draw');
  const awayOdds = getBestMarketOdds(prediction.oddsComparison, 'awayWin');
  const navItems = [
    { label: 'Prediction', href: '#prediction-picks' },
    { label: 'Odds', href: '#prediction-odds' },
    { label: 'Analysis', href: '#prediction-stats' },
  ];

  return (
    <section className="ui-card overflow-hidden" id="match-overview">
      <div className="bg-ink p-4 text-white">
        <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <TeamHero name={teamA} />
          <div className="text-center">
            <p className="rounded bg-white/10 px-3 py-1 text-xs font-black text-white/75">VS</p>
            <p className="mt-2 text-xs font-bold text-white/60">{prediction.matchDate}</p>
          </div>
          <TeamHero name={teamB} align="right" />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-black">
          <span className="rounded border border-white/15 bg-white/10 px-3 py-2">{prediction.league}</span>
          <span className="rounded border border-white/15 bg-white/10 px-3 py-2">{prediction.sport}</span>
          <span className="rounded border border-lime/30 bg-lime/10 px-3 py-2 text-lime">{prediction.mainPrediction.pick}</span>
          {prediction.matchResolution && (
            <span className="rounded border border-white/15 bg-white/10 px-3 py-2 text-white/80">
              {prediction.matchResolution.source === 'provided' ? 'Selected fixture' : `Auto-detected - ${prediction.matchResolution.confidence}`}
            </span>
          )}
        </div>
      </div>

      <div className="grid border-b border-ink/10 bg-white sm:grid-cols-3">
        <QuickOdd label="Home" value={homeOdds} />
        <QuickOdd label="Draw" value={drawOdds} />
        <QuickOdd label="Away" value={awayOdds} />
      </div>

      <div className="flex flex-wrap gap-2 p-3">
        {navItems.map((item) => (
          <a key={item.label} className="rounded border border-ink/10 px-3 py-2 text-xs font-black text-ink/65 hover:border-pitch/30 hover:bg-pitch/5 hover:text-pitch" href={item.href}>
            {item.label}
          </a>
        ))}
      </div>
    </section>
  );
}

function TeamHero({ name, align = 'left' }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded border border-white/20 bg-white/10 text-lg font-black text-lime">
        {teamInitials(name)}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">{align === 'right' ? 'Away' : 'Home'}</p>
        <h2 className="mt-1 break-words text-xl font-black leading-tight">{name}</h2>
      </div>
    </div>
  );
}

function QuickOdd({ label, value }) {
  return (
    <div className="border-t border-ink/10 p-4 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-ink/45">{label}</p>
      <p className="mt-1 text-2xl font-black text-ink">{formatOdds(value?.odds)}</p>
      <p className="mt-1 truncate text-xs font-semibold text-ink/50">{value?.bookmaker || 'No market'}</p>
    </div>
  );
}

function ValueBetCard({ valueBets }) {
  const top = valueBets?.[0];

  if (!top) {
    return (
      <article className="ui-card ui-card-pad">
        <p className="font-black">Value bet</p>
        <p className="mt-2 text-sm text-ink/60">No value angle found for this request.</p>
      </article>
    );
  }

  return (
    <article className="rounded border border-pitch/20 bg-pitch p-4 text-white shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="font-black">Value bet</p>
        <Save className="h-5 w-5 shrink-0 text-lime" />
      </div>
      <p className="mt-3 break-words text-2xl font-black">{top.pick}</p>
      <p className="mt-1 text-sm text-white/75">{top.market}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded bg-white/10 p-3">
          <p className="text-white/60">Odds</p>
          <p className="text-xl font-black">{formatOdds(top.odds)}</p>
        </div>
        <div className="rounded bg-white/10 p-3">
          <p className="text-white/60">Bookmaker</p>
          <p className="break-words font-black">{top.bookmaker}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-white/75">{top.note}</p>
    </article>
  );
}

function OddsTable({ rows = [], source }) {
  const sourceMode = source?.mode || 'missing';
  const sourceLabel =
    sourceMode === 'real-api'
      ? source?.bookmakerView === 'kenya'
        ? 'Kenya bookmaker view'
        : `Real odds via ${source.provider}`
      : sourceMode === 'missing'
        ? 'Real odds unavailable'
        : 'Odds source unavailable';

  return (
    <section className="ui-card overflow-hidden" id="prediction-odds">
      <div className="border-b border-ink/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-black">Odds comparison</h2>
            <p className="mt-1 text-xs font-semibold text-ink/55">
              {source?.matchedEvent
                ? `${source.matchedEvent.homeTeam} vs ${source.matchedEvent.awayTeam}`
                : source?.note || 'Bookmaker price feed status is shown below.'}
            </p>
          </div>
          <span className={`w-fit rounded border px-2 py-1 text-xs font-black ${getOddsSourceTone(sourceMode)}`}>
            {sourceLabel}
          </span>
        </div>
        {(source?.note || source?.fallbackReason || source?.fetchedAt) && (
          <div className="mt-3 grid gap-2 text-xs font-semibold text-ink/55 sm:grid-cols-2">
            <p>{source?.note || 'Odds source details unavailable.'}</p>
            <p>
              {source?.fetchedAt ? `Fetched ${formatUpdatedAt(source.fetchedAt)}` : ''}
              {source?.regions ? ` - Regions: ${source.regions}` : ''}
              {source?.selectedBookmakers ? ` - Bookmakers: ${source.selectedBookmakers}` : ''}
              {source?.returnedBookmakers ? ` - Live Kenya prices: ${source.returnedBookmakers}` : ''}
            </p>
            {source?.unavailableBookmakers && (
              <p className="rounded border border-yellow-200 bg-yellow-50 p-2 text-yellow-700 sm:col-span-2">
                Direct Kenyan feed needed for: {source.unavailableBookmakers}
              </p>
            )}
            {source?.fallbackReason && (
              <p className="rounded border border-yellow-200 bg-yellow-50 p-2 text-yellow-700 sm:col-span-2">
                Real odds fallback reason: {source.fallbackReason}
              </p>
            )}
            {source?.providerAttempts?.length > 0 && (
              <div className="rounded border border-ink/10 bg-ink/[0.02] p-2 sm:col-span-2">
                <p className="font-black text-ink/70">Provider attempts</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {source.providerAttempts.map((attempt) => (
                    <span
                      className={`rounded border px-2 py-1 text-xs font-black ${
                        attempt.status === 'used'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : attempt.status === 'failed'
                            ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                            : 'border-ink/10 bg-white text-ink/55'
                      }`}
                      key={`${attempt.provider}-${attempt.status}`}
                      title={attempt.reason || attempt.sourceMode || attempt.status}
                    >
                      {attempt.provider}: {attempt.status.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="p-4">
          <PanelEmptyState
            title="No real odds returned"
            message="The app did not invent bookmaker prices. Connect or enable a provider feed for this fixture to compare live odds."
          />
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="bg-ink text-white">
            <tr>
              <th className="px-4 py-3">Bookmaker</th>
              <th className="px-4 py-3">Home</th>
              <th className="px-4 py-3">Draw</th>
              <th className="px-4 py-3">Away</th>
              <th className="px-4 py-3">Over</th>
              <th className="px-4 py-3">Under</th>
              <th className="px-4 py-3">BTTS Yes</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr className="border-t border-ink/10" key={`${row.key || row.bookmaker}-${index}`}>
                <td className="px-4 py-3">
                  <p className="font-bold">{row.bookmaker}</p>
                  {row.status === 'direct_feed_needed' ? (
                    <span className="mt-1 inline-flex rounded border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs font-black text-yellow-700">
                      Direct feed needed
                    </span>
                  ) : row.status === 'provider_not_connected' ? (
                    <span className="mt-1 inline-flex rounded border border-ink/10 bg-ink/5 px-2 py-1 text-xs font-black text-ink/60">
                      Provider not connected
                    </span>
                  ) : (
                    <span className="mt-1 inline-flex rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">
                      Live odds
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{formatOdds(row.markets.homeWin)}</td>
                <td className="px-4 py-3">{formatOdds(row.markets.draw)}</td>
                <td className="px-4 py-3">{formatOdds(row.markets.awayWin)}</td>
                <td className="px-4 py-3">{formatTotalOdds(row.markets.over25, row.markets.totalsLine, 'O')}</td>
                <td className="px-4 py-3">{formatTotalOdds(row.markets.under25, row.markets.totalsLine, 'U')}</td>
                <td className="px-4 py-3">{formatOdds(row.markets.bttsYes)}</td>
                <td className="px-4 py-3">{formatUpdatedAt(row.lastUpdate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}

function HistoryPanel({ history, setHistory, setPrediction, notice, onRerunPrediction }) {
  const groupedHistory = history.reduce((groups, item) => {
    const label = item.matchDate || 'Saved';
    return {
      ...groups,
      [label]: [...(groups[label] || []), item],
    };
  }, {});

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(storageKey);
  };

  const removeItem = (itemToRemove) => {
    const next = history.filter((item) => (item.id || item.savedAt) !== (itemToRemove.id || itemToRemove.savedAt));
    setHistory(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  return (
    <section className="ui-card ui-card-pad scroll-mt-24" id="history">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-black">
            <History className="h-5 w-5 text-pitch" />
            Saved history
          </h2>
          <p className="mt-1 text-xs font-semibold text-ink/45">{formatCount(history.length, 'prediction')}</p>
        </div>
        <button
          className="ui-button-secondary flex items-center gap-2 px-2 py-1.5 text-xs"
          type="button"
          onClick={clearHistory}
          disabled={history.length === 0}
          data-testid="history-clear-button"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>
      {notice && <p className="mb-2 rounded bg-pitch/5 px-3 py-2 text-xs font-bold text-pitch">{notice}</p>}
      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {history.length === 0 && <p className="text-sm text-ink/55">Your saved match reads will appear here.</p>}
        {Object.entries(groupedHistory).map(([date, items]) => (
          <div key={date} className="space-y-2">
            <p className="sticky top-0 rounded bg-white/95 py-1 text-xs font-black uppercase tracking-[0.14em] text-ink/40">
              {date}
            </p>
            {items.map((item) => {
              const tone = getConfidenceTone(item.mainPrediction.confidence);
              const itemKey = item.id || item.savedAt || `${item.match}-${item.matchDate}`;

              return (
                <div key={itemKey} className="rounded border border-ink/10 hover:border-pitch/40 hover:bg-pitch/5" data-testid="history-item">
                  <button
                    className="w-full p-3 text-left"
                    type="button"
                    onClick={() => {
                      setPrediction(item);
                      trackEvent('history_opened', {
                        sport: item.sport,
                        league: item.league,
                        confidence: item.mainPrediction?.confidence,
                      });
                    }}
                    data-testid="history-open-button"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words font-bold">{item.match}</p>
                        <p className="mt-1 text-xs text-ink/55">{item.league || item.sport || 'Saved prediction'}</p>
                      </div>
                      <span className={`shrink-0 rounded px-2 py-1 text-xs font-black ${tone.soft} ${tone.text}`}>
                        {item.mainPrediction.confidence}%
                      </span>
                    </div>
                    <p className={`mt-2 text-xs font-black ${tone.text}`}>{item.mainPrediction.pick}</p>
                  </button>
                  <div className="mx-3 mb-3 grid grid-cols-2 gap-2">
                    <button
                      className="flex items-center justify-center gap-1 rounded border border-pitch/15 bg-pitch/5 px-2 py-1.5 text-xs font-black text-pitch"
                      type="button"
                      onClick={() => onRerunPrediction(item)}
                      data-testid="history-rerun-button"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Re-run
                    </button>
                    <button
                      className="flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-bold text-ink/55 hover:bg-ink/5"
                      type="button"
                      onClick={() => removeItem(item)}
                    >
                      <X className="h-3 w-3" />
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <section className="space-y-4">
      <div className="ui-card ui-card-pad">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-pitch" />
          <div>
            <h2 className="font-black">Reading the game</h2>
            <p className="text-sm text-ink/60">Gathering fixture signals, odds, confidence, and reasoning.</p>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="ui-card h-32 animate-pulse">
            <div className="m-4 h-3 w-24 rounded bg-ink/10" />
            <div className="mx-4 mt-8 h-6 w-36 rounded bg-ink/10" />
            <div className="mx-4 mt-5 h-3 w-28 rounded bg-ink/10" />
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ activeFlow }) {
  return (
    <section className="grid overflow-hidden rounded border border-dashed border-ink/20 bg-white lg:grid-cols-[0.9fr_1.1fr]">
      <div className="hidden min-h-[240px] sm:block">
        <img className="h-full w-full object-cover object-center" src={fanImage} alt="Kenyan sports fan checking match analytics" />
      </div>
      <div className="flex items-center justify-center p-5 text-center sm:p-6">
        <div className="max-w-md">
          <Sparkles className="mx-auto h-10 w-10 text-pitch" />
          <h2 className="mt-3 text-2xl font-black">Ready for the next game</h2>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            {activeFlow === 'browse'
              ? 'Chagua country, pick a sport, then open a match card for a prediction read.'
              : 'Enter a fixture manually to generate market predictions, odds, value angles, and saved local history.'}
          </p>
          <p className="mt-3 rounded bg-sun/15 px-3 py-2 text-xs font-bold text-ink/70">
            Soma game first. Betting always carries risk.
          </p>
        </div>
      </div>
    </section>
  );
}

export default App;
