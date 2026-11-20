/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  GlobalFilters,
  DEFAULT_FILTERS,
  getPgDb,
} from './db/pgEngine.ts';
import {
  ExecutiveKpiSummary,
  DailyRollingTrendRow,
  RoutePerformanceRow,
  DelayDecompositionSummary,
  HourlyDelayPatternRow,
  AirportPerformanceRow,
  CarrierPerformanceRow,
  MonthlyPerformanceRow,
  CancellationBreakdownRow,
  DayOfWeekPerformanceRow,
  FleetGaugeUtilizationRow,
  TurnaroundBufferTierRow,
  fetchExecutiveKpis,
  fetchDailyRollingTrends,
  fetchRoutePerformance,
  fetchDelayDecomposition,
  fetchHourlyDelayPatterns,
  fetchAirportPerformance,
  fetchCarrierPerformance,
  fetchMonthlyPerformance,
  fetchCancellationBreakdown,
  fetchDayOfWeekPerformance,
  fetchFleetGaugeUtilization,
  fetchTurnaroundBufferTiers,
} from './db/queries.ts';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { ExecutiveOverviewTab } from './components/ExecutiveOverviewTab.tsx';
import { RoutePerformanceTab } from './components/RoutePerformanceTab.tsx';
import { RevenueAnalyticsTab } from './components/RevenueAnalyticsTab.tsx';
import { OperationalPerformanceTab } from './components/OperationalPerformanceTab.tsx';
import { DelayCancellationTab } from './components/DelayCancellationTab.tsx';
import { PredictiveAnalyticsTab } from './components/PredictiveAnalyticsTab.tsx';
import { ScenarioPlannerTab } from './components/ScenarioPlannerTab.tsx';
import { AirportCarrierTab } from './components/AirportCarrierTab.tsx';
import { SqlAnalyticsTab } from './components/SqlAnalyticsTab.tsx';
import { ReportsTab } from './components/ReportsTab.tsx';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { RotateCcw } from 'lucide-react';

type ModuleTab =
  | 'overview'
  | 'routes'
  | 'revenue'
  | 'operations'
  | 'delays'
  | 'predictive'
  | 'scenario'
  | 'airports_carriers'
  | 'sql'
  | 'reports';

