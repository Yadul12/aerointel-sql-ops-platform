import React, { useState } from 'react';
import {
  ExecutiveKpiSummary,
  DailyRollingTrendRow,
  RoutePerformanceRow,
  MonthlyPerformanceRow,
  DayOfWeekPerformanceRow,
} from '../db/queries.ts';
import { ArrowUpRight, Info } from 'lucide-react';

interface Props {
  kpis: ExecutiveKpiSummary;
  dailyTrends: DailyRollingTrendRow[];
  routes: RoutePerformanceRow[];
  monthly: MonthlyPerformanceRow[];
  dayOfWeekPerf: DayOfWeekPerformanceRow[];
  onSelectRoute: (routeCode: string) => void;
  onNavigateTab: (tab: string) => void;
}

export const ExecutiveOverviewTab: React.FC<Props> = ({
  kpis,
  dailyTrends,
  routes,
  monthly,
  dayOfWeekPerf,
  onSelectRoute,
  onNavigateTab,
}) => {
  const [trendMetric, setTrendMetric] = useState<'contribution' | 'otp' | 'load_factor'>('contribution');
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);

  const fmtUsd = (n: number) =>
    n >= 1_000_000 || n <= -1_000_000
      ? `$${(n / 1_000_000).toFixed(2)}M`
      : `$${Math.round(n).toLocaleString()}`;

  const topRoutes = routes.slice(0, 5);
  const weakRoutes = [...routes].sort((a, b) => a.contribution_margin_pct - b.contribution_margin_pct).slice(0, 5);

  // Prepare SVG trend line coordinates
  const chartWidth = 760;
  const chartHeight = 210;
  const padLeft = 48;
  const padRight = 18;
  const padTop = 16;
  const padBottom = 28;
  const innerW = chartWidth - padLeft - padRight;
  const innerH = chartHeight - padTop - padBottom;

  const valuesPrimary = dailyTrends.map((d) =>
    trendMetric === 'contribution'
      ? d.daily_contribution_usd / 1000
      : trendMetric === 'otp'
        ? d.daily_otp_arr_pct
        : d.daily_load_factor_pct
  );

  const valuesRolling = dailyTrends.map((d) =>
    trendMetric === 'contribution'
      ? d.rolling_7d_contribution_usd / 1000
      : trendMetric === 'otp'
        ? d.rolling_7d_otp_arr_pct
        : d.daily_load_factor_pct
  );

  const minVal = Math.min(...valuesPrimary, ...valuesRolling, trendMetric === 'contribution' ? 0 : 50);
  const maxVal = Math.max(...valuesPrimary, ...valuesRolling, trendMetric === 'contribution' ? 100 : 100);
  const valRange = Math.max(1, maxVal - minVal);

  const getX = (idx: number) =>
    padLeft + (idx / Math.max(1, dailyTrends.length - 1)) * innerW;
  const getY = (val: number) =>
    padTop + innerH - ((val - minVal) / valRange) * innerH;

  const primaryPath = valuesPrimary
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(v).toFixed(1)}`)
    .join(' ');
  const rollingPath = valuesRolling
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(v).toFixed(1)}`)
    .join(' ');

  return (
    <div className="space-y-6">
      {/* Data Provenance & Accounting Transparency Banner */}
      <div className="bg-white border border-slate-200 rounded-md p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-900">Data Provenance & Scope</span>
            <span aria-hidden="true">·</span>
            <span>US BTS T-100 / DB1B / On-Time Performance Calibrated Schema</span>
            <span aria-hidden="true">·</span>
            <span>Q1 2026 (Jan 1 – Mar 31, 2026)</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed max-w-4xl">
            Financial metrics strictly separate <strong className="text-slate-900">Observed Ticket Revenue</strong> (DB1B base fare × revenue passengers) from <strong className="text-slate-900">Estimated Ancillary & Cargo Revenue</strong> and <strong className="text-slate-900">Assumed Direct Operating Costs</strong> (DOT Form 41 Schedule P-5.2 block-hour benchmarks). Route Contribution reflects direct contribution prior to corporate overhead, network debt service, and tax—never represented as net airline corporate profit.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onNavigateTab('sql')}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
          >
            Inspect SQL Methodology
          </button>
          <button
            onClick={() => onNavigateTab('scenario')}
            className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors whitespace-nowrap"
          >
            Open Scenario Planner
          </button>
        </div>
      </div>

      {/* Primary 10-Metric Executive Strip (2 Rows of 5 High-Density Cells) */}
      <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-200">
        <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-slate-200">
          <div className="p-4">
            <div className="text-xs text-slate-500 mb-1">Total Scheduled Flights</div>
            <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {kpis.total_flights.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              {kpis.completed_flights.toLocaleString()} completed · {kpis.cancelled_flights} canc
            </div>
          </div>

          <div className="p-4">
            <div className="text-xs text-slate-500 mb-1">Revenue Passengers</div>
            <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {kpis.total_passengers.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              {kpis.total_available_seats.toLocaleString()} available seats
            </div>
          </div>

          <div className="p-4">
            <div className="text-xs text-slate-500 mb-1">System Load Factor</div>
            <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {kpis.load_factor_pct.toFixed(2)}%
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Target corridor: 83.5% – 88.0%
            </div>
          </div>

          <div className="p-4">
            <div className="text-xs text-slate-500 mb-1">Average Ticket Fare</div>
            <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              ${kpis.avg_base_fare_usd.toFixed(2)}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              ${kpis.avg_total_fare_usd.toFixed(2)} incl. ancillary
            </div>
          </div>

          <div className="p-4">
            <div className="text-xs text-slate-500 mb-1">Observed Ticket Revenue</div>
            <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {fmtUsd(kpis.observed_ticket_revenue_usd)}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              {fmtUsd(kpis.total_operating_revenue_usd)} total op rev
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-slate-200">
          <div className="p-4">
            <div className="text-xs text-slate-500 mb-1">Est. Route Contribution</div>
            <div className={`text-2xl font-semibold font-mono tabular-nums ${kpis.estimated_route_contribution_usd >= 0 ? 'text-slate-900' : 'text-red-700'}`}>
              {fmtUsd(kpis.estimated_route_contribution_usd)}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              {kpis.contribution_margin_pct.toFixed(1)}% direct margin
            </div>
          </div>

          <div className="p-4">
            <div className="text-xs text-slate-500 mb-1">Assumed Direct Costs</div>
            <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {fmtUsd(kpis.assumed_total_direct_cost_usd)}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              RASK {kpis.avg_rask_cents}¢ · CASK {kpis.avg_cask_cents}¢
            </div>
          </div>

          <div className="p-4">
            <div className="text-xs text-slate-500 mb-1">On-Time Arrival (A14)</div>
            <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {kpis.otp_arr_pct.toFixed(1)}%
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              Dep OTP (D14): {kpis.otp_dep_pct.toFixed(1)}%
            </div>
          </div>

          <div className="p-4">
            <div className="text-xs text-slate-500 mb-1">Average Arrival Delay</div>
            <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {kpis.avg_arr_delay_mins.toFixed(1)} min
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              Avg Dep Delay: {kpis.avg_dep_delay_mins.toFixed(1)} min
            </div>
          </div>

          <div className="p-4">
            <div className="text-xs text-slate-500 mb-1">Cancellation Rate</div>
            <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {kpis.cancel_rate_pct.toFixed(2)}%
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              Disruption Cost: {fmtUsd(kpis.assumed_disruption_cost_usd)}
            </div>
          </div>
        </div>
      </div>

      {/* Main Split: Daily Rolling 7-Day Trajectory + Monthly Seasonality Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 8 Cols: Daily & Rolling 7-Day Window Chart */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-md p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Daily Trajectory & Rolling 7-Day SQL Window Average
                </h2>
                <p className="text-xs text-slate-500">
                  Computed via PostgreSQL window frame (ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded">
                <button
                  onClick={() => setTrendMetric('contribution')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    trendMetric === 'contribution'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Route Contribution ($K)
                </button>
                <button
                  onClick={() => setTrendMetric('otp')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    trendMetric === 'otp'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Arrival OTP (%)
                </button>
                <button
                  onClick={() => setTrendMetric('load_factor')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    trendMetric === 'load_factor'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Load Factor (%)
                </button>
              </div>
            </div>

            {dailyTrends.length > 0 ? (
              <div className="relative">
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-56 overflow-visible"
                  onMouseLeave={() => setHoveredDayIdx(null)}
                >
                  {/* Horizontal Grid Lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                    const y = padTop + t * innerH;
                    const labelVal = maxVal - t * valRange;
                    return (
                      <g key={t}>
                        <line
                          x1={padLeft}
                          y1={y}
                          x2={chartWidth - padRight}
                          y2={y}
                          stroke="#e2e8f0"
                          strokeDasharray="3 3"
                        />
                        <text
                          x={padLeft - 6}
                          y={y + 3}
                          textAnchor="end"
                          className="text-[10px] fill-slate-500 font-mono"
                        >
                          {trendMetric === 'contribution'
                            ? `$${Math.round(labelVal)}K`
                            : `${labelVal.toFixed(0)}%`}
                        </text>
                      </g>
                    );
                  })}

                  {/* Daily Raw Line */}
                  <path
                    d={primaryPath}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="1.25"
                    opacity="0.7"
                  />

                  {/* Rolling 7-Day Window Line */}
                  <path
                    d={rollingPath}
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="2.2"
                  />

                  {/* X-axis Date Ticks */}
                  {dailyTrends.map((d, i) => {
                    if (i % 14 !== 0 && i !== dailyTrends.length - 1) return null;
                    return (
                      <text
                        key={d.flight_date}
                        x={getX(i)}
                        y={chartHeight - 6}
                        textAnchor="middle"
                        className="text-[10px] fill-slate-500 font-mono"
                      >
                        {d.flight_date.slice(5)}
                      </text>
                    );
                  })}

                  {/* Interactive Hover Columns */}
                  {dailyTrends.map((d, i) => (
                    <rect
                      key={d.flight_date}
                      x={getX(i) - innerW / dailyTrends.length / 2}
                      y={padTop}
                      width={innerW / dailyTrends.length}
                      height={innerH}
                      fill="transparent"
                      className="cursor-crosshair"
                      onMouseEnter={() => setHoveredDayIdx(i)}
                    />
                  ))}

                  {hoveredDayIdx !== null && dailyTrends[hoveredDayIdx] && (
                    <g>
                      <line
                        x1={getX(hoveredDayIdx)}
                        y1={padTop}
                        x2={getX(hoveredDayIdx)}
                        y2={padTop + innerH}
                        stroke="#1e40af"
                        strokeWidth="1"
                      />
                      <circle
                        cx={getX(hoveredDayIdx)}
                        cy={getY(valuesRolling[hoveredDayIdx])}
                        r="4"
                        fill="#1e40af"
                      />
                    </g>
                  )}
                </svg>

                {/* Legend & Active Hover Readout */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                  <div className="flex items-center gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-slate-900 inline-block"></span>
                      <span>7-Day Rolling Window Average</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-slate-400 inline-block"></span>
                      <span>Daily Observation</span>
                    </span>
                  </div>
                  {hoveredDayIdx !== null && dailyTrends[hoveredDayIdx] ? (
                    <div className="font-mono text-xs text-slate-900">
                      {dailyTrends[hoveredDayIdx].flight_date} · Flights: {dailyTrends[hoveredDayIdx].flights} · OTP: {dailyTrends[hoveredDayIdx].daily_otp_arr_pct}% (7d: {dailyTrends[hoveredDayIdx].rolling_7d_otp_arr_pct}%) · Contrib: {fmtUsd(dailyTrends[hoveredDayIdx].daily_contribution_usd)}
                    </div>
                  ) : (
                    <div className="text-slate-400">Hover chart to inspect daily and 7-day rolling SQL values</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-xs text-slate-500">
                No flight records match current global filters.
              </div>
            )}
          </div>
        </div>

        {/* Right 4 Cols: Seasonal Progression & Accounting Reconciliation */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-md p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-1">
              Seasonal Progression (Q1 2026)
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Winter trough (Jan/Feb) vs Spring shoulder peak demand (Mar)
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                    <th className="py-2">Month</th>
                    <th className="py-2 text-right">Load Factor</th>
                    <th className="py-2 text-right">Avg Fare</th>
                    <th className="py-2 text-right">OTP (A14)</th>
                    <th className="py-2 text-right">Contribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                  {monthly.map((m) => (
                    <tr key={m.month_num} className="hover:bg-slate-50">
                      <td className="py-2.5 font-sans font-medium text-slate-900">
                        {m.month_name}
                        <div className="text-[10px] text-slate-500 font-normal">{m.season}</div>
                      </td>
                      <td className="py-2.5 text-right">{m.load_factor_pct.toFixed(1)}%</td>
                      <td className="py-2.5 text-right">${m.avg_fare_usd.toFixed(0)}</td>
                      <td className="py-2.5 text-right">{m.otp_arr_pct.toFixed(1)}%</td>
                      <td className="py-2.5 text-right font-semibold text-slate-900">
                        {fmtUsd(m.estimated_contribution_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200 space-y-2 text-xs">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-800" />
              <span>Metric Definitions & Reconciliation</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              <strong>A14 On-Time Arrival:</strong> DOT standard arrival within 14 minutes of scheduled block time.
            </p>
            <p className="text-slate-600 leading-relaxed">
              <strong>Estimated Contribution:</strong> Observed Ticket Revenue + Est. Ancillary/Cargo − Assumed Direct Operating Costs (Fuel, Crew, Maintenance, Station, Delay/Cancellation Penalties).
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Split: Strongest Commercial Routes vs Underperforming / Disrupted Routes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Strongest Commercial Performance */}
        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Top Commercial Contribution Routes
              </h3>
              <p className="text-xs text-slate-500">
                Ranked by estimated direct contribution; click any route to drill down
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('routes')}
              className="text-xs font-medium text-blue-900 hover:underline flex items-center gap-1"
            >
              View All Routes <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <th className="py-2">Route</th>
                  <th className="py-2">Market Type</th>
                  <th className="py-2 text-right">Load Factor</th>
                  <th className="py-2 text-right">RASK / CASK</th>
                  <th className="py-2 text-right">Est. Contribution</th>
                  <th className="py-2 text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {topRoutes.map((r) => (
                  <tr
                    key={r.route_code}
                    onClick={() => onSelectRoute(r.route_code)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 font-mono font-semibold text-blue-950">
                      {r.route_code}
                    </td>
                    <td className="py-2.5 text-slate-600">{r.market_type}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">
                      {r.load_factor_pct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-slate-600">
                      {r.rask_cents.toFixed(1)}¢ / {r.cask_cents.toFixed(1)}¢
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {fmtUsd(r.estimated_contribution_usd)}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-emerald-700 font-medium">
                      +{r.contribution_margin_pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Weak Utilisation or High Disruption Exposure */}
        <div className="bg-white border border-slate-200 rounded-md p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Lowest Margin & Capacity/Disruption Watchlist
              </h3>
              <p className="text-xs text-slate-500">
                Routes experiencing low load factor, high CASK, or severe delay drag
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('delays')}
              className="text-xs font-medium text-blue-900 hover:underline flex items-center gap-1"
            >
              Inspect Disruption <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <th className="py-2">Route</th>
                  <th className="py-2 text-right">Load Factor</th>
                  <th className="py-2 text-right">OTP (A14)</th>
                  <th className="py-2 text-right">Disruption Cost</th>
                  <th className="py-2 text-right">Est. Contribution</th>
                  <th className="py-2 text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {weakRoutes.map((r) => (
                  <tr
                    key={r.route_code}
                    onClick={() => onSelectRoute(r.route_code)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 font-mono font-semibold text-blue-950">
                      {r.route_code}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums">
                      {r.load_factor_pct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums">
                      {r.otp_arr_pct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-amber-700">
                      {fmtUsd(r.assumed_disruption_cost_usd)}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {fmtUsd(r.estimated_contribution_usd)}
                    </td>
                    <td className={`py-2.5 text-right font-mono tabular-nums font-medium ${r.contribution_margin_pct < 0 ? 'text-red-700' : 'text-amber-700'}`}>
                      {r.contribution_margin_pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Day-of-Week Schedule Cadence: Load Factor, Yield & OTP Matrix */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Day-of-Week Commercial &amp; Operational Cadence Matrix
            </h3>
            <p className="text-xs text-slate-500">
              Highlights midweek capacity softness (Tue/Wed) vs peak Friday/Sunday load factor, average ticket fare, and OTP
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-2 px-2">Day of Week</th>
                <th className="py-2 px-2 text-right">Scheduled Flights</th>
                <th className="py-2 px-2 text-right">Revenue Passengers</th>
                <th className="py-2 px-2 text-right">Available Seats</th>
                <th className="py-2 px-2 text-right">Load Factor</th>
                <th className="py-2 px-2 text-right">Avg Base Fare</th>
                <th className="py-2 px-2 text-right">Arrival OTP (A14)</th>
                <th className="py-2 px-2 text-right">Avg Arr Delay</th>
                <th className="py-2 px-2 text-right">Est. Contribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
              {dayOfWeekPerf.map((d) => (
                <tr key={d.day_of_week} className="hover:bg-slate-50">
                  <td className="py-2.5 px-2 font-sans font-semibold text-slate-900">{d.day_name}</td>
                  <td className="py-2.5 px-2 text-right">{d.flights.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-right">{d.passengers.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-right text-slate-500">{d.available_seats.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-right font-semibold">{d.load_factor_pct.toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right">${d.avg_base_fare_usd.toFixed(2)}</td>
                  <td className="py-2.5 px-2 text-right">{d.otp_arr_pct.toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right">{d.avg_arr_delay_mins.toFixed(1)} min</td>
                  <td className="py-2.5 px-2 text-right font-semibold text-slate-900">
                    {fmtUsd(d.estimated_contribution_usd)}
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
