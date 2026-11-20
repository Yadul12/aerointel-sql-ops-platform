import React, { useState, useEffect } from 'react';
import { RoutePerformanceRow } from '../db/queries.ts';
import { getPgDb, GlobalFilters, buildFilterClause } from '../db/pgEngine.ts';
import { exportToCsv, exportToExcelXml } from '../utils/exportUtils.ts';
import { ArrowLeft, Download, Search, ArrowUpDown } from 'lucide-react';

interface Props {
  routes: RoutePerformanceRow[];
  filters: GlobalFilters;
  selectedRouteCode: string | null;
  onSelectRoute: (routeCode: string | null) => void;
}

const AIRPORT_COORDS: Record<string, { x: number; y: number; city: string }> = {
  SEA: { x: 115, y: 58, city: 'Seattle' },
  SFO: { x: 88, y: 185, city: 'San Francisco' },
  LAX: { x: 130, y: 265, city: 'Los Angeles' },
  DEN: { x: 315, y: 185, city: 'Denver' },
  DFW: { x: 435, y: 295, city: 'Dallas' },
  ORD: { x: 525, y: 145, city: 'Chicago' },
  ATL: { x: 585, y: 270, city: 'Atlanta' },
  MCO: { x: 645, y: 340, city: 'Orlando' },
  MIA: { x: 665, y: 385, city: 'Miami' },
  JFK: { x: 695, y: 135, city: 'New York JFK' },
  EWR: { x: 678, y: 142, city: 'Newark' },
  BOS: { x: 725, y: 105, city: 'Boston' },
};

interface RouteMonthlyHistory {
  month_name: string;
  flights: number;
  passengers: number;
  seats: number;
  load_factor_pct: number;
  avg_fare_usd: number;
  observed_rev_usd: number;
  direct_cost_usd: number;
  contribution_usd: number;
  otp_arr_pct: number;
  avg_delay_mins: number;
}

interface RouteCarrierSplit {
  airline_code: string;
  airline_name: string;
  aircraft_codes: string;
  flights: number;
  load_factor_pct: number;
  avg_fare_usd: number;
  otp_arr_pct: number;
  contribution_usd: number;
}

