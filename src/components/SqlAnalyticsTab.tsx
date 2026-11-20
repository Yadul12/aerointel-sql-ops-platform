import React, { useState, useEffect } from 'react';
import { CURATED_SQL_QUERIES, CuratedSqlQuery } from '../db/queries.ts';
import { getPgDb } from '../db/pgEngine.ts';
import {
  exportToCsv,
  SAMPLE_CSV_TEMPLATE,
  importCsvFlightsToPostgres,
} from '../utils/exportUtils.ts';
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
import { Play, Database, Download, Upload, Save, Trash2 } from 'lucide-react';

interface Props {
  onDataImported: () => void;
}

const RELATIONAL_SCHEMA_CATALOG = [
  { table: '1. airlines', pk: 'airline_code', cols: 'airline_name, carrier_group, hub_airports, fleet_size' },
  { table: '2. airports', pk: 'airport_code', cols: 'airport_name, city, state_code, latitude, longitude, hub_tier, congestion_index' },
  { table: '3. routes', pk: 'route_code', cols: 'origin_airport (FK), dest_airport (FK), distance_miles, typical_block_mins, market_type, slot_controlled' },
  { table: '4. scheduled_flights', pk: 'schedule_id', cols: 'flight_number, airline_code (FK), route_code (FK), origin_airport (FK), dest_airport (FK), aircraft_code (FK), flight_date (FK), sched_dep_hour, turnaround_buffer_mins, data_source_type' },
  { table: '5. flight_operations', pk: 'operation_id', cols: 'schedule_id (FK), actual_dep_delay_mins, actual_arr_delay_mins, actual_block_mins, taxi_out_mins, taxi_in_mins, is_cancelled, is_diverted, is_on_time_dep, is_on_time_arr, is_delayed_15' },
  { table: '6. flight_delays', pk: 'delay_id', cols: 'schedule_id (FK), carrier_delay_mins, weather_delay_mins, nas_delay_mins, security_delay_mins, late_aircraft_delay_mins, primary_delay_cause' },
  { table: '7. cancellations', pk: 'cancellation_id', cols: 'schedule_id (FK), cancellation_code, cancellation_reason, unrecovered_pax_ratio' },
  { table: '8. aircraft_capacity', pk: 'aircraft_code', cols: 'manufacturer, model_name, total_seats, first_business_seats, economy_seats, cargo_payload_kg' },
  { table: '9. passenger_traffic', pk: 'traffic_id', cols: 'schedule_id (FK), available_seats, revenue_passengers, non_rev_passengers, load_factor, connecting_pax_share, cargo_tons' },
  { table: '10. ticket_fares', pk: 'fare_id', cols: 'schedule_id (FK), avg_base_fare_usd, ancillary_rev_per_pax_usd, total_fare_per_pax_usd, yield_per_rpm_cents, db1b_fare_basis' },
  { table: '11. revenue_records', pk: 'revenue_id', cols: 'schedule_id (FK), observed_ticket_revenue_usd, estimated_ancillary_revenue_usd, estimated_cargo_revenue_usd, total_operating_revenue_usd, assumed_fuel_cost_usd, assumed_crew_maint_cost_usd, assumed_station_pax_cost_usd, assumed_disruption_cost_usd, assumed_total_direct_cost_usd, estimated_route_contribution_usd, rask_cents, cask_direct_cents' },
  { table: '12. operating_cost_assumptions', pk: 'aircraft_code', cols: 'fuel_gallons_per_block_hr, default_fuel_price_per_gal, crew_cost_per_block_hr, maintenance_cost_per_block_hr, delay_cost_per_min, cancellation_penalty_per_flight' },
  { table: '13. weather_observations', pk: 'weather_id', cols: 'airport_code (FK), obs_date (FK), temp_celsius, wind_speed_kts, precip_mm, visibility_miles, severe_weather_flag, weather_severity_index' },
  { table: '14. calendar_dimension', pk: 'flight_date', cols: 'year_num, quarter_num, month_num, month_name, day_of_week, day_name, is_weekend, season, is_peak_travel, jet_fuel_spot_usd_gal' },
];

interface SavedCustomQuery {
  id: string;
  title: string;
  businessPurpose: string;
  sqlText: string;
}

