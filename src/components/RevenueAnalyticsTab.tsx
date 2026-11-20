import React, { useState, useEffect } from 'react';
import { ExecutiveKpiSummary, RoutePerformanceRow } from '../db/queries.ts';
import { getPgDb } from '../db/pgEngine.ts';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { collection, doc, setDoc, serverTimestamp, query, where, onSnapshot } from 'firebase/firestore';
import { Save, RotateCcw } from 'lucide-react';

interface Props {
  kpis: ExecutiveKpiSummary;
  routes: RoutePerformanceRow[];
}

interface OperatingCostAssumptionRow {
  aircraft_code: string;
  fuel_gallons_per_block_hr: number;
  default_fuel_price_per_gal: number;
  crew_cost_per_block_hr: number;
  maintenance_cost_per_block_hr: number;
  aircraft_ownership_per_block_hr: number;
  landing_navigation_fee_per_dep: number;
  ground_handling_per_turn: number;
  pax_service_cost_per_pax: number;
  delay_cost_per_min: number;
  cancellation_penalty_per_flight: number;
  assumption_source: string;
}

export const RevenueAnalyticsTab: React.FC<Props> = ({ kpis, routes }) => {
  const [costAssumptions, setCostAssumptions] = useState<OperatingCostAssumptionRow[]>([]);
  const [fuelSensitivityPrice, setFuelSensitivityPrice] = useState<number>(2.78);
  const [fareSensitivityDeltaPct, setFareSensitivityDeltaPct] = useState<number>(0);
  const [savingStatus, setSavingStatus] = useState<string>('');
  const [savedOverridesCount, setSavedOverridesCount] = useState<number>(0);

  useEffect(() => {
    (async () => {
      const pg = await getPgDb();
      const res = await pg.query<OperatingCostAssumptionRow>(
        `SELECT
          aircraft_code,
          fuel_gallons_per_block_hr::float,
          default_fuel_price_per_gal::float,
          crew_cost_per_block_hr::float,
          maintenance_cost_per_block_hr::float,
          aircraft_ownership_per_block_hr::float,
          landing_navigation_fee_per_dep::float,
          ground_handling_per_turn::float,
          pax_service_cost_per_pax::float,
          delay_cost_per_min::float,
          cancellation_penalty_per_flight::float,
          assumption_source
         FROM operating_cost_assumptions
         ORDER BY aircraft_code ASC;`
      );
      setCostAssumptions(res.rows);
    })();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(collection(db, 'cost_overrides'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSavedOverridesCount(snap.size);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'cost_overrides');
      }
    );
    return () => unsub();
  }, []);

  const fmtUsd = (n: number) =>
    n >= 1_000_000 || n <= -1_000_000
      ? `$${(n / 1_000_000).toFixed(2)}M`
      : `$${Math.round(n).toLocaleString()}`;

  // Calculate sensitivity effects on system contribution
  const baseFuelPrice = 2.78;
  const fuelCostMultiplier = fuelSensitivityPrice / baseFuelPrice;
  const fareMultiplier = 1 + fareSensitivityDeltaPct / 100;

  const adjustedObservedTicketRev = kpis.observed_ticket_revenue_usd * fareMultiplier;
  const adjustedTotalRev =
    adjustedObservedTicketRev +
    kpis.estimated_ancillary_revenue_usd +
    kpis.estimated_cargo_revenue_usd;

  const adjustedFuelCost = kpis.assumed_fuel_cost_usd * fuelCostMultiplier;
  const adjustedTotalDirectCost =
    adjustedFuelCost +
    kpis.assumed_crew_maint_cost_usd +
    kpis.assumed_station_pax_cost_usd +
    kpis.assumed_disruption_cost_usd;

  const adjustedContribution = adjustedTotalRev - adjustedTotalDirectCost;
  const contributionDelta = adjustedContribution - kpis.estimated_route_contribution_usd;

  const handleSaveCostOverrideToFirestore = async (row: OperatingCostAssumptionRow) => {
    const user = auth.currentUser;
    if (!user) {
      setSavingStatus('Sign in via Google in the top bar to persist cost assumption overrides to Firestore.');
      return;
    }
    const overrideId = `${user.uid.slice(0, 12)}_${row.aircraft_code}`;
    try {
      await setDoc(doc(db, 'cost_overrides', overrideId), {
        ownerId: user.uid,
        aircraftCode: row.aircraft_code,
        fuelGallonsPerBlockHour: Number(row.fuel_gallons_per_block_hr),
        crewCostPerBlockHour: Number(row.crew_cost_per_block_hr),
        maintenanceCostPerBlockHour: Number(row.maintenance_cost_per_block_hr),
        delayCostPerMinute: Number(row.delay_cost_per_min),
        createdAt: serverTimestamp(),
      });
      setSavingStatus(`Saved ${row.aircraft_code} cost assumption benchmark to Firestore.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `cost_overrides/${overrideId}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Governance Notice: Observed vs Estimated vs Assumed Direct Costs */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">
          Transparent Airline Financial Accounting & Route Contribution Framework
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed mb-4">
          In compliance with aviation financial analytics standards, AeroIntel strictly separates <strong className="text-slate-900">Observed Ticket Revenue</strong> (derived from BTS DB1B O&D base fares and T-100 enplaned revenue passengers) from <strong className="text-slate-900">Estimated Ancillary & Belly Cargo Revenue</strong> and <strong className="text-slate-900">Assumed Direct Operating Costs</strong> (modeled from US DOT Form 41 Schedule P-5.2 aircraft block-hour benchmarks). Route Contribution is never labeled as net airline profit, as unallocated corporate SG&A, aircraft fleet debt financing, and network loyalty economics are excluded from route-level direct margin.
        </p>

        {/* 4-Column Financial Bridge */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded">
            <div className="text-[11px] font-semibold text-slate-500">1. Observed Ticket Revenue</div>
            <div className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-1">
              {fmtUsd(kpis.observed_ticket_revenue_usd)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              DB1B Base Fare (${kpis.avg_base_fare_usd.toFixed(2)}) × {kpis.total_passengers.toLocaleString()} Rev Pax
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded">
            <div className="text-[11px] font-semibold text-slate-500">2. Estimated Ancillary & Cargo</div>
            <div className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-1">
              +{fmtUsd(kpis.estimated_ancillary_revenue_usd + kpis.estimated_cargo_revenue_usd)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Ancillary: {fmtUsd(kpis.estimated_ancillary_revenue_usd)} · Cargo: {fmtUsd(kpis.estimated_cargo_revenue_usd)}
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded">
            <div className="text-[11px] font-semibold text-slate-500">3. Assumed Direct Operating Costs</div>
            <div className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-1">
              −{fmtUsd(kpis.assumed_total_direct_cost_usd)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Fuel: {fmtUsd(kpis.assumed_fuel_cost_usd)} · Crew/Maint: {fmtUsd(kpis.assumed_crew_maint_cost_usd)}
            </div>
          </div>

          <div className="p-3.5 bg-slate-900 text-white rounded">
            <div className="text-[11px] font-semibold text-slate-300">4. Estimated Route Contribution</div>
            <div className="text-xl font-bold font-mono tabular-nums mt-1">
              {fmtUsd(kpis.estimated_route_contribution_usd)}
            </div>
            <div className="text-xs text-slate-300 mt-1 font-mono">
              {kpis.contribution_margin_pct.toFixed(1)}% Direct Margin · Spread +{(kpis.avg_rask_cents - kpis.avg_cask_cents).toFixed(2)}¢/ASM
            </div>
          </div>
        </div>
      </div>

      {/* Middle Split: Waterfall Decomposition + Live Fuel & Fare Sensitivity Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 7 Cols: P&L Component Waterfall Breakdown */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-md p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">
            Direct Operating Revenue & Cost Component Decomposition
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Proportion of total operating revenue consumed by each direct cost category
          </p>

          <div className="space-y-3 text-xs">
            {[
              {
                label: 'Observed Passenger Ticket Revenue (DB1B Base Fare)',
                type: 'Observed Fact',
                amount: kpis.observed_ticket_revenue_usd,
                pctOfRev: (kpis.observed_ticket_revenue_usd / Math.max(1, kpis.total_operating_revenue_usd)) * 100,
                barColor: 'bg-slate-900',
              },
              {
                label: 'Estimated Ancillary & Belly Cargo Revenue',
                type: 'Estimated Revenue',
                amount: kpis.estimated_ancillary_revenue_usd + kpis.estimated_cargo_revenue_usd,
                pctOfRev:
                  ((kpis.estimated_ancillary_revenue_usd + kpis.estimated_cargo_revenue_usd) /
                    Math.max(1, kpis.total_operating_revenue_usd)) *
                  100,
                barColor: 'bg-blue-800',
              },
              {
                label: 'Assumed Aircraft Crew, Maintenance & Ownership (Form 41 Block-Hr)',
                type: 'Assumed Direct Cost',
                amount: -kpis.assumed_crew_maint_cost_usd,
                pctOfRev: (kpis.assumed_crew_maint_cost_usd / Math.max(1, kpis.total_operating_revenue_usd)) * 100,
                barColor: 'bg-slate-500',
              },
              {
                label: 'Assumed Jet-A Fuel Burn Cost (Block Hours × Gal/Hr × Spot Price)',
                type: 'Assumed Direct Cost',
                amount: -kpis.assumed_fuel_cost_usd,
                pctOfRev: (kpis.assumed_fuel_cost_usd / Math.max(1, kpis.total_operating_revenue_usd)) * 100,
                barColor: 'bg-slate-600',
              },
              {
                label: 'Assumed Airport Landing, Turn Handling & Passenger Variable Costs',
                type: 'Assumed Direct Cost',
                amount: -kpis.assumed_station_pax_cost_usd,
                pctOfRev: (kpis.assumed_station_pax_cost_usd / Math.max(1, kpis.total_operating_revenue_usd)) * 100,
                barColor: 'bg-slate-400',
              },
              {
                label: 'Assumed Tactical Delay & Cancellation Disruption Penalties',
                type: 'Assumed Direct Cost',
                amount: -kpis.assumed_disruption_cost_usd,
                pctOfRev: (kpis.assumed_disruption_cost_usd / Math.max(1, kpis.total_operating_revenue_usd)) * 100,
                barColor: 'bg-amber-600',
              },
            ].map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-slate-900">{item.label}</span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="text-[11px] text-slate-500">{item.type}</span>
                  </div>
                  <div className="font-mono tabular-nums font-semibold text-slate-900">
                    {item.amount >= 0 ? fmtUsd(item.amount) : `−${fmtUsd(Math.abs(item.amount))}`} ({item.pctOfRev.toFixed(1)}%)
                  </div>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded overflow-hidden">
                  <div
                    className={`h-full ${item.barColor}`}
                    style={{ width: `${Math.min(100, Math.max(2, item.pctOfRev))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right 5 Cols: Quick Fuel & Fare Sensitivity Sandbox */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-md p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Fuel Price & Fare Yield Sensitivity Stress Test
              </h3>
              <button
                onClick={() => {
                  setFuelSensitivityPrice(2.78);
                  setFareSensitivityDeltaPct(0);
                }}
                className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Test immediate route contribution sensitivity to Jet-A spot price and average ticket yield
            </p>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700">Assumed Jet-A Fuel Price ($ / gallon)</span>
                  <span className="font-mono font-semibold text-slate-900">${fuelSensitivityPrice.toFixed(2)} / gal</span>
                </div>
                <input
                  type="range"
                  min={1.80}
                  max={4.50}
                  step={0.05}
                  value={fuelSensitivityPrice}
                  onChange={(e) => setFuelSensitivityPrice(Number(e.target.value))}
                  className="w-full accent-slate-900"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>$1.80/gal</span>
                  <span>Baseline: $2.78/gal</span>
                  <span>$4.50/gal</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700">Average Base Fare Adjustment (%)</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {fareSensitivityDeltaPct >= 0 ? `+${fareSensitivityDeltaPct}%` : `${fareSensitivityDeltaPct}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-25}
                  max={25}
                  step={1}
                  value={fareSensitivityDeltaPct}
                  onChange={(e) => setFareSensitivityDeltaPct(Number(e.target.value))}
                  className="w-full accent-slate-900"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>-25% Fare</span>
                  <span>0% (Observed)</span>
                  <span>+25% Fare</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-200 grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <div className="text-slate-500">Simulated Fuel Cost</div>
              <div className="text-base font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                {fmtUsd(adjustedFuelCost)}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <div className="text-slate-500">Simulated Contribution</div>
              <div className={`text-base font-bold font-mono tabular-nums mt-0.5 ${adjustedContribution >= 0 ? 'text-slate-900' : 'text-red-700'}`}>
                {fmtUsd(adjustedContribution)}
              </div>
              <div className={`text-[11px] font-mono ${contributionDelta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {contributionDelta >= 0 ? `+${fmtUsd(contributionDelta)}` : fmtUsd(contributionDelta)} vs base
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form 41 Direct Operating Cost Assumptions Table by Aircraft Gauge */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Aircraft Direct Operating Cost Assumptions Table (`operating_cost_assumptions`)
            </h3>
            <p className="text-xs text-slate-500">
              Editable block-hour cost parameters stored in PostgreSQL; authenticated analysts can snapshot custom overrides to Firestore ({savedOverridesCount} saved)
            </p>
          </div>
          {savingStatus && (
            <div className="text-xs font-medium text-blue-900 bg-blue-50 px-3 py-1 rounded">
              {savingStatus}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-2 px-2">Aircraft</th>
                <th className="py-2 px-2 text-right">Fuel Burn (Gal/BH)</th>
                <th className="py-2 px-2 text-right">Crew ($/BH)</th>
                <th className="py-2 px-2 text-right">Maint ($/BH)</th>
                <th className="py-2 px-2 text-right">Ownership ($/BH)</th>
                <th className="py-2 px-2 text-right">Landing & Turn ($)</th>
                <th className="py-2 px-2 text-right">Delay Cost ($/Min)</th>
                <th className="py-2 px-2">Methodology Source</th>
                <th className="py-2 px-2 text-right">Persist</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
              {costAssumptions.map((c) => (
                <tr key={c.aircraft_code} className="hover:bg-slate-50">
                  <td className="py-2.5 px-2 font-bold text-slate-900">{c.aircraft_code}</td>
                  <td className="py-2.5 px-2 text-right">{c.fuel_gallons_per_block_hr.toFixed(0)} gal</td>
                  <td className="py-2.5 px-2 text-right">${c.crew_cost_per_block_hr.toFixed(0)}</td>
                  <td className="py-2.5 px-2 text-right">${c.maintenance_cost_per_block_hr.toFixed(0)}</td>
                  <td className="py-2.5 px-2 text-right">${c.aircraft_ownership_per_block_hr.toFixed(0)}</td>
                  <td className="py-2.5 px-2 text-right">
                    ${(c.landing_navigation_fee_per_dep + c.ground_handling_per_turn).toFixed(0)}
                  </td>
                  <td className="py-2.5 px-2 text-right">${c.delay_cost_per_min.toFixed(0)}/m</td>
                  <td className="py-2.5 px-2 font-sans text-slate-500 text-[11px]">{c.assumption_source}</td>
                  <td className="py-2.5 px-2 text-right">
                    <button
                      onClick={() => handleSaveCostOverrideToFirestore(c)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-sans font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      <Save className="w-3 h-3" /> Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Route Revenue vs Direct Cost Matrix */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">
          Route Financial Statement: Observed Revenue vs Assumed Direct Cost Breakdown
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Reconciles route-level revenue streams against fuel, crew/maintenance, station, and disruption costs
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-2 px-2">Route</th>
                <th className="py-2 px-2 text-right">Observed Ticket Rev</th>
                <th className="py-2 px-2 text-right">Est. Ancillary + Cargo</th>
                <th className="py-2 px-2 text-right">Total Op Revenue</th>
                <th className="py-2 px-2 text-right">Assumed Fuel Cost</th>
                <th className="py-2 px-2 text-right">Crew & Maint Cost</th>
                <th className="py-2 px-2 text-right">Disruption Cost</th>
                <th className="py-2 px-2 text-right">Est. Contribution</th>
                <th className="py-2 px-2 text-right">Direct Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
              {routes.map((r) => (
                <tr key={r.route_code} className="hover:bg-slate-50">
                  <td className="py-2.5 px-2 font-semibold text-slate-900">{r.route_code}</td>
                  <td className="py-2.5 px-2 text-right">{fmtUsd(r.observed_ticket_rev_usd)}</td>
                  <td className="py-2.5 px-2 text-right text-slate-600">
                    {fmtUsd(r.est_ancillary_rev_usd + r.est_cargo_rev_usd)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-medium text-slate-900">
                    {fmtUsd(r.total_revenue_usd)}
                  </td>
                  <td className="py-2.5 px-2 text-right text-slate-600">{fmtUsd(r.assumed_fuel_cost_usd)}</td>
                  <td className="py-2.5 px-2 text-right text-slate-600">{fmtUsd(r.assumed_crew_maint_cost_usd)}</td>
                  <td className="py-2.5 px-2 text-right text-amber-700">{fmtUsd(r.assumed_disruption_cost_usd)}</td>
                  <td className="py-2.5 px-2 text-right font-semibold text-slate-900">
                    {fmtUsd(r.estimated_contribution_usd)}
                  </td>
                  <td className={`py-2.5 px-2 text-right font-medium ${r.contribution_margin_pct >= 14 ? 'text-emerald-700' : 'text-amber-700'}`}>
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
