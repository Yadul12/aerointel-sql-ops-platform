import React, { useState, useEffect } from 'react';
import { ExecutiveKpiSummary, RoutePerformanceRow } from '../db/queries.ts';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { Save, Trash2, RotateCcw, Calculator } from 'lucide-react';

interface Props {
  kpis: ExecutiveKpiSummary;
  routes: RoutePerformanceRow[];
}

export interface ScenarioParameters {
  name: string;
  routeCode: string; // 'ALL' or specific route
  frequencyDeltaPct: number;
  capacityDeltaPct: number;
  fareDeltaPct: number;
  demandDeltaPct: number;
  fuelPricePerGallon: number;
  targetOtpPct: number;
  targetCancelRatePct: number;
  opCostDeltaPct: number;
  priceElasticity: number;
  notes: string;
}

interface SavedScenarioDoc {
  id: string;
  name: string;
  routeCode: string;
  frequencyDeltaPct: number;
  capacityDeltaPct: number;
  fareDeltaPct: number;
  demandDeltaPct: number;
  fuelPricePerGallon: number;
  targetOtpPct: number;
  targetCancelRatePct: number;
  notes: string;
}

export const ScenarioPlannerTab: React.FC<Props> = ({ kpis, routes }) => {
  const [params, setParams] = useState<ScenarioParameters>({
    name: 'Q2 Commercial & Turnaround Optimization',
    routeCode: 'ALL',
    frequencyDeltaPct: 5,
    capacityDeltaPct: 4,
    fareDeltaPct: 3,
    demandDeltaPct: 6,
    fuelPricePerGallon: 2.65,
    targetOtpPct: 84.0,
    targetCancelRatePct: 1.1,
    opCostDeltaPct: -2,
    priceElasticity: -0.85,
    notes: 'Up-gauging high-load trunk flights with +3% fare yield and 8-min turnaround buffer slack.',
  });

  const [savedScenarios, setSavedScenarios] = useState<SavedScenarioDoc[]>([]);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setSavedScenarios([]);
      return;
    }
    const q = query(collection(db, 'saved_scenarios'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: SavedScenarioDoc[] = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            name: String(data.name || ''),
            routeCode: String(data.routeCode || 'ALL'),
            frequencyDeltaPct: Number(data.frequencyDeltaPct || 0),
            capacityDeltaPct: Number(data.capacityDeltaPct || 0),
            fareDeltaPct: Number(data.fareDeltaPct || 0),
            demandDeltaPct: Number(data.demandDeltaPct || 0),
            fuelPricePerGallon: Number(data.fuelPricePerGallon || 2.78),
            targetOtpPct: Number(data.targetOtpPct || 80),
            targetCancelRatePct: Number(data.targetCancelRatePct || 1.5),
            notes: String(data.notes || ''),
          });
        });
        setSavedScenarios(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'saved_scenarios');
      }
    );
    return () => unsub();
  }, []);

  // Determine Baseline Metrics (either System-Wide or Selected Route)
  const targetRoute =
    params.routeCode !== 'ALL'
      ? routes.find((r) => r.route_code === params.routeCode)
      : null;

  const base = targetRoute
    ? {
        flights: targetRoute.flight_frequency,
        pax: targetRoute.passenger_volume,
        seats: targetRoute.available_capacity,
        lfPct: targetRoute.load_factor_pct,
        baseFare: targetRoute.avg_base_fare_usd,
        ancPerPax:
          (targetRoute.est_ancillary_rev_usd + targetRoute.est_cargo_rev_usd) /
          Math.max(1, targetRoute.passenger_volume),
        observedTicketRev: targetRoute.observed_ticket_rev_usd,
        ancCargoRev: targetRoute.est_ancillary_rev_usd + targetRoute.est_cargo_rev_usd,
        totalRev: targetRoute.total_revenue_usd,
        fuelCost: targetRoute.assumed_fuel_cost_usd,
        crewMaintCost: targetRoute.assumed_crew_maint_cost_usd,
        stationPaxCost: targetRoute.assumed_station_pax_cost_usd,
        disruptionCost: targetRoute.assumed_disruption_cost_usd,
        totalDirectCost: targetRoute.assumed_direct_cost_usd,
        contribution: targetRoute.estimated_contribution_usd,
        otpPct: targetRoute.otp_arr_pct,
        cancelPct: targetRoute.cancel_rate_pct,
      }
    : {
        flights: kpis.total_flights,
        pax: kpis.total_passengers,
        seats: kpis.total_available_seats,
        lfPct: kpis.load_factor_pct,
        baseFare: kpis.avg_base_fare_usd,
        ancPerPax:
          (kpis.estimated_ancillary_revenue_usd + kpis.estimated_cargo_revenue_usd) /
          Math.max(1, kpis.total_passengers),
        observedTicketRev: kpis.observed_ticket_revenue_usd,
        ancCargoRev: kpis.estimated_ancillary_revenue_usd + kpis.estimated_cargo_revenue_usd,
        totalRev: kpis.total_operating_revenue_usd,
        fuelCost: kpis.assumed_fuel_cost_usd,
        crewMaintCost: kpis.assumed_crew_maint_cost_usd,
        stationPaxCost: kpis.assumed_station_pax_cost_usd,
        disruptionCost: kpis.assumed_disruption_cost_usd,
        totalDirectCost: kpis.assumed_total_direct_cost_usd,
        contribution: kpis.estimated_route_contribution_usd,
        otpPct: kpis.otp_arr_pct,
        cancelPct: kpis.cancel_rate_pct,
      };

  // Explicit Deterministic Parametric Simulation Engine
  const computeScenario = (p: {
    freqDelta: number;
    capDelta: number;
    fareDelta: number;
    demandDelta: number;
    fuelPrice: number;
    otpTarget: number;
    cancelTarget: number;
    opCostDelta: number;
    elasticity: number;
  }) => {
    const freqMult = 1 + p.freqDelta / 100;
    const gaugeMult = 1 + p.capDelta / 100;
    const cancelCompletionRatio = (100 - p.cancelTarget) / Math.max(1, 100 - base.cancelPct);

    const simFlights = Math.round(base.flights * freqMult);
    const simSeats = Math.round(base.seats * freqMult * gaugeMult * cancelCompletionRatio);

    // Demand response combining exogenous shift, price elasticity, and frequency stimulation (0.35 S-curve factor)
    const priceEffect = Math.pow(1 + p.fareDelta / 100, p.elasticity);
    const freqStimulation = 1 + (p.freqDelta / 100) * 0.35;
    const uncapDemand = base.pax * (1 + p.demandDelta / 100) * priceEffect * freqStimulation;
    const simPax = Math.round(Math.min(simSeats * 0.985, Math.max(0, uncapDemand)));
    const simLfPct = simSeats > 0 ? (simPax / simSeats) * 100 : 0;

    const simBaseFare = base.baseFare * (1 + p.fareDelta / 100);
    const simTicketRev = simPax * simBaseFare;
    const simAncCargoRev = simPax * base.ancPerPax;
    const simTotalRev = simTicketRev + simAncCargoRev;

    // Direct Operating Costs
    // Gauge change increases fuel burn sub-linearly (0.45 weight elasticity)
    const fuelMult =
      freqMult * (1 + (p.capDelta / 100) * 0.45) * (p.fuelPrice / 2.78) * cancelCompletionRatio;
    const simFuelCost = base.fuelCost * fuelMult;

    const opMult = 1 + p.opCostDelta / 100;
    const simCrewMaintCost = base.crewMaintCost * freqMult * (1 + (p.capDelta / 100) * 0.25) * opMult;
    const simStationPaxCost =
      base.stationPaxCost * (0.55 * freqMult + 0.45 * (simPax / Math.max(1, base.pax))) * opMult;

    // Disruption cost scales with non-OTP rate (100 - OTP) and cancellation rate
    const baseInopRate = Math.max(1, 100 - base.otpPct);
    const simInopRate = Math.max(0.5, 100 - p.otpTarget);
    const delayRatio = simInopRate / baseInopRate;
    const cancelRatio = p.cancelTarget / Math.max(0.2, base.cancelPct);
    const simDisruptionCost = base.disruptionCost * freqMult * (0.65 * delayRatio + 0.35 * cancelRatio);

    const simTotalCost = simFuelCost + simCrewMaintCost + simStationPaxCost + simDisruptionCost;
    const simContribution = simTotalRev - simTotalCost;
    const simMarginPct = simTotalRev > 0 ? (simContribution / simTotalRev) * 100 : 0;

    return {
      flights: simFlights,
      seats: simSeats,
      pax: simPax,
      lfPct: simLfPct,
      baseFare: simBaseFare,
      totalRev: simTotalRev,
      fuelCost: simFuelCost,
      totalCost: simTotalCost,
      disruptionCost: simDisruptionCost,
      contribution: simContribution,
      marginPct: simMarginPct,
      otpPct: p.otpTarget,
      cancelPct: p.cancelTarget,
    };
  };

  const userSim = computeScenario({
    freqDelta: params.frequencyDeltaPct,
    capDelta: params.capacityDeltaPct,
    fareDelta: params.fareDeltaPct,
    demandDelta: params.demandDeltaPct,
    fuelPrice: params.fuelPricePerGallon,
    otpTarget: params.targetOtpPct,
    cancelTarget: params.targetCancelRatePct,
    opCostDelta: params.opCostDeltaPct,
    elasticity: params.priceElasticity,
  });

  const optimisticSim = computeScenario({
    freqDelta: 8,
    capDelta: 6,
    fareDelta: 5,
    demandDelta: 10,
    fuelPrice: 2.45,
    otpTarget: Math.min(92, base.otpPct + 6),
    cancelTarget: Math.max(0.5, base.cancelPct * 0.6),
    opCostDelta: -4,
    elasticity: -0.75,
  });

  const downsideSim = computeScenario({
    freqDelta: -5,
    capDelta: 0,
    fareDelta: -6,
    demandDelta: -12,
    fuelPrice: 3.45,
    otpTarget: Math.max(64, base.otpPct - 7),
    cancelTarget: Math.min(6.0, base.cancelPct * 1.65),
    opCostDelta: 5,
    elasticity: -1.05,
  });

  const fmtUsd = (n: number) =>
    n >= 1_000_000 || n <= -1_000_000
      ? `$${(n / 1_000_000).toFixed(2)}M`
      : `$${Math.round(n).toLocaleString()}`;

  const handleSaveScenario = async () => {
    const user = auth.currentUser;
    if (!user) {
      setSaveMessage('Please sign in with Google in the top bar to save scenarios to Firestore.');
      return;
    }
    const cleanId = `scen_${Date.now()}`;
    try {
      await setDoc(doc(db, 'saved_scenarios', cleanId), {
        ownerId: user.uid,
        name: params.name.trim().slice(0, 120) || 'Custom Scenario',
        routeCode: params.routeCode,
        frequencyDeltaPct: Number(params.frequencyDeltaPct),
        capacityDeltaPct: Number(params.capacityDeltaPct),
        fareDeltaPct: Number(params.fareDeltaPct),
        demandDeltaPct: Number(params.demandDeltaPct),
        fuelPricePerGallon: Number(params.fuelPricePerGallon),
        targetOtpPct: Number(params.targetOtpPct),
        targetCancelRatePct: Number(params.targetCancelRatePct),
        notes: params.notes.trim().slice(0, 500),
        createdAt: serverTimestamp(),
      });
      setSaveMessage('Scenario persisted to Firestore.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `saved_scenarios/${cleanId}`);
    }
  };

  const handleDeleteScenario = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'saved_scenarios', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `saved_scenarios/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Governance Notice */}
      <div className="bg-white border border-slate-200 rounded-md p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
            <Calculator className="w-4 h-4 text-blue-900" />
            <span>Parametric Commercial & Operational Scenario Engine (Not Unconditional Forecasts)</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed max-w-4xl">
            Scenarios evaluate what-if sensitivity using explicit elasticity and block-hour cost equations applied to the selected baseline. In accordance with airline commercial governance, scenario outputs are conditional sensitivity simulations—never represented as unconditional statistical point forecasts.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            value={params.routeCode}
            onChange={(e) => setParams({ ...params, routeCode: e.target.value })}
            className="px-3 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white text-slate-900"
          >
            <option value="ALL">Scope: Entire Filtered Network</option>
            {routes.map((r) => (
              <option key={r.route_code} value={r.route_code}>
                Route: {r.route_code} ({r.market_type})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Split: 8 Interactive Levers + 4-Column Scenario Comparison Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 5 Cols: Scenario Parameter Controls */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-md p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Commercial & Operational Levers
              </h2>
              <button
                onClick={() =>
                  setParams({
                    ...params,
                    frequencyDeltaPct: 0,
                    capacityDeltaPct: 0,
                    fareDeltaPct: 0,
                    demandDeltaPct: 0,
                    fuelPricePerGallon: 2.78,
                    targetOtpPct: Number(base.otpPct.toFixed(1)),
                    targetCancelRatePct: Number(base.cancelPct.toFixed(2)),
                    opCostDeltaPct: 0,
                  })
                }
                className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
              >
                <RotateCcw className="w-3 h-3" /> Reset to Baseline
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-700 font-medium">1. Flight Frequency Change (%)</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {params.frequencyDeltaPct >= 0 ? `+${params.frequencyDeltaPct}%` : `${params.frequencyDeltaPct}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-30}
                  max={40}
                  step={1}
                  value={params.frequencyDeltaPct}
                  onChange={(e) => setParams({ ...params, frequencyDeltaPct: Number(e.target.value) })}
                  className="w-full accent-slate-900"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-700 font-medium">2. Seat Gauge / Capacity per Flight (%)</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {params.capacityDeltaPct >= 0 ? `+${params.capacityDeltaPct}%` : `${params.capacityDeltaPct}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-25}
                  max={35}
                  step={1}
                  value={params.capacityDeltaPct}
                  onChange={(e) => setParams({ ...params, capacityDeltaPct: Number(e.target.value) })}
                  className="w-full accent-slate-900"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-700 font-medium">3. Average Ticket Base Fare (%)</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {params.fareDeltaPct >= 0 ? `+${params.fareDeltaPct}%` : `${params.fareDeltaPct}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-25}
                  max={30}
                  step={1}
                  value={params.fareDeltaPct}
                  onChange={(e) => setParams({ ...params, fareDeltaPct: Number(e.target.value) })}
                  className="w-full accent-slate-900"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-700 font-medium">4. Exogenous Passenger Demand Shift (%)</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {params.demandDeltaPct >= 0 ? `+${params.demandDeltaPct}%` : `${params.demandDeltaPct}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-30}
                  max={40}
                  step={1}
                  value={params.demandDeltaPct}
                  onChange={(e) => setParams({ ...params, demandDeltaPct: Number(e.target.value) })}
                  className="w-full accent-slate-900"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-700 font-medium">5. Jet-A Fuel Price Assumption ($/gal)</span>
                  <span className="font-mono font-semibold text-slate-900">
                    ${params.fuelPricePerGallon.toFixed(2)} / gal
                  </span>
                </div>
                <input
                  type="range"
                  min={1.75}
                  max={4.50}
                  step={0.05}
                  value={params.fuelPricePerGallon}
                  onChange={(e) => setParams({ ...params, fuelPricePerGallon: Number(e.target.value) })}
                  className="w-full accent-slate-900"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-700 font-medium">6. Target On-Time Arrival Rate (A14 %)</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {params.targetOtpPct.toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={95}
                  step={0.5}
                  value={params.targetOtpPct}
                  onChange={(e) => setParams({ ...params, targetOtpPct: Number(e.target.value) })}
                  className="w-full accent-slate-900"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-700 font-medium">7. Target Cancellation Rate (%)</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {params.targetCancelRatePct.toFixed(2)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={6.0}
                  step={0.1}
                  value={params.targetCancelRatePct}
                  onChange={(e) => setParams({ ...params, targetCancelRatePct: Number(e.target.value) })}
                  className="w-full accent-slate-900"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-700 font-medium">8. Non-Fuel Crew/Maint/Station Cost (%)</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {params.opCostDeltaPct >= 0 ? `+${params.opCostDeltaPct}%` : `${params.opCostDeltaPct}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-15}
                  max={20}
                  step={1}
                  value={params.opCostDeltaPct}
                  onChange={(e) => setParams({ ...params, opCostDeltaPct: Number(e.target.value) })}
                  className="w-full accent-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Save Scenario to Firestore */}
          <div className="mt-5 pt-4 border-t border-slate-200 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={params.name}
                onChange={(e) => setParams({ ...params, name: e.target.value })}
                placeholder="Scenario Title..."
                className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded"
              />
              <button
                onClick={handleSaveScenario}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" /> Save Scenario
              </button>
            </div>
            {saveMessage && <div className="text-[11px] text-blue-900">{saveMessage}</div>}
          </div>
        </div>

        {/* Right 7 Cols: Side-by-Side Scenario Comparison Matrix (Baseline vs Custom vs Optimistic vs Downside) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-md p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-1">
              Multi-Scenario Financial & Operational Comparison Matrix
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Compares Observed Baseline against your Custom Simulation, Optimistic Upside, and Downside Stress Case
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-2">Output Metric</th>
                    <th className="py-2.5 px-2 text-right">1. Observed Baseline</th>
                    <th className="py-2.5 px-2 text-right bg-blue-50/70 text-blue-950">
                      2. Custom Scenario
                    </th>
                    <th className="py-2.5 px-2 text-right text-emerald-800">3. Optimistic Case</th>
                    <th className="py-2.5 px-2 text-right text-amber-800">4. Downside Stress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                  <tr>
                    <td className="py-2.5 px-2 font-sans font-medium text-slate-900">Scheduled Flights</td>
                    <td className="py-2.5 px-2 text-right">{base.flights.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-right bg-blue-50/40 font-semibold">{userSim.flights.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-right">{optimisticSim.flights.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-right">{downsideSim.flights.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-2 font-sans font-medium text-slate-900">Available Seat Capacity</td>
                    <td className="py-2.5 px-2 text-right">{base.seats.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-right bg-blue-50/40 font-semibold">{userSim.seats.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-right">{optimisticSim.seats.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-right">{downsideSim.seats.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-2 font-sans font-medium text-slate-900">Est. Passenger Volume</td>
                    <td className="py-2.5 px-2 text-right">{base.pax.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-right bg-blue-50/40 font-semibold">{userSim.pax.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-right">{optimisticSim.pax.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-right">{downsideSim.pax.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-2 font-sans font-medium text-slate-900">Achieved Load Factor</td>
                    <td className="py-2.5 px-2 text-right">{base.lfPct.toFixed(1)}%</td>
                    <td className="py-2.5 px-2 text-right bg-blue-50/40 font-semibold">{userSim.lfPct.toFixed(1)}%</td>
                    <td className="py-2.5 px-2 text-right">{optimisticSim.lfPct.toFixed(1)}%</td>
                    <td className="py-2.5 px-2 text-right">{downsideSim.lfPct.toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-2 font-sans font-medium text-slate-900">Average Base Fare</td>
                    <td className="py-2.5 px-2 text-right">${base.baseFare.toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right bg-blue-50/40 font-semibold">${userSim.baseFare.toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right">${optimisticSim.baseFare.toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right">${downsideSim.baseFare.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-2 font-sans font-medium text-slate-900">Total Operating Revenue</td>
                    <td className="py-2.5 px-2 text-right">{fmtUsd(base.totalRev)}</td>
                    <td className="py-2.5 px-2 text-right bg-blue-50/40 font-semibold">{fmtUsd(userSim.totalRev)}</td>
                    <td className="py-2.5 px-2 text-right">{fmtUsd(optimisticSim.totalRev)}</td>
                    <td className="py-2.5 px-2 text-right">{fmtUsd(downsideSim.totalRev)}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-2 font-sans font-medium text-slate-900">Assumed Fuel Cost</td>
                    <td className="py-2.5 px-2 text-right">{fmtUsd(base.fuelCost)}</td>
                    <td className="py-2.5 px-2 text-right bg-blue-50/40">{fmtUsd(userSim.fuelCost)}</td>
                    <td className="py-2.5 px-2 text-right">{fmtUsd(optimisticSim.fuelCost)}</td>
                    <td className="py-2.5 px-2 text-right">{fmtUsd(downsideSim.fuelCost)}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-2 font-sans font-medium text-slate-900">Disruption Penalty Cost</td>
                    <td className="py-2.5 px-2 text-right">{fmtUsd(base.disruptionCost)}</td>
                    <td className="py-2.5 px-2 text-right bg-blue-50/40">{fmtUsd(userSim.disruptionCost)}</td>
                    <td className="py-2.5 px-2 text-right">{fmtUsd(optimisticSim.disruptionCost)}</td>
                    <td className="py-2.5 px-2 text-right">{fmtUsd(downsideSim.disruptionCost)}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-2 font-sans font-medium text-slate-900">Total Assumed Direct Costs</td>
                    <td className="py-2.5 px-2 text-right">{fmtUsd(base.totalDirectCost)}</td>
                    <td className="py-2.5 px-2 text-right bg-blue-50/40 font-semibold">{fmtUsd(userSim.totalCost)}</td>
                    <td className="py-2.5 px-2 text-right">{fmtUsd(optimisticSim.totalCost)}</td>
                    <td className="py-2.5 px-2 text-right">{fmtUsd(downsideSim.totalCost)}</td>
                  </tr>
                  <tr className="border-t-2 border-slate-300 font-bold">
                    <td className="py-3 px-2 font-sans text-slate-900">Estimated Route Contribution</td>
                    <td className="py-3 px-2 text-right">{fmtUsd(base.contribution)}</td>
                    <td className={`py-3 px-2 text-right bg-blue-50/70 ${userSim.contribution >= 0 ? 'text-blue-950' : 'text-red-700'}`}>
                      {fmtUsd(userSim.contribution)}
                    </td>
                    <td className="py-3 px-2 text-right text-emerald-800">{fmtUsd(optimisticSim.contribution)}</td>
                    <td className={`py-3 px-2 text-right ${downsideSim.contribution >= 0 ? 'text-amber-800' : 'text-red-700'}`}>
                      {fmtUsd(downsideSim.contribution)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-2 font-sans text-slate-600">Variance vs Baseline ($)</td>
                    <td className="py-2 px-2 text-right text-slate-400">—</td>
                    <td className={`py-2 px-2 text-right bg-blue-50/40 font-semibold ${userSim.contribution - base.contribution >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {userSim.contribution - base.contribution >= 0 ? '+' : ''}
                      {fmtUsd(userSim.contribution - base.contribution)}
                    </td>
                    <td className="py-2 px-2 text-right text-emerald-700">
                      +{fmtUsd(optimisticSim.contribution - base.contribution)}
                    </td>
                    <td className="py-2 px-2 text-right text-red-700">
                      {fmtUsd(downsideSim.contribution - base.contribution)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Explicit Mathematical Equations Panel */}
          <div className="mt-4 pt-3 border-t border-slate-200 text-[11px] text-slate-600 space-y-1">
            <div className="font-semibold text-slate-900">Explicit Parametric Formulas & Elasticity Assumptions:</div>
            <div className="font-mono">
              • Pax_sim = min(0.985 × Seats_sim, Pax_base × (1 + ΔDemand) × (1 + ΔFare)^({params.priceElasticity}) × (1 + 0.35 × ΔFreq))
            </div>
            <div className="font-mono">
              • Fuel_sim = Fuel_base × (1 + ΔFreq) × (1 + 0.45 × ΔGauge) × (FuelPrice / $2.78) × CompletionRatio
            </div>
            <div className="font-mono">
              • Disruption_sim = Disruption_base × (1 + ΔFreq) × [0.65 × ((100 - OTP_sim)/(100 - OTP_base)) + 0.35 × (Canc_sim/Canc_base)]
            </div>
          </div>
        </div>
      </div>

      {/* Saved Firestore Scenarios Table */}
      {savedScenarios.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-md p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Saved Analyst Scenarios in Firestore ({savedScenarios.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <th className="py-2 px-2">Scenario Name</th>
                  <th className="py-2 px-2">Target Scope</th>
                  <th className="py-2 px-2 text-right">Freq Δ</th>
                  <th className="py-2 px-2 text-right">Cap Δ</th>
                  <th className="py-2 px-2 text-right">Fare Δ</th>
                  <th className="py-2 px-2 text-right">Fuel $/gal</th>
                  <th className="py-2 px-2 text-right">Target OTP</th>
                  <th className="py-2 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                {savedScenarios.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-2 px-2 font-sans font-medium text-slate-900">{s.name}</td>
                    <td className="py-2 px-2">{s.routeCode}</td>
                    <td className="py-2 px-2 text-right">{s.frequencyDeltaPct}%</td>
                    <td className="py-2 px-2 text-right">{s.capacityDeltaPct}%</td>
                    <td className="py-2 px-2 text-right">{s.fareDeltaPct}%</td>
                    <td className="py-2 px-2 text-right">${s.fuelPricePerGallon.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right">{s.targetOtpPct.toFixed(1)}%</td>
                    <td className="py-2 px-2 text-right space-x-2">
                      <button
                        onClick={() =>
                          setParams({
                            ...params,
                            name: s.name,
                            routeCode: s.routeCode,
                            frequencyDeltaPct: s.frequencyDeltaPct,
                            capacityDeltaPct: s.capacityDeltaPct,
                            fareDeltaPct: s.fareDeltaPct,
                            demandDeltaPct: s.demandDeltaPct,
                            fuelPricePerGallon: s.fuelPricePerGallon,
                            targetOtpPct: s.targetOtpPct,
                            targetCancelRatePct: s.targetCancelRatePct,
                            notes: s.notes,
                          })
                        }
                        className="text-xs font-sans text-blue-900 hover:underline"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDeleteScenario(s.id)}
                        className="text-slate-400 hover:text-red-700 inline-flex items-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