export const SqlAnalyticsTab: React.FC<Props> = ({ onDataImported }) => {
  const [selectedQuery, setSelectedQuery] = useState<CuratedSqlQuery>(CURATED_SQL_QUERIES[0]);
  const [sqlEditorText, setSqlEditorText] = useState<string>(CURATED_SQL_QUERIES[0].sqlText);
  const [customTitle, setCustomTitle] = useState<string>(CURATED_SQL_QUERIES[0].title);
  const [customPurpose, setCustomPurpose] = useState<string>(CURATED_SQL_QUERIES[0].businessPurpose);
  const [queryRows, setQueryRows] = useState<Record<string, unknown>[]>([]);
  const [execTimeMs, setExecTimeMs] = useState<number>(0);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvInputText, setCsvInputText] = useState(SAMPLE_CSV_TEMPLATE);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [savedQueries, setSavedQueries] = useState<SavedCustomQuery[]>([]);

  const executeSql = async (sqlToRun: string) => {
    setSqlError(null);
    const t0 = performance.now();
    try {
      const pg = await getPgDb();
      const res = await pg.query<Record<string, unknown>>(sqlToRun);
      const t1 = performance.now();
      setQueryRows(res.rows);
      setExecTimeMs(Math.max(1, Math.round(t1 - t0)));
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : String(err));
      setQueryRows([]);
    }
  };

  useEffect(() => {
    executeSql(selectedQuery.sqlText);
  }, [selectedQuery]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(collection(db, 'saved_queries'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: SavedCustomQuery[] = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            title: String(data.title || ''),
            businessPurpose: String(data.businessPurpose || ''),
            sqlText: String(data.sqlText || ''),
          });
        });
        setSavedQueries(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'saved_queries');
      }
    );
    return () => unsub();
  }, []);

  const handleSaveCustomQuery = async () => {
    const user = auth.currentUser;
    if (!user) {
      setSqlError('Sign in with Google in the top bar to save custom PostgreSQL queries to Firestore.');
      return;
    }
    const qId = `sql_${Date.now()}`;
    try {
      await setDoc(doc(db, 'saved_queries', qId), {
        ownerId: user.uid,
        title: customTitle.trim().slice(0, 120) || 'Custom Analytical Query',
        businessPurpose: customPurpose.trim().slice(0, 400) || 'Custom PostgreSQL evaluation',
        sqlText: sqlEditorText.trim().slice(0, 4000),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `saved_queries/${qId}`);
    }
  };

  const handleCsvIngestion = async () => {
    const res = await importCsvFlightsToPostgres(csvInputText);
    if (res.errors.length > 0) {
      setImportFeedback(`Imported ${res.importedCount} rows with warnings: ${res.errors.join('; ')}`);
    } else {
      setImportFeedback(
        `Successfully ingested ${res.importedCount} flight records into PostgreSQL (tagged data_source_type = 'USER_CSV_IMPORT').`
      );
      onDataImported();
      executeSql(sqlEditorText);
    }
  };

  const columns = queryRows.length > 0 ? Object.keys(queryRows[0]) : [];

  return (
    <div className="space-y-6">
      {/* Top Bar: PostgreSQL Engine Status & Reproducible CSV Ingestion Toggle */}
      <div className="bg-white border border-slate-200 rounded-md p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
            <Database className="w-4 h-4 text-blue-900" />
            <span>PostgreSQL Relational Engine (`@electric-sql/pglite` 14-Table Schema)</span>
          </div>
          <p className="text-xs text-slate-600">
            Execute analytical SQL queries with CTEs, window functions (`RANK`, `DENSE_RANK`, `LAG`, `NTILE`, `ROWS BETWEEN 6 PRECEDING`), and multi-table joins directly against the live relational schema.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowCsvModal(!showCsvModal)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> {showCsvModal ? 'Hide CSV Ingestion' : 'CSV Flight Data Ingestion'}
          </button>
        </div>
      </div>

      {/* Optional Reproducible CSV Import Workflow Panel */}
      {showCsvModal && (
        <div className="bg-white border border-slate-200 rounded-md p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Reproducible CSV Flight Observation Import into PostgreSQL
              </h3>
              <p className="text-xs text-slate-500">
                Imported rows are validated and tagged with <code className="font-mono">data_source_type = 'USER_CSV_IMPORT'</code> across <code className="font-mono">scheduled_flights</code>, <code className="font-mono">flight_operations</code>, <code className="font-mono">passenger_traffic</code>, <code className="font-mono">ticket_fares</code>, and <code className="font-mono">revenue_records</code>.
              </p>
            </div>
            <button
              onClick={handleCsvIngestion}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded"
            >
              Ingest CSV Records into PostgreSQL
            </button>
          </div>
          <textarea
            value={csvInputText}
            onChange={(e) => setCsvInputText(e.target.value)}
            rows={5}
            className="w-full font-mono text-xs p-3 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-slate-900"
          />
          {importFeedback && (
            <div className="text-xs font-medium text-blue-900 bg-blue-50 px-3 py-2 rounded">
              {importFeedback}
            </div>
          )}
        </div>
      )}

      {/* Main Split: Curated 10-Query Catalog + Live PostgreSQL Editor & Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 4 Cols: Curated Query Catalog */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-md p-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-1">
              Analytical SQL Query Catalog (10 Core Queries)
            </h2>
            <p className="text-xs text-slate-500 mb-3">
              Select any analytical query to inspect its business rationale and run it live
            </p>
            <div className="space-y-1.5">
              {CURATED_SQL_QUERIES.map((q) => {
                const active = q.id === selectedQuery.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setSelectedQuery(q);
                      setSqlEditorText(q.sqlText);
                      setCustomTitle(q.title);
                      setCustomPurpose(q.businessPurpose);
                    }}
                    className={`w-full text-left p-2.5 rounded border transition-colors ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-semibold">{q.title}</div>
                    <div className={`text-[11px] mt-0.5 ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                      {q.category} · {q.sqlFeatures.join(' · ')}
                    </div>
                  </button>
                );
              })}
            </div>

            {savedQueries.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-200">
                <div className="text-xs font-semibold text-slate-900 mb-2">
                  Saved Analyst Queries (Firestore)
                </div>
                <div className="space-y-1.5">
                  {savedQueries.map((sq) => (
                    <div
                      key={sq.id}
                      className="flex items-center justify-between p-2 border border-slate-200 rounded text-xs hover:bg-slate-50"
                    >
                      <button
                        onClick={() => {
                          setSqlEditorText(sq.sqlText);
                          setCustomTitle(sq.title);
                          setCustomPurpose(sq.businessPurpose);
                          executeSql(sq.sqlText);
                        }}
                        className="text-left font-medium text-blue-900 hover:underline truncate"
                      >
                        {sq.title}
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await deleteDoc(doc(db, 'saved_queries', sq.id));
                          } catch (err) {
                            handleFirestoreError(err, OperationType.DELETE, `saved_queries/${sq.id}`);
                          }
                        }}
                        className="text-slate-400 hover:text-red-700"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right 8 Cols: SQL Workbench, Business Explanation & Live Execution Output */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-slate-200 rounded-md p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{customTitle}</h3>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{customPurpose}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleSaveCustomQuery}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                >
                  <Save className="w-3.5 h-3.5" /> Save Query
                </button>
                <button
                  onClick={() => executeSql(sqlEditorText)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded"
                >
                  <Play className="w-3.5 h-3.5" /> Execute PostgreSQL
                </button>
              </div>
            </div>

            <textarea
              value={sqlEditorText}
              onChange={(e) => setSqlEditorText(e.target.value)}
              rows={11}
              className="w-full font-mono text-xs p-3.5 bg-slate-950 text-slate-100 rounded border border-slate-800 focus:outline-none"
            />

            {sqlError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs font-mono text-red-800">
                PostgreSQL Execution Error: {sqlError}
              </div>
            )}
          </div>

          {/* Live PostgreSQL Result Grid */}
          <div className="bg-white border border-slate-200 rounded-md p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-slate-600">
                <strong className="text-slate-900">Query Result Set:</strong>{' '}
                <span className="font-mono">{queryRows.length} rows</span> returned in{' '}
                <span className="font-mono">{execTimeMs} ms</span>
              </div>
              {queryRows.length > 0 && (
                <button
                  onClick={() => exportToCsv('aerointel_sql_output', queryRows)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                >
                  <Download className="w-3.5 h-3.5" /> Export Result CSV
                </button>
              )}
            </div>

            <div className="overflow-x-auto max-h-80">
              {queryRows.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50 sticky top-0">
                      {columns.map((col) => (
                        <th key={col} className="py-2 px-2.5 font-mono">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                    {queryRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50">
                        {columns.map((col) => (
                          <td key={col} className="py-2 px-2.5 whitespace-nowrap text-slate-800">
                            {String(row[col] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-8 text-center text-xs text-slate-500">
                  No rows returned.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 14-Table Relational Schema Reference */}
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">
          PostgreSQL 14-Table Relational Schema & Foreign Key Dictionary
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          All 14 normalized tables are live and queryable in the SQL Workbench above
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {RELATIONAL_SCHEMA_CATALOG.map((t) => (
            <div key={t.table} className="p-3 bg-slate-50 border border-slate-200 rounded">
              <div className="flex items-center justify-between font-mono font-semibold text-slate-900 mb-1">
                <span>{t.table}</span>
                <span className="text-[11px] text-blue-900">PK: {t.pk}</span>
              </div>
              <div className="font-mono text-[11px] text-slate-600 leading-relaxed">{t.cols}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
