import React from 'react';
import { AirportPerformanceRow, CarrierPerformanceRow } from '../db/queries.ts';
import { exportToCsv, exportToExcelXml } from '../utils/exportUtils.ts';
import { Download } from 'lucide-react';

interface Props {
  airports: AirportPerformanceRow[];
  carriers: CarrierPerformanceRow[];
  onFilterByAirline: (airlineCode: string) => void;
  onFilterByOriginAirport: (airportCode: string) => void;
}

export const AirportCarrierTab: React.FC<Props> = ({
  airports,
  carriers,
  onFilterByAirline,
  onFilterByOriginAirport,
}) => {
  const fmtUsd = (n: number) =>
    n >= 1_000_000 || n <= -1_000_000
      ? `$${(n / 1_000_000).toFixed(2)}M`
      : `$${Math.round(n).toLocaleString()}`;

  return (
    <div className="space-y-6">
      {/* Operating Carrier Commercial & Operational Benchmarking Table */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Operating Carrier Commercial & Operational Comparison Matrix
            </h2>
            <p className="text-xs text-slate-500">
              Click any carrier row to filter the entire platform to that airline
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToCsv('aerointel_carrier_comparison', carriers as unknown as Record<string, unknown>[])}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={() => exportToExcelXml('aerointel_carrier_comparison', 'Carriers', carriers as unknown as Record<string, unknown>[])}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
            >
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-2">Carrier</th>
                <th className="py-2.5 px-2">Strategic Model</th>
                <th className="py-2.5 px-2 text-right">Flights</th>
                <th className="py-2.5 px-2 text-right">Passengers</th>
                <th className="py-2.5 px-2 text-right">Load Factor</th>
                <th className="py-2.5 px-2 text-right">Avg Base Fare</th>
                <th className="py-2.5 px-2 text-right">Dep OTP (D14)</th>
                <th className="py-2.5 px-2 text-right">Arr OTP (A14)</th>
                <th className="py-2.5 px-2 text-right">Cancel Rate</th>
                <th className="py-2.5 px-2 text-right">Total Op Rev</th>
                <th className="py-2.5 px-2 text-right">Est. Contribution</th>
                <th className="py-2.5 px-2 text-right">Direct Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
              {carriers.map((c) => (
                <tr
                  key={c.airline_code}
                  onClick={() => onFilterByAirline(c.airline_code)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-2 font-sans font-semibold text-blue-950">
                    <span className="font-mono font-bold mr-1.5">{c.airline_code}</span>
                    {c.airline_name}
                  </td>
                  <td className="py-2.5 px-2 font-sans text-slate-600">{c.carrier_group}</td>
                  <td className="py-2.5 px-2 text-right">{c.flights.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-right">{c.passengers.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-right">{c.load_factor_pct.toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right">${c.avg_fare_usd.toFixed(0)}</td>
                  <td className="py-2.5 px-2 text-right">{c.otp_dep_pct.toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right font-semibold text-slate-900">{c.otp_arr_pct.toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right">{c.cancel_rate_pct.toFixed(2)}%</td>
                  <td className="py-2.5 px-2 text-right">{fmtUsd(c.total_revenue_usd)}</td>
                  <td className="py-2.5 px-2 text-right font-semibold text-slate-900">
                    {fmtUsd(c.estimated_contribution_usd)}
                  </td>
                  <td className="py-2.5 px-2 text-right text-emerald-700 font-medium">
                    +{c.contribution_margin_pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hub Airport Performance & Surface Congestion Table */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Hub Airport Congestion, Reliability & Originating Contribution Matrix
            </h2>
            <p className="text-xs text-slate-500">
              Click any airport row to filter the entire platform to flights originating from that hub
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToCsv('aerointel_airport_comparison', airports as unknown as Record<string, unknown>[])}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-2">IATA</th>
                <th className="py-2.5 px-2">Airport Name & Metro</th>
                <th className="py-2.5 px-2">FAA Hub Tier</th>
                <th className="py-2.5 px-2 text-right">Departures</th>
                <th className="py-2.5 px-2 text-right">Congestion Index</th>
                <th className="py-2.5 px-2 text-right">Avg Taxi-Out</th>
                <th className="py-2.5 px-2 text-right">Avg Dep Delay</th>
                <th className="py-2.5 px-2 text-right">Arr OTP (A14)</th>
                <th className="py-2.5 px-2 text-right">Cancel Rate</th>
                <th className="py-2.5 px-2 text-right">Origin Contribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
              {airports.map((ap) => (
                <tr
                  key={ap.airport_code}
                  onClick={() => onFilterByOriginAirport(ap.airport_code)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-2 font-bold text-blue-950">{ap.airport_code}</td>
                  <td className="py-2.5 px-2 font-sans text-slate-900">
                    {ap.airport_name} <span className="text-slate-500">({ap.city})</span>
                  </td>
                  <td className="py-2.5 px-2 font-sans text-slate-600">{ap.hub_tier}</td>
                  <td className="py-2.5 px-2 text-right">{ap.departures}</td>
                  <td className="py-2.5 px-2 text-right">{ap.congestion_index.toFixed(2)}</td>
                  <td className="py-2.5 px-2 text-right">{ap.avg_taxi_out_mins.toFixed(1)} min</td>
                  <td className="py-2.5 px-2 text-right">{ap.avg_dep_delay_mins.toFixed(1)} min</td>
                  <td className="py-2.5 px-2 text-right font-semibold text-slate-900">{ap.otp_arr_pct.toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right">{ap.cancel_rate_pct.toFixed(2)}%</td>
                  <td className="py-2.5 px-2 text-right font-semibold text-slate-900">
                    {fmtUsd(ap.total_contribution_usd)}
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