const NAV_MODULES: { id: ModuleTab; label: string; section: string }[] = [
  { id: 'overview', label: '01. Executive Overview', section: 'Commercial Intelligence' },
  { id: 'routes', label: '02. Route Performance', section: 'Commercial Intelligence' },
  { id: 'revenue', label: '03. Revenue & Profitability', section: 'Commercial Intelligence' },
  { id: 'operations', label: '04. Operational Performance', section: 'Operations & Reliability' },
  { id: 'delays', label: '05. Delay & Cancellation', section: 'Operations & Reliability' },
  { id: 'predictive', label: '06. Predictive Analytics', section: 'Decision Support & ML' },
  { id: 'scenario', label: '07. Scenario Planner', section: 'Decision Support & ML' },
  { id: 'airports_carriers', label: '08. Airport & Carrier Matrix', section: 'Network Benchmarks' },
  { id: 'sql', label: '09. SQL Analytics Engine', section: 'Network Benchmarks' },
  { id: 'reports', label: '10. Management Reports', section: 'Network Benchmarks' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ModuleTab>('overview');
  const [filters, setFilters] = useState<GlobalFilters>(DEFAULT_FILTERS);
  const [selectedRouteCode, setSelectedRouteCode] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Analytical state populated from live PostgreSQL queries
  const [initializingDb, setInitializingDb] = useState(true);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [kpis, setKpis] = useState<ExecutiveKpiSummary | null>(null);
  const [dailyTrends, setDailyTrends] = useState<DailyRollingTrendRow[]>([]);
  const [routes, setRoutes] = useState<RoutePerformanceRow[]>([]);
  const [delayDecomp, setDelayDecomp] = useState<DelayDecompositionSummary | null>(null);
  const [hourlyPatterns, setHourlyPatterns] = useState<HourlyDelayPatternRow[]>([]);
  const [airports, setAirports] = useState<AirportPerformanceRow[]>([]);
  const [carriers, setCarriers] = useState<CarrierPerformanceRow[]>([]);
  const [monthly, setMonthly] = useState<MonthlyPerformanceRow[]>([]);
  const [cancellations, setCancellations] = useState<CancellationBreakdownRow[]>([]);
  const [dayOfWeekPerf, setDayOfWeekPerf] = useState<DayOfWeekPerformanceRow[]>([]);
  const [fleetUtilization, setFleetUtilization] = useState<FleetGaugeUtilizationRow[]>([]);
  const [turnaroundTiers, setTurnaroundTiers] = useState<TurnaroundBufferTierRow[]>([]);
  const [allRouteOptions, setAllRouteOptions] = useState<string[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
    });
    return () => unsub();
  }, []);

  const loadAllAnalyticalViews = useCallback(async (activeFilters: GlobalFilters) => {
    setLoadingQueries(true);
    try {
      const db = await getPgDb();
      const routeListRes = await db.query<{ route_code: string }>(
        `SELECT route_code FROM routes ORDER BY route_code ASC;`
      );
      setAllRouteOptions(routeListRes.rows.map((r) => r.route_code));

      const [
        kpiRes,
        dailyRes,
        routeRes,
        delayRes,
        hourlyRes,
        airportRes,
        carrierRes,
        monthlyRes,
        cancelRes,
        dowRes,
        fleetRes,
        turnRes,
      ] = await Promise.all([
        fetchExecutiveKpis(activeFilters),
        fetchDailyRollingTrends(activeFilters),
        fetchRoutePerformance(activeFilters),
        fetchDelayDecomposition(activeFilters),
        fetchHourlyDelayPatterns(activeFilters),
        fetchAirportPerformance(activeFilters),
        fetchCarrierPerformance(activeFilters),
        fetchMonthlyPerformance(activeFilters),
        fetchCancellationBreakdown(activeFilters),
        fetchDayOfWeekPerformance(activeFilters),
        fetchFleetGaugeUtilization(activeFilters),
        fetchTurnaroundBufferTiers(activeFilters),
      ]);

      setKpis(kpiRes);
      setDailyTrends(dailyRes);
      setRoutes(routeRes);
      setDelayDecomp(delayRes);
      setHourlyPatterns(hourlyRes);
      setAirports(airportRes);
      setCarriers(carrierRes);
      setMonthly(monthlyRes);
      setCancellations(cancelRes);
      setDayOfWeekPerf(dowRes);
      setFleetUtilization(fleetRes);
      setTurnaroundTiers(turnRes);
    } finally {
      setInitializingDb(false);
      setLoadingQueries(false);
    }
  }, []);

  useEffect(() => {
    loadAllAnalyticalViews(filters);
  }, [filters, loadAllAnalyticalViews]);

  const handleDrillRoute = (routeCode: string) => {
    setSelectedRouteCode(routeCode);
    setActiveTab('routes');
  };

  const handleAuthAction = async () => {
    if (currentUser) {
      await signOut(auth);
    } else {
      try {
        await signInWithPopup(auth, googleAuthProvider);
      } catch (err) {
        console.error('Google Sign-In failed:', err);
      }
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        {/* Top Bar Contract: 3 Zones separated by gap-8 */}
        <header className="no-print flex items-center justify-between gap-8 px-6 py-3.5 bg-slate-950 text-white border-b border-slate-800">
          {/* Zone 1: Single text element wordmark */}
          <button
            onClick={() => {
              setSelectedRouteCode(null);
              setActiveTab('overview');
            }}
            className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            AeroIntel Commercial &amp; Operations
          </button>

          {/* Zone 2: 5 concise single-line text navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
            <button
              onClick={() => {
                setSelectedRouteCode(null);
                setActiveTab('overview');
              }}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'overview' ? 'text-white underline underline-offset-4' : ''
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('routes')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'routes' ? 'text-white underline underline-offset-4' : ''
              }`}
            >
              Routes
            </button>
            <button
              onClick={() => setActiveTab('predictive')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'predictive' ? 'text-white underline underline-offset-4' : ''
              }`}
            >
              Predictive ML
            </button>
            <button
              onClick={() => setActiveTab('scenario')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'scenario' ? 'text-white underline underline-offset-4' : ''
              }`}
            >
              Scenario Planner
            </button>
            <button
              onClick={() => setActiveTab('sql')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'sql' ? 'text-white underline underline-offset-4' : ''
              }`}
            >
              SQL Engine
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleAuthAction}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-950 bg-white rounded hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {currentUser
                ? `Sign Out (${currentUser.email?.split('@')[0] || 'Analyst'})`
                : 'Analyst Sign In'}
            </button>
          </div>
        </header>

        {/* Main Workspace Container: Left Sidebar + Filter Toolbar + Analytical Viewport */}
        <div className="flex-1 flex flex-col lg:flex-row">
          {/* Left Enterprise Sidebar (250px fixed on desktop) */}
          <aside className="no-print w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 shrink-0 p-4 flex flex-col justify-between">
            <div className="space-y-5">
              {['Commercial Intelligence', 'Operations & Reliability', 'Decision Support & ML', 'Network Benchmarks'].map(
                (sec) => (
                  <div key={sec}>
                    <div className="text-[11px] font-semibold text-slate-400 px-2.5 mb-1.5">
                      {sec}
                    </div>
                    <div className="space-y-0.5">
                      {NAV_MODULES.filter((m) => m.section === sec).map((mod) => {
                        const isActive = activeTab === mod.id;
                        return (
                          <button
                            key={mod.id}
                            onClick={() => {
                              if (mod.id !== 'routes') setSelectedRouteCode(null);
                              setActiveTab(mod.id);
                            }}
                            className={`w-full text-left px-2.5 py-2 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                              isActive
                                ? 'bg-slate-900 text-white'
                                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            {mod.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="hidden lg:block pt-4 border-t border-slate-200 text-[11px] text-slate-500 space-y-1">
              <div className="font-semibold text-slate-800">Analytical Governance</div>
              <div>PostgreSQL 14-Table Engine</div>
              <div>BTS T-100 / DB1B / On-Time</div>
              <div>Form 41 Direct Block-Hr Costs</div>
            </div>
          </aside>

          {/* Right Content Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Global Filter Bar */}
            <div className="no-print bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">From:</span>
                  <input
                    type="date"
                    min="2026-01-01"
                    max="2026-03-31"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                    className="px-2 py-1 border border-slate-200 rounded font-mono text-xs bg-slate-50"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">To:</span>
                  <input
                    type="date"
                    min="2026-01-01"
                    max="2026-03-31"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    className="px-2 py-1 border border-slate-200 rounded font-mono text-xs bg-slate-50"
                  />
                </div>

                <select
                  value={filters.airlineCode}
                  onChange={(e) => setFilters({ ...filters, airlineCode: e.target.value })}
                  className="px-2.5 py-1 border border-slate-200 rounded bg-slate-50 text-slate-800 font-medium"
                >
                  <option value="ALL">All Airlines (6 Carriers)</option>
                  <option value="DL">DL · Delta Air Lines</option>
                  <option value="UA">UA · United Airlines</option>
                  <option value="AA">AA · American Airlines</option>
                  <option value="WN">WN · Southwest Airlines</option>
                  <option value="B6">B6 · JetBlue Airways</option>
                  <option value="AS">AS · Alaska Airlines</option>
                </select>

                <select
                  value={filters.originAirport}
                  onChange={(e) => setFilters({ ...filters, originAirport: e.target.value })}
                  className="px-2.5 py-1 border border-slate-200 rounded bg-slate-50 text-slate-800 font-medium"
                >
                  <option value="ALL">All Origin Hubs</option>
                  {['JFK', 'LAX', 'ORD', 'ATL', 'DFW', 'SFO', 'DEN', 'SEA', 'MIA', 'BOS', 'EWR', 'MCO'].map(
                    (ap) => (
                      <option key={ap} value={ap}>
                        Origin: {ap}
                      </option>
                    )
                  )}
                </select>

                <select
                  value={filters.destAirport}
                  onChange={(e) => setFilters({ ...filters, destAirport: e.target.value })}
                  className="px-2.5 py-1 border border-slate-200 rounded bg-slate-50 text-slate-800 font-medium"
                >
                  <option value="ALL">All Destination Hubs</option>
                  {['JFK', 'LAX', 'ORD', 'ATL', 'DFW', 'SFO', 'DEN', 'SEA', 'MIA', 'BOS', 'EWR', 'MCO'].map(
                    (ap) => (
                      <option key={ap} value={ap}>
                        Dest: {ap}
                      </option>
                    )
                  )}
                </select>

                <select
                  value={filters.routeCode}
                  onChange={(e) => setFilters({ ...filters, routeCode: e.target.value })}
                  className="px-2.5 py-1 border border-slate-200 rounded bg-slate-50 text-slate-800 font-mono"
                >
                  <option value="ALL">All O&amp;D Routes</option>
                  {allRouteOptions.map((rc) => (
                    <option key={rc} value={rc}>
                      Route: {rc}
                    </option>
                  ))}
                </select>

                <select
                  value={filters.dataSourceType}
                  onChange={(e) => setFilters({ ...filters, dataSourceType: e.target.value })}
                  className="px-2.5 py-1 border border-slate-200 rounded bg-slate-50 text-slate-800"
                >
                  <option value="ALL">All Data Sources</option>
                  <option value="BTS_CALIBRATED_PUBLIC">BTS Calibrated Public Schema</option>
                  <option value="USER_CSV_IMPORT">User CSV Imported Records</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                {loadingQueries && (
                  <span className="text-[11px] font-mono text-slate-500">
                    Executing SQL...
                  </span>
                )}
                <button
                  onClick={() => {
                    setSelectedRouteCode(null);
                    setFilters(DEFAULT_FILTERS);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Reset Filters
                </button>
              </div>
            </div>

            {/* Active Analytical Module Viewport */}
            <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto">
              {initializingDb || !kpis || !delayDecomp ? (
                <div className="bg-white border border-slate-200 rounded-md p-12 text-center space-y-2">
                  <div className="text-sm font-semibold text-slate-900">
                    Initializing PostgreSQL 14-Table Analytical Database
                  </div>
                  <p className="text-xs text-slate-500">
                    Populating BTS T-100, DB1B, On-Time Performance, and Form 41 direct operating cost tables...
                  </p>
                </div>
              ) : (
                <>
                  {activeTab === 'overview' && (
                    <ExecutiveOverviewTab
                      kpis={kpis}
                      dailyTrends={dailyTrends}
                      routes={routes}
                      monthly={monthly}
                      dayOfWeekPerf={dayOfWeekPerf}
                      onSelectRoute={handleDrillRoute}
                      onNavigateTab={(t) => setActiveTab(t as ModuleTab)}
                    />
                  )}
                  {activeTab === 'routes' && (
                    <RoutePerformanceTab
                      routes={routes}
                      filters={filters}
                      selectedRouteCode={selectedRouteCode}
                      onSelectRoute={(rc) => setSelectedRouteCode(rc)}
                    />
                  )}
                  {activeTab === 'revenue' && (
                    <RevenueAnalyticsTab kpis={kpis} routes={routes} />
                  )}
                  {activeTab === 'operations' && (
                    <OperationalPerformanceTab
                      kpis={kpis}
                      hourlyPatterns={hourlyPatterns}
                      airports={airports}
                      carriers={carriers}
                      fleetUtilization={fleetUtilization}
                      turnaroundTiers={turnaroundTiers}
                    />
                  )}
                  {activeTab === 'delays' && (
                    <DelayCancellationTab
                      delayDecomp={delayDecomp}
                      cancellations={cancellations}
                      filters={filters}
                    />
                  )}
                  {activeTab === 'predictive' && <PredictiveAnalyticsTab />}
                  {activeTab === 'scenario' && (
                    <ScenarioPlannerTab kpis={kpis} routes={routes} />
                  )}
                  {activeTab === 'airports_carriers' && (
                    <AirportCarrierTab
                      airports={airports}
                      carriers={carriers}
                      onFilterByAirline={(code) =>
                        setFilters({ ...filters, airlineCode: code })
                      }
                      onFilterByOriginAirport={(ap) =>
                        setFilters({ ...filters, originAirport: ap })
                      }
                    />
                  )}
                  {activeTab === 'sql' && (
                    <SqlAnalyticsTab
                      onDataImported={() => loadAllAnalyticalViews(filters)}
                    />
                  )}
                  {activeTab === 'reports' && (
                    <ReportsTab
                      kpis={kpis}
                      routes={routes}
                      delayDecomp={delayDecomp}
                      airports={airports}
                      carriers={carriers}
                      filters={filters}
                    />
                  )}
                </>
              )}
            </main>

            {/* Restrained Enterprise Footer */}
            <footer className="no-print px-6 py-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
              <div>
                AeroIntel Commercial &amp; Operations Decision Support · PostgreSQL 14-Table Analytical Architecture
              </div>
              <div>
                Financial Governance: Route Contribution reflects direct operating margin prior to corporate overhead.
              </div>
            </footer>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
