import React, { useState, useEffect } from 'react';
import {
  runPredictiveModelingPipeline,
  PredictiveSuiteOutput,
  CustomFlightInput,
} from '../analytics/predictiveModels.ts';
import { Play, ShieldCheck, Sliders } from 'lucide-react';

export const PredictiveAnalyticsTab: React.FC = () => {
  const [splitDate, setSplitDate] = useState('2026-03-01');
  const [threshold, setThreshold] = useState(0.32);
  const [suite, setSuite] = useState<PredictiveSuiteOutput | null>(null);
  const [selectedModelId, setSelectedModelId] = useState('xgboost');
  const [loading, setLoading] = useState(true);

  // Interactive Pre-Departure Risk Scorer State
  const [customInput, setCustomInput] = useState<CustomFlightInput>({
    schedDepHour: 18,
    turnaroundBufferMins: 38,
    originCongestionIndex: 8.7,
    destCongestionIndex: 7.9,
    originWeatherSeverity: 5.5,
    destWeatherSeverity: 2.0,
    slotControlled: true,
    isPeakTravel: true,
    histRouteDisruptionRate: 0.24,
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    runPredictiveModelingPipeline(splitDate, threshold).then((res) => {
      if (active) {
        setSuite(res);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [splitDate, threshold]);

  if (loading || !suite) {
    return (
      <div className="bg-white border border-slate-200 rounded-md p-10 text-center text-xs text-slate-600">
        Executing leakage-safe time-based split & training 5 predictive models (Logistic Regression, CART Decision Tree, Random Forest, Gradient Boosting, XGBoost) on PostgreSQL flight records...
      </div>
    );
  }

  const activeModel =
    suite.models.find((m) => m.modelId === selectedModelId) || suite.models[0];
  const customPredictions = suite.predictCustomFlight(customInput);

  return (
    <div className="space-y-6">
      {/* Leakage-Safe Architecture & Split Controls */}
      <div className="bg-white border border-slate-200 rounded-md p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-emerald-800 font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Zero-Leakage Temporal Split & Live Evaluation Verification</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed max-w-4xl">
            Models are trained in-browser strictly on pre-cutoff flights (<strong className="text-slate-900">Train N = {suite.trainSize.toLocaleString()}</strong>, prior to {suite.splitDate}) and evaluated out-of-time on post-cutoff flights (<strong className="text-slate-900">Test N = {suite.testSize.toLocaleString()}</strong>, {suite.splitDate} – 2026-03-31). Historical route disruption priors and z-score scalers are fit exclusively on the training window. Only features known at T-2h prior to departure are included—post-departure taxi times and actual departure delays are excluded to prevent target leakage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
              Temporal Split Cutoff Date
            </label>
            <select
              value={splitDate}
              onChange={(e) => setSplitDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono"
            >
              <option value="2026-02-15">2026-02-15 (50% / 50%)</option>
              <option value="2026-03-01">2026-03-01 (66% / 34%)</option>
              <option value="2026-03-10">2026-03-10 (76% / 24%)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
              Classification Threshold ({threshold.toFixed(2)})
            </label>
            <input
              type="range"
              min={0.15}
              max={0.65}
              step={0.02}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-28 accent-slate-900"
            />
          </div>
        </div>
      </div>

      {/* 5-Model Out-of-Time Comparison Matrix */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Out-of-Time Model Comparison Matrix (Test Set N = {suite.testSize.toLocaleString()} Flights)
            </h2>
            <p className="text-xs text-slate-500">
              Click any model row to inspect its Confusion Matrix, ROC Curve, Precision-Recall Curve, Calibration Plot, and Feature Importances
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">
            Test Set Base Disruption Rate: {suite.models[0].positiveRateTest}%
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-2 px-2">Model Architecture</th>
                <th className="py-2 px-2">Hyperparameters</th>
                <th className="py-2 px-2 text-right">ROC-AUC</th>
                <th className="py-2 px-2 text-right">PR-AUC</th>
                <th className="py-2 px-2 text-right">Precision</th>
                <th className="py-2 px-2 text-right">Recall</th>
                <th className="py-2 px-2 text-right">F1-Score</th>
                <th className="py-2 px-2 text-right">Brier Score</th>
                <th className="py-2 px-2 text-right">Train Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
              {suite.models.map((m) => {
                const isSelected = m.modelId === activeModel.modelId;
                return (
                  <tr
                    key={m.modelId}
                    onClick={() => setSelectedModelId(m.modelId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 px-2 font-sans font-semibold text-slate-900">
                      {m.modelName}
                    </td>
                    <td className="py-2.5 px-2 text-[11px] text-slate-500">{m.hyperparameters}</td>
                    <td className="py-2.5 px-2 text-right font-bold text-blue-950">
                      {m.rocAuc.toFixed(4)}
                    </td>
                    <td className="py-2.5 px-2 text-right">{m.prAuc.toFixed(4)}</td>
                    <td className="py-2.5 px-2 text-right">{m.precision.toFixed(1)}%</td>
                    <td className="py-2.5 px-2 text-right">{m.recall.toFixed(1)}%</td>
                    <td className="py-2.5 px-2 text-right font-semibold text-slate-900">
                      {m.f1Score.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-2 text-right">{m.brierScore.toFixed(4)}</td>
                    <td className="py-2.5 px-2 text-right text-slate-500">{m.trainingDurationMs}ms</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Diagnostic Curves & Confusion Matrix for Selected Model */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Col 1-4: Confusion Matrix & Feature Importances */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-md p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              Confusion Matrix ({activeModel.modelName})
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Evaluated at probability threshold τ = {activeModel.thresholdUsed.toFixed(2)}
            </p>

            <div className="grid grid-cols-2 gap-2 text-center font-mono text-xs mb-5">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <div className="text-[10px] font-sans text-slate-500">True Negative (On-Time)</div>
                <div className="text-lg font-bold text-slate-900 mt-0.5">
                  {activeModel.confusionMatrix.tn}
                </div>
              </div>
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded">
                <div className="text-[10px] font-sans text-amber-800">False Positive (False Alarm)</div>
                <div className="text-lg font-bold text-amber-900 mt-0.5">
                  {activeModel.confusionMatrix.fp}
                </div>
              </div>
              <div className="p-3 bg-red-50/60 border border-red-200 rounded">
                <div className="text-[10px] font-sans text-red-800">False Negative (Missed Delay)</div>
                <div className="text-lg font-bold text-red-900 mt-0.5">
                  {activeModel.confusionMatrix.fn}
                </div>
              </div>
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded">
                <div className="text-[10px] font-sans text-blue-900">True Positive (Caught Disruption)</div>
                <div className="text-lg font-bold text-blue-950 mt-0.5">
                  {activeModel.confusionMatrix.tp}
                </div>
              </div>
            </div>

            <h4 className="text-xs font-semibold text-slate-900 mb-2">
              Pre-Departure Feature Importance (%)
            </h4>
            <div className="space-y-2">
              {activeModel.featureImportances.slice(0, 6).map((fi) => (
                <div key={fi.feature} className="text-xs">
                  <div className="flex justify-between mb-0.5">
                    <span className="text-slate-700 truncate">{fi.feature}</span>
                    <span className="font-mono font-semibold text-slate-900">{fi.importance.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-slate-900"
                      style={{ width: `${Math.min(100, fi.importance * 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Col 5-8: ROC Curve & Precision-Recall Curve */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-md p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              ROC Curve & Precision-Recall Curve
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              ROC-AUC: <strong className="font-mono text-slate-900">{activeModel.rocAuc.toFixed(4)}</strong> · PR-AUC: <strong className="font-mono text-slate-900">{activeModel.prAuc.toFixed(4)}</strong>
            </p>

            <svg viewBox="0 0 260 220" className="w-full h-56 bg-slate-50 border border-slate-200 rounded">
              {/* Diagonal random baseline */}
              <line x1={32} y1={190} x2={235} y2={20} stroke="#cbd5e1" strokeDasharray="3 3" />

              {/* ROC Path */}
              <path
                d={activeModel.rocCurve
                  .map((pt, i) => {
                    const x = 32 + pt.x * 203;
                    const y = 190 - pt.y * 170;
                    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="#0f172a"
                strokeWidth="2.2"
              />

              {/* PR Path */}
              <path
                d={activeModel.prCurve
                  .map((pt, i) => {
                    const x = 32 + pt.x * 203;
                    const y = 190 - pt.y * 170;
                    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="#1d4ed8"
                strokeWidth="1.8"
                strokeDasharray="4 2"
              />

              <text x={135} y={212} textAnchor="middle" className="text-[9px] font-mono fill-slate-600">
                FPR (ROC) / Recall (PR) →
              </text>
              <text
                x={12}
                y={105}
                textAnchor="middle"
                transform="rotate(-90 12 105)"
                className="text-[9px] font-mono fill-slate-600"
              >
                TPR / Precision →
              </text>
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-600 pt-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-slate-900 inline-block"></span>
              <span>ROC Curve (TPR vs FPR)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-blue-700 inline-block"></span>
              <span>PR Curve (Precision vs Recall)</span>
            </span>
          </div>
        </div>

        {/* Col 9-12: Reliability / Calibration Plot */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-md p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              Probability Calibration (Reliability Curve)
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Brier Score: <strong className="font-mono text-slate-900">{activeModel.brierScore.toFixed(4)}</strong> (Predicted vs Observed Empirical Rate)
            </p>

            <svg viewBox="0 0 260 220" className="w-full h-56 bg-slate-50 border border-slate-200 rounded">
              {/* Perfect calibration diagonal */}
              <line x1={32} y1={190} x2={235} y2={20} stroke="#94a3b8" strokeDasharray="3 3" />

              <path
                d={activeModel.calibrationCurve
                  .map((pt, i) => {
                    const x = 32 + pt.x * 203;
                    const y = 190 - pt.y * 170;
                    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="#0f172a"
                strokeWidth="2"
              />

              {activeModel.calibrationCurve.map((pt, idx) => {
                const x = 32 + pt.x * 203;
                const y = 190 - pt.y * 170;
                return (
                  <g key={idx}>
                    <circle cx={x} cy={y} r="3.5" fill="#1e3a8a" />
                    <text x={x + 5} y={y - 4} className="text-[8px] font-mono fill-slate-600">
                      n={pt.count}
                    </text>
                  </g>
                );
              })}

              <text x={135} y={212} textAnchor="middle" className="text-[9px] font-mono fill-slate-600">
                Mean Predicted Disruption Probability →
              </text>
              <text
                x={12}
                y={105}
                textAnchor="middle"
                transform="rotate(-90 12 105)"
                className="text-[9px] font-mono fill-slate-600"
              >
                Observed Disruption Frequency →
              </text>
            </svg>
          </div>
          <div className="text-[11px] text-slate-500 pt-2">
            Points hugging the 45° diagonal confirm well-calibrated operational risk probabilities.
          </div>
        </div>
      </div>

      {/* Live Pre-Departure Flight Disruption Risk Simulator */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex items-center gap-2 mb-1">
          <Sliders className="w-4 h-4 text-slate-900" />
          <h3 className="text-sm font-semibold text-slate-900">
            Interactive Pre-Departure Flight Disruption Decision-Support Scorer
          </h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Adjust pre-departure flight dispatch parameters known at T-2h to compute real-time disruption probabilities across all 5 trained classifiers
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-600 mb-1">
                Scheduled Dep Hour ({customInput.schedDepHour}:00)
              </label>
              <input
                type="range"
                min={6}
                max={22}
                step={1}
                value={customInput.schedDepHour}
                onChange={(e) =>
                  setCustomInput({ ...customInput, schedDepHour: Number(e.target.value) })
                }
                className="w-full accent-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-600 mb-1">
                Turnaround Buffer ({customInput.turnaroundBufferMins} min)
              </label>
              <input
                type="range"
                min={25}
                max={75}
                step={1}
                value={customInput.turnaroundBufferMins}
                onChange={(e) =>
                  setCustomInput({ ...customInput, turnaroundBufferMins: Number(e.target.value) })
                }
                className="w-full accent-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-600 mb-1">
                Origin Weather Severity ({customInput.originWeatherSeverity}/10)
              </label>
              <input
                type="range"
                min={0.5}
                max={9.5}
                step={0.5}
                value={customInput.originWeatherSeverity}
                onChange={(e) =>
                  setCustomInput({ ...customInput, originWeatherSeverity: Number(e.target.value) })
                }
                className="w-full accent-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-600 mb-1">
                Origin Hub Congestion ({customInput.originCongestionIndex}/10)
              </label>
              <input
                type="range"
                min={6.5}
                max={9.5}
                step={0.1}
                value={customInput.originCongestionIndex}
                onChange={(e) =>
                  setCustomInput({ ...customInput, originCongestionIndex: Number(e.target.value) })
                }
                className="w-full accent-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-600 mb-1">
                Dest Weather Severity ({customInput.destWeatherSeverity}/10)
              </label>
              <input
                type="range"
                min={0.5}
                max={9.5}
                step={0.5}
                value={customInput.destWeatherSeverity}
                onChange={(e) =>
                  setCustomInput({ ...customInput, destWeatherSeverity: Number(e.target.value) })
                }
                className="w-full accent-slate-900"
              />
            </div>

            <div className="flex items-center gap-4 pt-4">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customInput.slotControlled}
                  onChange={(e) =>
                    setCustomInput({ ...customInput, slotControlled: e.target.checked })
                  }
                />
                <span>Slot-Controlled</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customInput.isPeakTravel}
                  onChange={(e) =>
                    setCustomInput({ ...customInput, isPeakTravel: e.target.checked })
                  }
                />
                <span>Peak Day</span>
              </label>
            </div>
          </div>

          <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded p-4">
            <div className="text-xs font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5 text-blue-900" />
              <span>Live Model Ensemble Predictions (Disruption Probability)</span>
            </div>
            <div className="space-y-2 text-xs font-mono tabular-nums">
              {customPredictions.map((cp) => (
                <div key={cp.modelName} className="flex items-center justify-between border-b border-slate-200/70 pb-1.5 last:border-b-0">
                  <span className="font-sans text-slate-700">{cp.modelName}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900">{cp.probability.toFixed(1)}%</span>
                    <span
                      className={`text-[11px] font-sans font-medium ${
                        cp.riskTier === 'Severe Risk'
                          ? 'text-red-700'
                          : cp.riskTier === 'Elevated Risk'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                      }`}
                    >
                      {cp.riskTier}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Out-of-Time Test Set Individual Flight Prediction Audit Log */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Out-of-Time Test Set Flight Prediction Audit Log (Sample N = {suite.samplePredictions.length} Post-{suite.splitDate} Flights)
            </h3>
            <p className="text-xs text-slate-500">
              Verifies individual flight-level pre-departure feature vectors against Logistic Regression and XGBoost predicted disruption probabilities and actual outcomes
            </p>
          </div>
        </div>

        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50 sticky top-0">
                <th className="py-2 px-2">Flight Date</th>
                <th className="py-2 px-2">Flight #</th>
                <th className="py-2 px-2">Route</th>
                <th className="py-2 px-2 text-right">Dep Hour</th>
                <th className="py-2 px-2 text-right">Turnaround Buf</th>
                <th className="py-2 px-2 text-right">Origin Weather</th>
                <th className="py-2 px-2 text-right">Logistic Prob</th>
                <th className="py-2 px-2 text-right">XGBoost Prob</th>
                <th className="py-2 px-2 text-right">Decision (τ={threshold.toFixed(2)})</th>
                <th className="py-2 px-2 text-right">Actual Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
              {suite.samplePredictions.map((sp) => {
                const predFlag = sp.xgbProb / 100 >= threshold;
                const actualFlag = sp.actualDisrupted === 1;
                return (
                  <tr key={sp.scheduleId} className="hover:bg-slate-50">
                    <td className="py-2 px-2">{sp.flightDate}</td>
                    <td className="py-2 px-2 font-bold text-slate-900">{sp.flightNumber}</td>
                    <td className="py-2 px-2">{sp.routeCode}</td>
                    <td className="py-2 px-2 text-right">{String(sp.schedDepHour).padStart(2, '0')}:00</td>
                    <td className="py-2 px-2 text-right">{sp.turnaroundBufferMins} min</td>
                    <td className="py-2 px-2 text-right">{sp.originWeatherSeverity.toFixed(1)} / 10</td>
                    <td className="py-2 px-2 text-right">{sp.logisticProb.toFixed(1)}%</td>
                    <td className="py-2 px-2 text-right font-semibold text-blue-950">{sp.xgbProb.toFixed(1)}%</td>
                    <td className={`py-2 px-2 text-right font-sans font-medium ${predFlag ? 'text-amber-800' : 'text-slate-600'}`}>
                      {predFlag ? 'Flagged High-Risk' : 'Nominal Dispatch'}
                    </td>
                    <td className={`py-2 px-2 text-right font-sans font-semibold ${actualFlag ? 'text-red-700' : 'text-emerald-700'}`}>
                      {actualFlag ? 'Disrupted (A14/Canc)' : 'On-Time Arrival'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
