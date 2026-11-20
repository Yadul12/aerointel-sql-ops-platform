import React from 'react';
import {
  ExecutiveKpiSummary,
  HourlyDelayPatternRow,
  AirportPerformanceRow,
  CarrierPerformanceRow,
  FleetGaugeUtilizationRow,
  TurnaroundBufferTierRow,
} from '../db/queries.ts';

interface Props {
  kpis: ExecutiveKpiSummary;
  hourlyPatterns: HourlyDelayPatternRow[];
  airports: AirportPerformanceRow[];
  carriers: CarrierPerformanceRow[];
  fleetUtilization: FleetGaugeUtilizationRow[];
  turnaroundTiers: TurnaroundBufferTierRow[];
}

export const OperationalPerformanceTab: React.FC<Props> = ({
  kpis,
  hourlyPatterns,
  airports,
  carriers,
  fleetUtilization,
  turnaroundTiers,
}) => {
  const maxDelayHourly = Math.max(...hourlyPatterns.map((h) => h.avg_arr_delay_mins), 25);

  return (
    <div className="space-y-6">
      {/* Operational KPI Strip */}
      <div className="bg-white border border-slate-200 rounded-md grid grid-cols-2 md:grid-cols-6 divide-x divide-slate-200">
        <div className="p-4">
          <div className="text-xs text-slate-500">On-Time Departure (D14)</div>
          <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
            {kpis.otp_dep_pct.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Dep delay &lt; 15 mins</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">On-Time Arrival (A14)</div>
          <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
            {kpis.otp_arr_pct.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-500 mt-0.5">DOT primary reliability metric</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Mean Departure Delay</div>
          <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
            {kpis.avg_dep_delay_mins.toFixed(1)} min
          </div>
          <div className="text-xs text-slate-500 mt-0.5">All completed departures</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Mean Arrival Delay</div>
          <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
            {kpis.avg_arr_delay_mins.toFixed(1)} min
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Block schedule buffer effect</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Cancellation Rate</div>
          <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
            {kpis.cancel_rate_pct.toFixed(2)}%
          </div>
          <div className="text-xs text-slate-500 mt-0.5 font-mono">
            {kpis.cancelled_flights} cancelled flights
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Diverted Flights</div>
          <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
            {kpis.diverted_flights}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">En-route weather/technical</div>
        </div>
      </div>

      {/* Departure Wave & Rotational Turnaround Bottleneck Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-md p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-1">
              Time-of-Day Departure Wave & Rotational Delay Accumulation
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Tracks how tightening aircraft turnaround buffers across afternoon/evening banks drive cascading arrival delays
            </p>

            <div className="space-y-2.5">
              {hourlyPatterns.map((h) => {
                const barWidth = Math.min(100, Math.max(4, (Math.max(0, h.avg_arr_delay_mins) / maxDelayHourly) * 100));
                return (
                  <div key={h.sched_dep_hour} className="grid grid-cols-12 items-center gap-2 text-xs">
                    <div className="col-span-2 font-mono font-semibold text-slate-900">
                      {String(h.sched_dep_hour).padStart(2, '0')}:00 Wave
                    </div>
                    <div className="col-span-2 font-mono text-slate-600 text-right">
                      OTP {h.otp_arr_pct.toFixed(1)}%
                    </div>
                    <div className="col-span-5">
                      <div className="w-full h-3 bg-slate-100 rounded overflow-hidden">
                        <div
                          className={`h-full ${h.avg_arr_delay_mins >= 15 ? 'bg-amber-600' : 'bg-blue-900'}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                    <div className="col-span-3 font-mono text-right text-slate-800">
                      {h.avg_arr_delay_mins.toFixed(1)}m · Buf {h.avg_turnaround_buffer_mins.toFixed(0)}m
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600">
            <strong>Operational Bottleneck Diagnosis:</strong> Evening departure waves (17:00–21:00) exhibit reduced scheduled ground turnaround buffers (~37–43 mins), amplifying late-arriving aircraft propagation compared to 06:00 morning originators.
          </div>
        </div>

        {/* Right 5 Cols: Carrier Operational Reliability Matrix */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-md p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">
            Operating Carrier OTP & Block Execution
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            D14 departure vs A14 arrival reliability across reporting airlines
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <th className="py-2">Carrier</th>
                  <th className="py-2 text-right">Dep OTP</th>
                  <th className="py-2 text-right">Arr OTP</th>
                  <th className="py-2 text-right">Canc %</th>
                  <th className="py-2 text-right">Avg Delay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                {carriers.map((c) => (
                  <tr key={c.airline_code} className="hover:bg-slate-50">
                    <td className="py-2.5 font-sans font-medium text-slate-900">
                      <span className="font-mono font-bold mr-1.5">{c.airline_code}</span>
                      {c.airline_name}
                    </td>
                    <td className="py-2.5 text-right">{c.otp_dep_pct.toFixed(1)}%</td>
                    <td className="py-2.5 text-right font-semibold text-slate-900">{c.otp_arr_pct.toFixed(1)}%</td>
                    <td className="py-2.5 text-right">{c.cancel_rate_pct.toFixed(2)}%</td>
                    <td className="py-2.5 text-right">{c.avg_arr_delay_mins.toFixed(1)}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Turnaround Buffer Sensitivity & Aircraft Fleet Gauge Utilization Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Turnaround Buffer Tiers */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-md p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">
            Ground Turnaround Buffer vs. Rotational Delay Impact
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Quantifies how tight ground turn times (&lt;40 mins) erode arrival OTP and inflate per-flight disruption costs
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <th className="py-2">Turnaround Tier</th>
                  <th className="py-2 text-right">Flights</th>
                  <th className="py-2 text-right">Arr OTP</th>
                  <th className="py-2 text-right">Late Acft Min</th>
                  <th className="py-2 text-right">Disruption/Flt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                {turnaroundTiers.map((t) => (
                  <tr key={t.turnaround_tier} className="hover:bg-slate-50">
                    <td className="py-2.5 font-sans font-medium text-slate-900">{t.turnaround_tier}</td>
                    <td className="py-2.5 text-right">{t.flights}</td>
                    <td className="py-2.5 text-right font-semibold">{t.otp_arr_pct.toFixed(1)}%</td>
                    <td className="py-2.5 text-right">{t.avg_late_aircraft_mins.toFixed(1)}m</td>
                    <td className="py-2.5 text-right text-amber-800 font-semibold">
                      ${t.avg_disruption_cost_usd.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Fleet Gauge Capacity Utilization */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-md p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">
            Sub-Fleet Aircraft Gauge Utilization & Block-Hour Economics
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Evaluates seat capacity utilization, fuel burn per block hour, and average route contribution per departure across deployed aircraft types
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <th className="py-2">Aircraft Type</th>
                  <th className="py-2 text-right">Seats</th>
                  <th className="py-2 text-right">Flights</th>
                  <th className="py-2 text-right">Load Factor</th>
                  <th className="py-2 text-right">Fuel Gal/BH</th>
                  <th className="py-2 text-right">RASK / CASK</th>
                  <th className="py-2 text-right">Avg Contrib / Flt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                {fleetUtilization.map((f) => (
                  <tr key={f.aircraft_code} className="hover:bg-slate-50">
                    <td className="py-2.5 font-sans font-medium text-slate-900">
                      <span className="font-mono font-bold mr-1.5">{f.aircraft_code}</span>
                      {f.aircraft_model}
                    </td>
                    <td className="py-2.5 text-right">{f.total_seats}</td>
                    <td className="py-2.5 text-right">{f.departures}</td>
                    <td className="py-2.5 text-right font-semibold">{f.load_factor_pct.toFixed(1)}%</td>
                    <td className="py-2.5 text-right">{f.fuel_gallons_per_block_hr.toFixed(0)}</td>
                    <td className="py-2.5 text-right text-slate-600">
                      {f.rask_cents.toFixed(1)}¢ / {f.cask_cents.toFixed(1)}¢
                    </td>
                    <td className="py-2.5 text-right font-semibold text-slate-900">
                      ${f.avg_contribution_per_flight.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Airport Hub Surface Congestion & Taxi-Out Efficiency Table */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">
          Airport Hub Surface Efficiency, Taxi-Out Bottlenecks & Weather Exposure
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Compares origin hub congestion index and severe weather days against actual taxi-out times and departure delays
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-2 px-2">Hub Airport</th>
                <th className="py-2 px-2">Hub Tier & Slot Classification</th>
                <th className="py-2 px-2 text-right">Departures</th>
                <th className="py-2 px-2 text-right">Congestion Index</th>
                <th className="py-2 px-2 text-right">Avg Taxi-Out</th>
                <th className="py-2 px-2 text-right">Dep OTP (D14)</th>
                <th className="py-2 px-2 text-right">Arr OTP (A14)</th>
                <th className="py-2 px-2 text-right">Cancel Rate</th>
                <th className="py-2 px-2 text-right">Severe Weather Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
              {airports.map((ap) => (
                <tr key={ap.airport_code} className="hover:bg-slate-50">
                  <td className="py-2.5 px-2 font-bold text-slate-900">
                    {ap.airport_code} <span className="font-sans font-normal text-slate-600">· {ap.city}</span>
                  </td>
                  <td className="py-2.5 px-2 font-sans text-slate-600">{ap.hub_tier}</td>
                  <td className="py-2.5 px-2 text-right">{ap.departures}</td>
                  <td className="py-2.5 px-2 text-right">{ap.congestion_index.toFixed(2)} / 10</td>
                  <td className="py-2.5 px-2 text-right">{ap.avg_taxi_out_mins.toFixed(1)} min</td>
                  <td className="py-2.5 px-2 text-right">{ap.otp_dep_pct.toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right font-semibold text-slate-900">{ap.otp_arr_pct.toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right">{ap.cancel_rate_pct.toFixed(2)}%</td>
                  <td className="py-2.5 px-2 text-right">{ap.severe_weather_days} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