export const RoutePerformanceTab: React.FC<Props> = ({
  routes,
  filters,
  selectedRouteCode,
  onSelectRoute,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [marketFilter, setMarketFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState<keyof RoutePerformanceRow>('estimated_contribution_usd');
  const [sortAsc, setSortAsc] = useState(false);

  // Drill-down state for dedicated Route Detail View
  const [routeHistory, setRouteHistory] = useState<RouteMonthlyHistory[]>([]);
  const [routeCarriers, setRouteCarriers] = useState<RouteCarrierSplit[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!selectedRouteCode) return;
    let active = true;
    setLoadingDetail(true);

    (async () => {
      const db = await getPgDb();
      const subFilters: GlobalFilters = { ...filters, routeCode: selectedRouteCode };
      const { whereSql, params } = buildFilterClause(subFilters, 'sf');

      const histRes = await db.query<RouteMonthlyHistory>(
        `
        SELECT
          cd.month_name,
          COUNT(sf.schedule_id)::int AS flights,
          COALESCE(SUM(pt.revenue_passengers), 0)::int AS passengers,
          COALESCE(SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END), 0)::int AS seats,
          ROUND((SUM(pt.revenue_passengers)::numeric / NULLIF(SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END), 0)::numeric) * 100, 2)::float AS load_factor_pct,
          ROUND(AVG(tf.avg_base_fare_usd)::numeric, 2)::float AS avg_fare_usd,
          ROUND(SUM(rr.observed_ticket_revenue_usd)::numeric, 0)::float AS observed_rev_usd,
          ROUND(SUM(rr.assumed_total_direct_cost_usd)::numeric, 0)::float AS direct_cost_usd,
          ROUND(SUM(rr.estimated_route_contribution_usd)::numeric, 0)::float AS contribution_usd,
          ROUND((SUM(CASE WHEN fo.is_on_time_arr THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2)::float AS otp_arr_pct,
          ROUND(COALESCE(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.actual_arr_delay_mins END), 0)::numeric, 1)::float AS avg_delay_mins
        FROM scheduled_flights sf
        JOIN calendar_dimension cd ON cd.flight_date = sf.flight_date
        JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
        JOIN passenger_traffic pt ON pt.schedule_id = sf.schedule_id
        JOIN ticket_fares tf ON tf.schedule_id = sf.schedule_id
        JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
        ${whereSql}
        GROUP BY cd.month_num, cd.month_name
        ORDER BY cd.month_num ASC;
        `,
        params
      );

      const carrierRes = await db.query<RouteCarrierSplit>(
        `
        SELECT
          al.airline_code,
          al.airline_name,
          STRING_AGG(DISTINCT sf.aircraft_code, ', ') AS aircraft_codes,
          COUNT(sf.schedule_id)::int AS flights,
          ROUND((SUM(pt.revenue_passengers)::numeric / NULLIF(SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END), 0)::numeric) * 100, 2)::float AS load_factor_pct,
          ROUND(AVG(tf.avg_base_fare_usd)::numeric, 2)::float AS avg_fare_usd,
          ROUND((SUM(CASE WHEN fo.is_on_time_arr THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2)::float AS otp_arr_pct,
          ROUND(SUM(rr.estimated_route_contribution_usd)::numeric, 0)::float AS contribution_usd
        FROM scheduled_flights sf
        JOIN airlines al ON al.airline_code = sf.airline_code
        JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
        JOIN passenger_traffic pt ON pt.schedule_id = sf.schedule_id
        JOIN ticket_fares tf ON tf.schedule_id = sf.schedule_id
        JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
        ${whereSql}
        GROUP BY al.airline_code, al.airline_name
        ORDER BY contribution_usd DESC;
        `,
        params
      );

      if (active) {
        setRouteHistory(histRes.rows);
        setRouteCarriers(carrierRes.rows);
        setLoadingDetail(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedRouteCode, filters]);

  const fmtUsd = (n: number) =>
    n >= 1_000_000 || n <= -1_000_000
      ? `$${(n / 1_000_000).toFixed(2)}M`
      : `$${Math.round(n).toLocaleString()}`;

  // Dedicated Route Detail Page when a route is selected
  if (selectedRouteCode) {
    const route = routes.find((r) => r.route_code === selectedRouteCode);
    if (!route) {
      return (
        <div className="bg-white border border-slate-200 rounded-md p-6">
          <button
            onClick={() => onSelectRoute(null)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Route Matrix
          </button>
          <p className="text-xs text-slate-500">Selected route has no observations in current filter range.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Route Detail Header */}
        <div className="bg-white border border-slate-200 rounded-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <button
              onClick={() => onSelectRoute(null)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-900 hover:underline mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Return to All O&D Routes
            </button>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-900 font-mono">
                {route.origin_airport} → {route.dest_airport}
              </h2>
              <span className="text-xs text-slate-500">
                {route.market_type} · {route.distance_miles.toLocaleString()} miles · Rank #{route.contribution_rank} of {routes.length}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToCsv(`route_detail_${route.route_code}`, routeHistory as unknown as Record<string, unknown>[])}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export Route History CSV
            </button>
          </div>
        </div>

        {/* Route Key Commercial & Operational Strip */}
        <div className="bg-white border border-slate-200 rounded-md grid grid-cols-2 md:grid-cols-6 divide-x divide-slate-200">
          <div className="p-4">
            <div className="text-xs text-slate-500">Scheduled Flights</div>
            <div className="text-xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
              {route.flight_frequency}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 font-mono">
              {route.completed_flights} completed
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">Load Factor</div>
            <div className="text-xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
              {route.load_factor_pct.toFixed(1)}%
            </div>
            <div className="text-xs text-slate-500 mt-0.5 font-mono">
              {route.passenger_volume.toLocaleString()} / {route.available_capacity.toLocaleString()} seats
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">Avg Base / Total Rev/Pax</div>
            <div className="text-xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
              ${route.avg_base_fare_usd.toFixed(0)} / ${route.rev_per_pax_usd.toFixed(0)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 font-mono">
              RASK {route.rask_cents.toFixed(2)}¢ · CASK {route.cask_cents.toFixed(2)}¢
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">Observed Ticket Rev</div>
            <div className="text-xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
              {fmtUsd(route.observed_ticket_rev_usd)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 font-mono">
              +{fmtUsd(route.est_ancillary_rev_usd + route.est_cargo_rev_usd)} anc/cargo
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">Assumed Direct Cost</div>
            <div className="text-xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
              {fmtUsd(route.assumed_direct_cost_usd)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 font-mono">
              Fuel: {fmtUsd(route.assumed_fuel_cost_usd)}
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">Est. Route Contribution</div>
            <div className={`text-xl font-semibold font-mono tabular-nums mt-1 ${route.estimated_contribution_usd >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {fmtUsd(route.estimated_contribution_usd)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 font-mono">
              {route.contribution_margin_pct.toFixed(1)}% margin · OTP {route.otp_arr_pct.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Monthly Route Progression & Carrier Deployment Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-md p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              Monthly Historical Progression ({route.route_code})
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Seasonal load factor, fare yield, and contribution trajectory
            </p>
            {loadingDetail ? (
              <div className="py-12 text-center text-xs text-slate-500">Loading PostgreSQL route history...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                      <th className="py-2">Month</th>
                      <th className="py-2 text-right">Flights</th>
                      <th className="py-2 text-right">Load Factor</th>
                      <th className="py-2 text-right">Avg Fare</th>
                      <th className="py-2 text-right">OTP (A14)</th>
                      <th className="py-2 text-right">Contribution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                    {routeHistory.map((m) => (
                      <tr key={m.month_name} className="hover:bg-slate-50">
                        <td className="py-2.5 font-sans font-medium text-slate-900">{m.month_name}</td>
                        <td className="py-2.5 text-right">{m.flights}</td>
                        <td className="py-2.5 text-right">{m.load_factor_pct.toFixed(1)}%</td>
                        <td className="py-2.5 text-right">${m.avg_fare_usd.toFixed(0)}</td>
                        <td className="py-2.5 text-right">{m.otp_arr_pct.toFixed(1)}%</td>
                        <td className="py-2.5 text-right font-semibold text-slate-900">
                          {fmtUsd(m.contribution_usd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-md p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              Operating Carrier & Fleet Gauge Share on {route.route_code}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Competitive capacity, equipment assignment, and on-time reliability
            </p>
            {loadingDetail ? (
              <div className="py-12 text-center text-xs text-slate-500">Loading carrier breakdown...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                      <th className="py-2">Carrier</th>
                      <th className="py-2">Equipment</th>
                      <th className="py-2 text-right">Flights</th>
                      <th className="py-2 text-right">Load Factor</th>
                      <th className="py-2 text-right">OTP</th>
                      <th className="py-2 text-right">Contribution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                    {routeCarriers.map((c) => (
                      <tr key={c.airline_code} className="hover:bg-slate-50">
                        <td className="py-2.5 font-sans font-medium text-slate-900">
                          {c.airline_code} · {c.airline_name}
                        </td>
                        <td className="py-2.5 text-slate-600">{c.aircraft_codes}</td>
                        <td className="py-2.5 text-right">{c.flights}</td>
                        <td className="py-2.5 text-right">{c.load_factor_pct.toFixed(1)}%</td>
                        <td className="py-2.5 text-right">{c.otp_arr_pct.toFixed(1)}%</td>
                        <td className="py-2.5 text-right font-semibold text-slate-900">
                          {fmtUsd(c.contribution_usd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Filter and sort route list
  const marketTypes = ['ALL', ...Array.from(new Set(routes.map((r) => r.market_type)))];
  const filteredRoutes = routes
    .filter((r) => {
      const matchesSearch =
        r.route_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.market_type.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMarket = marketFilter === 'ALL' || r.market_type === marketFilter;
      return matchesSearch && matchesMarket;
    })
    .sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });

  const handleSort = (key: keyof RoutePerformanceRow) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Split: Geographical US Hub Route Network Map + RASK vs CASK Quadrant */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 7 Cols: Geographical O&D Network Map */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-md p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Geographical O&D Network & Contribution Topology
                </h2>
                <p className="text-xs text-slate-500">
                  Click any route arc or hub node to inspect route commercial & operational history
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-blue-900 inline-block"></span>
                  <span>Margin &gt; 15%</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-amber-600 inline-block"></span>
                  <span>Watchlist / Low Margin</span>
                </span>
              </div>
            </div>

            <svg viewBox="0 0 800 420" className="w-full h-64 bg-slate-50 border border-slate-200 rounded">
              {/* Subtle US Continental Grid Lines */}
              {[100, 200, 300].map((y) => (
                <line key={y} x1={40} y1={y} x2={760} y2={y} stroke="#e2e8f0" strokeDasharray="2 4" />
              ))}
              {[160, 320, 480, 640].map((x) => (
                <line key={x} x1={x} y1={25} x2={x} y2={395} stroke="#e2e8f0" strokeDasharray="2 4" />
              ))}

              {/* Route Arcs */}
              {filteredRoutes.map((r) => {
                const orig = AIRPORT_COORDS[r.origin_airport];
                const dest = AIRPORT_COORDS[r.dest_airport];
                if (!orig || !dest) return null;
                const midX = (orig.x + dest.x) / 2;
                const midY = (orig.y + dest.y) / 2 - 22;
                const isStrong = r.contribution_margin_pct >= 14;
                return (
                  <g
                    key={r.route_code}
                    className="cursor-pointer group"
                    onClick={() => onSelectRoute(r.route_code)}
                  >
                    <path
                      d={`M ${orig.x} ${orig.y} Q ${midX} ${midY} ${dest.x} ${dest.y}`}
                      fill="none"
                      stroke={isStrong ? '#1e3a8a' : '#d97706'}
                      strokeWidth={Math.max(1.5, Math.min(3.5, r.flight_frequency / 45))}
                      strokeOpacity="0.65"
                      className="group-hover:stroke-opacity-100 transition-all"
                    />
                  </g>
                );
              })}

              {/* Airport Hub Nodes */}
              {Object.entries(AIRPORT_COORDS).map(([code, pt]) => (
                <g key={code}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="5"
                    fill="#0f172a"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                  <text
                    x={pt.x}
                    y={pt.y - 8}
                    textAnchor="middle"
                    className="text-[10px] font-mono font-bold fill-slate-900"
                  >
                    {code}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
            <span>Arc stroke thickness encodes scheduled flight frequency</span>
            <span>Select any row in the matrix below for full route P&L and monthly drill-down</span>
          </div>
        </div>

        {/* Right 5 Cols: Unit Revenue (RASK) vs Direct Unit Cost (CASK) Scatter Matrix */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-md p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-1">
              Unit Economics: RASK vs Direct CASK (¢/ASM)
            </h2>
            <p className="text-xs text-slate-500 mb-3">
              Routes above the 45° break-even diagonal generate positive direct route contribution
            </p>
            <svg viewBox="0 0 380 240" className="w-full h-60 bg-slate-50 border border-slate-200 rounded">
              {/* Break-even diagonal line (RASK = CASK from 8c to 34c) */}
              <line x1={40} y1={205} x2={350} y2={25} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth="1.2" />
              <text x={265} y={62} className="text-[9px] fill-slate-500 font-mono">
                RASK = Direct CASK
              </text>

              {filteredRoutes.map((r) => {
                // Map CASK [8..34] to X [40..350], RASK [8..38] to Y [205..25]
                const x = 40 + Math.min(1, Math.max(0, (r.cask_cents - 8) / 26)) * 310;
                const y = 205 - Math.min(1, Math.max(0, (r.rask_cents - 8) / 30)) * 180;
                const positive = r.estimated_contribution_usd >= 0;
                return (
                  <g
                    key={r.route_code}
                    className="cursor-pointer"
                    onClick={() => onSelectRoute(r.route_code)}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={Math.max(4, Math.min(8, r.passenger_volume / 3200))}
                      fill={positive ? '#1e3a8a' : '#dc2626'}
                      fillOpacity="0.8"
                      stroke="#ffffff"
                      strokeWidth="1"
                    />
                    <text x={x + 6} y={y + 3} className="text-[9px] font-mono fill-slate-800">
                      {r.route_code}
                    </text>
                  </g>
                );
              })}

              <text x={195} y={232} textAnchor="middle" className="text-[10px] fill-slate-600 font-mono">
                Assumed Direct CASK (cents per ASM) →
              </text>
              <text
                x={14}
                y={120}
                textAnchor="middle"
                transform="rotate(-90 14 120)"
                className="text-[10px] fill-slate-600 font-mono"
              >
                RASK (cents per ASM) →
              </text>
            </svg>
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            Bubble radius reflects total revenue passenger volume. Click any route point to drill down.
          </div>
        </div>
      </div>

      {/* Full Route Commercial & Operational Ranking Table */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Route Commercial & Utilization Ranking Matrix ({filteredRoutes.length} O&D Markets)
            </h2>
            <p className="text-xs text-slate-500">
              Click any column header to sort or click a route row to open the dedicated Route Detail Page
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search route or market..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-900"
              />
            </div>

            <select
              value={marketFilter}
              onChange={(e) => setMarketFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded bg-white text-slate-700"
            >
              {marketTypes.map((m) => (
                <option key={m} value={m}>
                  {m === 'ALL' ? 'All Market Segments' : m}
                </option>
              ))}
            </select>

            <button
              onClick={() => exportToCsv('aerointel_route_performance', filteredRoutes as unknown as Record<string, unknown>[])}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={() => exportToExcelXml('aerointel_route_performance', 'RoutePerformance', filteredRoutes as unknown as Record<string, unknown>[])}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-2 cursor-pointer hover:text-slate-900" onClick={() => handleSort('contribution_rank')}>
                  <span className="inline-flex items-center gap-1">Rank <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="py-2.5 px-2 cursor-pointer hover:text-slate-900" onClick={() => handleSort('route_code')}>
                  Route
                </th>
                <th className="py-2.5 px-2">Market Segment</th>
                <th className="py-2.5 px-2 text-right cursor-pointer hover:text-slate-900" onClick={() => handleSort('flight_frequency')}>
                  Flights
                </th>
                <th className="py-2.5 px-2 text-right cursor-pointer hover:text-slate-900" onClick={() => handleSort('passenger_volume')}>
                  Passengers
                </th>
                <th className="py-2.5 px-2 text-right cursor-pointer hover:text-slate-900" onClick={() => handleSort('available_capacity')}>
                  Seats
                </th>
                <th className="py-2.5 px-2 text-right cursor-pointer hover:text-slate-900" onClick={() => handleSort('load_factor_pct')}>
                  <span className="inline-flex items-center gap-1">Load Factor <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="py-2.5 px-2 text-right cursor-pointer hover:text-slate-900" onClick={() => handleSort('avg_base_fare_usd')}>
                  Avg Fare
                </th>
                <th className="py-2.5 px-2 text-right cursor-pointer hover:text-slate-900" onClick={() => handleSort('rev_per_pax_usd')}>
                  Rev / Pax
                </th>
                <th className="py-2.5 px-2 text-right cursor-pointer hover:text-slate-900" onClick={() => handleSort('otp_arr_pct')}>
                  OTP (A14)
                </th>
                <th className="py-2.5 px-2 text-right cursor-pointer hover:text-slate-900" onClick={() => handleSort('estimated_contribution_usd')}>
                  <span className="inline-flex items-center gap-1">Est. Contribution <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="py-2.5 px-2 text-right cursor-pointer hover:text-slate-900" onClick={() => handleSort('contribution_margin_pct')}>
                  Margin
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
              {filteredRoutes.map((r) => (
                <tr
                  key={r.route_code}
                  onClick={() => onSelectRoute(r.route_code)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-2 text-slate-500">#{r.contribution_rank}</td>
                  <td className="py-2.5 px-2 font-semibold text-blue-950">{r.route_code}</td>
                  <td className="py-2.5 px-2 font-sans text-slate-600">{r.market_type}</td>
                  <td className="py-2.5 px-2 text-right">{r.flight_frequency}</td>
                  <td className="py-2.5 px-2 text-right">{r.passenger_volume.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-right text-slate-500">{r.available_capacity.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-right font-medium">{r.load_factor_pct.toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right">${r.avg_base_fare_usd.toFixed(0)}</td>
                  <td className="py-2.5 px-2 text-right">${r.rev_per_pax_usd.toFixed(0)}</td>
                  <td className="py-2.5 px-2 text-right">{r.otp_arr_pct.toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right font-semibold text-slate-900">
                    {fmtUsd(r.estimated_contribution_usd)}
                  </td>
                  <td className={`py-2.5 px-2 text-right font-medium ${r.contribution_margin_pct >= 15 ? 'text-emerald-700' : r.contribution_margin_pct >= 5 ? 'text-slate-700' : 'text-amber-700'}`}>
                    {r.contribution_margin_pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
