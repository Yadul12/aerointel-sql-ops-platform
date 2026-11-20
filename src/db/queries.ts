/**
 * AeroIntel — PostgreSQL Analytical Queries & Curated SQL Explorer Catalog
 * All queries use real PostgreSQL syntax (CTEs, window functions, RANK/DENSE_RANK,
 * conditional aggregation, rolling frames) executed directly on the PGlite PostgreSQL engine.
 */
import { getPgDb, GlobalFilters, buildFilterClause } from './pgEngine.ts';

export interface ExecutiveKpiSummary {
  total_flights: number;
  completed_flights: number;
  cancelled_flights: number;
  diverted_flights: number;
  total_passengers: number;
  total_available_seats: number;
  load_factor_pct: number;
  avg_base_fare_usd: number;
  avg_total_fare_usd: number;
  observed_ticket_revenue_usd: number;
  estimated_ancillary_revenue_usd: number;
  estimated_cargo_revenue_usd: number;
  total_operating_revenue_usd: number;
  assumed_fuel_cost_usd: number;
  assumed_crew_maint_cost_usd: number;
  assumed_station_pax_cost_usd: number;
  assumed_disruption_cost_usd: number;
  assumed_total_direct_cost_usd: number;
  estimated_route_contribution_usd: number;
  contribution_margin_pct: number;
  otp_dep_pct: number;
  otp_arr_pct: number;
  cancel_rate_pct: number;
  avg_dep_delay_mins: number;
  avg_arr_delay_mins: number;
  avg_rask_cents: number;
  avg_cask_cents: number;
}

export interface DailyRollingTrendRow {
  flight_date: string;
  flights: number;
  passengers: number;
  seats: number;
  daily_load_factor_pct: number;
  daily_otp_arr_pct: number;
  rolling_7d_otp_arr_pct: number;
  daily_revenue_usd: number;
  daily_direct_cost_usd: number;
  daily_contribution_usd: number;
  rolling_7d_contribution_usd: number;
  avg_arr_delay_mins: number;
}

export interface RoutePerformanceRow {
  route_code: string;
  origin_airport: string;
  dest_airport: string;
  distance_miles: number;
  market_type: string;
  slot_controlled: boolean;
  flight_frequency: number;
  completed_flights: number;
  passenger_volume: number;
  available_capacity: number;
  load_factor_pct: number;
  avg_base_fare_usd: number;
  rev_per_pax_usd: number;
  observed_ticket_rev_usd: number;
  est_ancillary_rev_usd: number;
  est_cargo_rev_usd: number;
  total_revenue_usd: number;
  assumed_fuel_cost_usd: number;
  assumed_crew_maint_cost_usd: number;
  assumed_station_pax_cost_usd: number;
  assumed_disruption_cost_usd: number;
  assumed_direct_cost_usd: number;
  estimated_contribution_usd: number;
  contribution_margin_pct: number;
  rask_cents: number;
  cask_cents: number;
  otp_arr_pct: number;
  cancel_rate_pct: number;
  avg_arr_delay_mins: number;
  contribution_rank: number;
}

export interface DelayDecompositionSummary {
  carrier_delay_mins: number;
  weather_delay_mins: number;
  nas_delay_mins: number;
  security_delay_mins: number;
  late_aircraft_delay_mins: number;
  total_delay_mins: number;
  delayed_15_flights: number;
}

export interface HourlyDelayPatternRow {
  sched_dep_hour: number;
  total_flights: number;
  otp_arr_pct: number;
  avg_dep_delay_mins: number;
  avg_arr_delay_mins: number;
  avg_turnaround_buffer_mins: number;
  late_aircraft_share_pct: number;
}

export interface AirportPerformanceRow {
  airport_code: string;
  airport_name: string;
  city: string;
  hub_tier: string;
  congestion_index: number;
  departures: number;
  otp_dep_pct: number;
  otp_arr_pct: number;
  cancel_rate_pct: number;
  avg_dep_delay_mins: number;
  avg_taxi_out_mins: number;
  severe_weather_days: number;
  total_contribution_usd: number;
}

export interface CarrierPerformanceRow {
  airline_code: string;
  airline_name: string;
  carrier_group: string;
  flights: number;
  passengers: number;
  load_factor_pct: number;
  avg_fare_usd: number;
  otp_dep_pct: number;
  otp_arr_pct: number;
  cancel_rate_pct: number;
  avg_arr_delay_mins: number;
  total_revenue_usd: number;
  total_direct_cost_usd: number;
  estimated_contribution_usd: number;
  contribution_margin_pct: number;
}

export interface MonthlyPerformanceRow {
  month_num: number;
  month_name: string;
  season: string;
  flights: number;
  passengers: number;
  available_seats: number;
  load_factor_pct: number;
  avg_fare_usd: number;
  total_revenue_usd: number;
  total_direct_cost_usd: number;
  estimated_contribution_usd: number;
  otp_arr_pct: number;
  cancel_rate_pct: number;
}

export interface CancellationBreakdownRow {
  cancellation_code: string;
  cancellation_reason: string;
  cancelled_flights: number;
  share_pct: number;
  est_disruption_penalty_usd: number;
}

export async function fetchExecutiveKpis(filters: GlobalFilters): Promise<ExecutiveKpiSummary> {
  const db = await getPgDb();
  const { whereSql, params } = buildFilterClause(filters, 'sf');

  const sql = `
    SELECT
      COUNT(sf.schedule_id)::int AS total_flights,
      SUM(CASE WHEN NOT fo.is_cancelled THEN 1 ELSE 0 END)::int AS completed_flights,
      SUM(CASE WHEN fo.is_cancelled THEN 1 ELSE 0 END)::int AS cancelled_flights,
      SUM(CASE WHEN fo.is_diverted THEN 1 ELSE 0 END)::int AS diverted_flights,
      COALESCE(SUM(pt.revenue_passengers), 0)::int AS total_passengers,
      COALESCE(SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END), 0)::int AS total_available_seats,
      ROUND(
        CASE WHEN SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END) > 0
        THEN (SUM(pt.revenue_passengers)::numeric / SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END)::numeric) * 100
        ELSE 0 END, 2
      )::float AS load_factor_pct,
      ROUND(COALESCE(AVG(tf.avg_base_fare_usd), 0), 2)::float AS avg_base_fare_usd,
      ROUND(COALESCE(AVG(tf.total_fare_per_pax_usd), 0), 2)::float AS avg_total_fare_usd,
      ROUND(COALESCE(SUM(rr.observed_ticket_revenue_usd), 0), 2)::float AS observed_ticket_revenue_usd,
      ROUND(COALESCE(SUM(rr.estimated_ancillary_revenue_usd), 0), 2)::float AS estimated_ancillary_revenue_usd,
      ROUND(COALESCE(SUM(rr.estimated_cargo_revenue_usd), 0), 2)::float AS estimated_cargo_revenue_usd,
      ROUND(COALESCE(SUM(rr.total_operating_revenue_usd), 0), 2)::float AS total_operating_revenue_usd,
      ROUND(COALESCE(SUM(rr.assumed_fuel_cost_usd), 0), 2)::float AS assumed_fuel_cost_usd,
      ROUND(COALESCE(SUM(rr.assumed_crew_maint_cost_usd), 0), 2)::float AS assumed_crew_maint_cost_usd,
      ROUND(COALESCE(SUM(rr.assumed_station_pax_cost_usd), 0), 2)::float AS assumed_station_pax_cost_usd,
      ROUND(COALESCE(SUM(rr.assumed_disruption_cost_usd), 0), 2)::float AS assumed_disruption_cost_usd,
      ROUND(COALESCE(SUM(rr.assumed_total_direct_cost_usd), 0), 2)::float AS assumed_total_direct_cost_usd,
      ROUND(COALESCE(SUM(rr.estimated_route_contribution_usd), 0), 2)::float AS estimated_route_contribution_usd,
      ROUND(
        CASE WHEN COALESCE(SUM(rr.total_operating_revenue_usd), 0) > 0
        THEN (SUM(rr.estimated_route_contribution_usd) / SUM(rr.total_operating_revenue_usd)) * 100
        ELSE 0 END, 2
      )::float AS contribution_margin_pct,
      ROUND(
        CASE WHEN COUNT(sf.schedule_id) > 0
        THEN (SUM(CASE WHEN fo.is_on_time_dep THEN 1 ELSE 0 END)::numeric / COUNT(sf.schedule_id)::numeric) * 100
        ELSE 0 END, 2
      )::float AS otp_dep_pct,
      ROUND(
        CASE WHEN COUNT(sf.schedule_id) > 0
        THEN (SUM(CASE WHEN fo.is_on_time_arr THEN 1 ELSE 0 END)::numeric / COUNT(sf.schedule_id)::numeric) * 100
        ELSE 0 END, 2
      )::float AS otp_arr_pct,
      ROUND(
        CASE WHEN COUNT(sf.schedule_id) > 0
        THEN (SUM(CASE WHEN fo.is_cancelled THEN 1 ELSE 0 END)::numeric / COUNT(sf.schedule_id)::numeric) * 100
        ELSE 0 END, 2
      )::float AS cancel_rate_pct,
      ROUND(COALESCE(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.actual_dep_delay_mins END), 0), 1)::float AS avg_dep_delay_mins,
      ROUND(COALESCE(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.actual_arr_delay_mins END), 0), 1)::float AS avg_arr_delay_mins,
      ROUND(COALESCE(AVG(rr.rask_cents), 0), 2)::float AS avg_rask_cents,
      ROUND(COALESCE(AVG(rr.cask_direct_cents), 0), 2)::float AS avg_cask_cents
    FROM scheduled_flights sf
    JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
    JOIN passenger_traffic pt ON pt.schedule_id = sf.schedule_id
    JOIN ticket_fares tf ON tf.schedule_id = sf.schedule_id
    JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
    ${whereSql};
  `;

  const res = await db.query<ExecutiveKpiSummary>(sql, params);
  return res.rows[0];
}

export async function fetchDailyRollingTrends(filters: GlobalFilters): Promise<DailyRollingTrendRow[]> {
  const db = await getPgDb();
  const { whereSql, params } = buildFilterClause(filters, 'sf');

  const sql = `
    WITH daily_agg AS (
      SELECT
        sf.flight_date::text AS flight_date,
        COUNT(sf.schedule_id)::int AS flights,
        COALESCE(SUM(pt.revenue_passengers), 0)::int AS passengers,
        COALESCE(SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END), 0)::int AS seats,
        ROUND(
          CASE WHEN SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END) > 0
          THEN (SUM(pt.revenue_passengers)::numeric / SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END)::numeric) * 100
          ELSE 0 END, 2
        )::float AS daily_load_factor_pct,
        ROUND(
          (SUM(CASE WHEN fo.is_on_time_arr THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2
        )::float AS daily_otp_arr_pct,
        ROUND(COALESCE(SUM(rr.total_operating_revenue_usd), 0), 2)::float AS daily_revenue_usd,
        ROUND(COALESCE(SUM(rr.assumed_total_direct_cost_usd), 0), 2)::float AS daily_direct_cost_usd,
        ROUND(COALESCE(SUM(rr.estimated_route_contribution_usd), 0), 2)::float AS daily_contribution_usd,
        ROUND(COALESCE(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.actual_arr_delay_mins END), 0), 1)::float AS avg_arr_delay_mins
      FROM scheduled_flights sf
      JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
      JOIN passenger_traffic pt ON pt.schedule_id = sf.schedule_id
      JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
      ${whereSql}
      GROUP BY sf.flight_date
    )
    SELECT
      flight_date,
      flights,
      passengers,
      seats,
      daily_load_factor_pct,
      daily_otp_arr_pct,
      ROUND(
        AVG(daily_otp_arr_pct) OVER (
          ORDER BY flight_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        )::numeric, 2
      )::float AS rolling_7d_otp_arr_pct,
      daily_revenue_usd,
      daily_direct_cost_usd,
      daily_contribution_usd,
      ROUND(
        AVG(daily_contribution_usd) OVER (
          ORDER BY flight_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        )::numeric, 2
      )::float AS rolling_7d_contribution_usd,
      avg_arr_delay_mins
    FROM daily_agg
    ORDER BY flight_date ASC;
  `;

  const res = await db.query<DailyRollingTrendRow>(sql, params);
  return res.rows;
}

export async function fetchRoutePerformance(filters: GlobalFilters): Promise<RoutePerformanceRow[]> {
  const db = await getPgDb();
  const { whereSql, params } = buildFilterClause(filters, 'sf');

  const sql = `
    WITH route_agg AS (
      SELECT
        r.route_code,
        r.origin_airport,
        r.dest_airport,
        r.distance_miles,
        r.market_type,
        r.slot_controlled,
        COUNT(sf.schedule_id)::int AS flight_frequency,
        SUM(CASE WHEN NOT fo.is_cancelled THEN 1 ELSE 0 END)::int AS completed_flights,
        COALESCE(SUM(pt.revenue_passengers), 0)::int AS passenger_volume,
        COALESCE(SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END), 0)::int AS available_capacity,
        ROUND(
          CASE WHEN SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END) > 0
          THEN (SUM(pt.revenue_passengers)::numeric / SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END)::numeric) * 100
          ELSE 0 END, 2
        )::float AS load_factor_pct,
        ROUND(COALESCE(AVG(tf.avg_base_fare_usd), 0), 2)::float AS avg_base_fare_usd,
        ROUND(
          CASE WHEN SUM(pt.revenue_passengers) > 0
          THEN SUM(rr.total_operating_revenue_usd) / SUM(pt.revenue_passengers)
          ELSE 0 END, 2
        )::float AS rev_per_pax_usd,
        ROUND(COALESCE(SUM(rr.observed_ticket_revenue_usd), 0), 2)::float AS observed_ticket_rev_usd,
        ROUND(COALESCE(SUM(rr.estimated_ancillary_revenue_usd), 0), 2)::float AS est_ancillary_rev_usd,
        ROUND(COALESCE(SUM(rr.estimated_cargo_revenue_usd), 0), 2)::float AS est_cargo_rev_usd,
        ROUND(COALESCE(SUM(rr.total_operating_revenue_usd), 0), 2)::float AS total_revenue_usd,
        ROUND(COALESCE(SUM(rr.assumed_fuel_cost_usd), 0), 2)::float AS assumed_fuel_cost_usd,
        ROUND(COALESCE(SUM(rr.assumed_crew_maint_cost_usd), 0), 2)::float AS assumed_crew_maint_cost_usd,
        ROUND(COALESCE(SUM(rr.assumed_station_pax_cost_usd), 0), 2)::float AS assumed_station_pax_cost_usd,
        ROUND(COALESCE(SUM(rr.assumed_disruption_cost_usd), 0), 2)::float AS assumed_disruption_cost_usd,
        ROUND(COALESCE(SUM(rr.assumed_total_direct_cost_usd), 0), 2)::float AS assumed_direct_cost_usd,
        ROUND(COALESCE(SUM(rr.estimated_route_contribution_usd), 0), 2)::float AS estimated_contribution_usd,
        ROUND(
          CASE WHEN COALESCE(SUM(rr.total_operating_revenue_usd), 0) > 0
          THEN (SUM(rr.estimated_route_contribution_usd) / SUM(rr.total_operating_revenue_usd)) * 100
          ELSE 0 END, 2
        )::float AS contribution_margin_pct,
        ROUND(COALESCE(AVG(rr.rask_cents), 0), 2)::float AS rask_cents,
        ROUND(COALESCE(AVG(rr.cask_direct_cents), 0), 2)::float AS cask_cents,
        ROUND(
          (SUM(CASE WHEN fo.is_on_time_arr THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2
        )::float AS otp_arr_pct,
        ROUND(
          (SUM(CASE WHEN fo.is_cancelled THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2
        )::float AS cancel_rate_pct,
        ROUND(COALESCE(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.actual_arr_delay_mins END), 0), 1)::float AS avg_arr_delay_mins
      FROM scheduled_flights sf
      JOIN routes r ON r.route_code = sf.route_code
      JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
      JOIN passenger_traffic pt ON pt.schedule_id = sf.schedule_id
      JOIN ticket_fares tf ON tf.schedule_id = sf.schedule_id
      JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
      ${whereSql}
      GROUP BY r.route_code, r.origin_airport, r.dest_airport, r.distance_miles, r.market_type, r.slot_controlled
    )
    SELECT
      *,
      RANK() OVER (ORDER BY estimated_contribution_usd DESC)::int AS contribution_rank
    FROM route_agg
    ORDER BY estimated_contribution_usd DESC;
  `;

  const res = await db.query<RoutePerformanceRow>(sql, params);
  return res.rows;
}

export async function fetchDelayDecomposition(filters: GlobalFilters): Promise<DelayDecompositionSummary> {
  const db = await getPgDb();
  const { whereSql, params } = buildFilterClause(filters, 'sf');

  const sql = `
    SELECT
      COALESCE(SUM(fd.carrier_delay_mins), 0)::int AS carrier_delay_mins,
      COALESCE(SUM(fd.weather_delay_mins), 0)::int AS weather_delay_mins,
      COALESCE(SUM(fd.nas_delay_mins), 0)::int AS nas_delay_mins,
      COALESCE(SUM(fd.security_delay_mins), 0)::int AS security_delay_mins,
      COALESCE(SUM(fd.late_aircraft_delay_mins), 0)::int AS late_aircraft_delay_mins,
      COALESCE(
        SUM(fd.carrier_delay_mins + fd.weather_delay_mins + fd.nas_delay_mins + fd.security_delay_mins + fd.late_aircraft_delay_mins), 0
      )::int AS total_delay_mins,
      COALESCE(SUM(CASE WHEN fo.is_delayed_15 THEN 1 ELSE 0 END), 0)::int AS delayed_15_flights
    FROM scheduled_flights sf
    JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
    JOIN flight_delays fd ON fd.schedule_id = sf.schedule_id
    ${whereSql};
  `;

  const res = await db.query<DelayDecompositionSummary>(sql, params);
  return res.rows[0];
}

export async function fetchHourlyDelayPatterns(filters: GlobalFilters): Promise<HourlyDelayPatternRow[]> {
  const db = await getPgDb();
  const { whereSql, params } = buildFilterClause(filters, 'sf');

  const sql = `
    SELECT
      sf.sched_dep_hour,
      COUNT(sf.schedule_id)::int AS total_flights,
      ROUND(
        (SUM(CASE WHEN fo.is_on_time_arr THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2
      )::float AS otp_arr_pct,
      ROUND(COALESCE(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.actual_dep_delay_mins END), 0), 1)::float AS avg_dep_delay_mins,
      ROUND(COALESCE(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.actual_arr_delay_mins END), 0), 1)::float AS avg_arr_delay_mins,
      ROUND(AVG(sf.turnaround_buffer_mins)::numeric, 1)::float AS avg_turnaround_buffer_mins,
      ROUND(
        CASE WHEN SUM(fd.carrier_delay_mins + fd.weather_delay_mins + fd.nas_delay_mins + fd.security_delay_mins + fd.late_aircraft_delay_mins) > 0
        THEN (SUM(fd.late_aircraft_delay_mins)::numeric / SUM(fd.carrier_delay_mins + fd.weather_delay_mins + fd.nas_delay_mins + fd.security_delay_mins + fd.late_aircraft_delay_mins)::numeric) * 100
        ELSE 0 END, 1
      )::float AS late_aircraft_share_pct
    FROM scheduled_flights sf
    JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
    JOIN flight_delays fd ON fd.schedule_id = sf.schedule_id
    ${whereSql}
    GROUP BY sf.sched_dep_hour
    ORDER BY sf.sched_dep_hour ASC;
  `;

  const res = await db.query<HourlyDelayPatternRow>(sql, params);
  return res.rows;
}

export async function fetchAirportPerformance(filters: GlobalFilters): Promise<AirportPerformanceRow[]> {
  const db = await getPgDb();
  const { whereSql, params } = buildFilterClause(filters, 'sf');

  const sql = `
    SELECT
      ap.airport_code,
      ap.airport_name,
      ap.city,
      ap.hub_tier,
      ap.congestion_index::float AS congestion_index,
      COUNT(sf.schedule_id)::int AS departures,
      ROUND(
        (SUM(CASE WHEN fo.is_on_time_dep THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2
      )::float AS otp_dep_pct,
      ROUND(
        (SUM(CASE WHEN fo.is_on_time_arr THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2
      )::float AS otp_arr_pct,
      ROUND(
        (SUM(CASE WHEN fo.is_cancelled THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2
      )::float AS cancel_rate_pct,
      ROUND(COALESCE(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.actual_dep_delay_mins END), 0), 1)::float AS avg_dep_delay_mins,
      ROUND(COALESCE(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.taxi_out_mins END), 0), 1)::float AS avg_taxi_out_mins,
      COUNT(DISTINCT CASE WHEN wo.severe_weather_flag THEN sf.flight_date END)::int AS severe_weather_days,
      ROUND(COALESCE(SUM(rr.estimated_route_contribution_usd), 0), 2)::float AS total_contribution_usd
    FROM scheduled_flights sf
    JOIN airports ap ON ap.airport_code = sf.origin_airport
    JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
    JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
    LEFT JOIN weather_observations wo ON wo.airport_code = sf.origin_airport AND wo.obs_date = sf.flight_date
    ${whereSql}
    GROUP BY ap.airport_code, ap.airport_name, ap.city, ap.hub_tier, ap.congestion_index
    ORDER BY departures DESC;
  `;

  const res = await db.query<AirportPerformanceRow>(sql, params);
  return res.rows;
}

export async function fetchCarrierPerformance(filters: GlobalFilters): Promise<CarrierPerformanceRow[]> {
  const db = await getPgDb();
  const { whereSql, params } = buildFilterClause(filters, 'sf');

  const sql = `
    SELECT
      al.airline_code,
      al.airline_name,
      al.carrier_group,
      COUNT(sf.schedule_id)::int AS flights,
      COALESCE(SUM(pt.revenue_passengers), 0)::int AS passengers,
      ROUND(
        CASE WHEN SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END) > 0
        THEN (SUM(pt.revenue_passengers)::numeric / SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END)::numeric) * 100
        ELSE 0 END, 2
      )::float AS load_factor_pct,
      ROUND(COALESCE(AVG(tf.avg_base_fare_usd), 0), 2)::float AS avg_fare_usd,
      ROUND(
        (SUM(CASE WHEN fo.is_on_time_dep THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2
      )::float AS otp_dep_pct,
      ROUND(
        (SUM(CASE WHEN fo.is_on_time_arr THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2
      )::float AS otp_arr_pct,
      ROUND(
        (SUM(CASE WHEN fo.is_cancelled THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2
      )::float AS cancel_rate_pct,
      ROUND(COALESCE(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.actual_arr_delay_mins END), 0), 1)::float AS avg_arr_delay_mins,
      ROUND(COALESCE(SUM(rr.total_operating_revenue_usd), 0), 2)::float AS total_revenue_usd,
      ROUND(COALESCE(SUM(rr.assumed_total_direct_cost_usd), 0), 2)::float AS total_direct_cost_usd,
      ROUND(COALESCE(SUM(rr.estimated_route_contribution_usd), 0), 2)::float AS estimated_contribution_usd,
      ROUND(
        CASE WHEN COALESCE(SUM(rr.total_operating_revenue_usd), 0) > 0
        THEN (SUM(rr.estimated_route_contribution_usd) / SUM(rr.total_operating_revenue_usd)) * 100
        ELSE 0 END, 2
      )::float AS contribution_margin_pct
    FROM scheduled_flights sf
    JOIN airlines al ON al.airline_code = sf.airline_code
    JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
    JOIN passenger_traffic pt ON pt.schedule_id = sf.schedule_id
    JOIN ticket_fares tf ON tf.schedule_id = sf.schedule_id
    JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
    ${whereSql}
    GROUP BY al.airline_code, al.airline_name, al.carrier_group
    ORDER BY estimated_contribution_usd DESC;
  `;

  const res = await db.query<CarrierPerformanceRow>(sql, params);
  return res.rows;
}

export async function fetchMonthlyPerformance(filters: GlobalFilters): Promise<MonthlyPerformanceRow[]> {
  const db = await getPgDb();
  const { whereSql, params } = buildFilterClause(filters, 'sf');

  const sql = `
    SELECT
      cd.month_num,
      cd.month_name,
      cd.season,
      COUNT(sf.schedule_id)::int AS flights,
      COALESCE(SUM(pt.revenue_passengers), 0)::int AS passengers,
      COALESCE(SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END), 0)::int AS available_seats,
      ROUND(
        CASE WHEN SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END) > 0
        THEN (SUM(pt.revenue_passengers)::numeric / SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END)::numeric) * 100
        ELSE 0 END, 2
      )::float AS load_factor_pct,
      ROUND(COALESCE(AVG(tf.avg_base_fare_usd), 0), 2)::float AS avg_fare_usd,
      ROUND(COALESCE(SUM(rr.total_operating_revenue_usd), 0), 2)::float AS total_revenue_usd,
      ROUND(COALESCE(SUM(rr.assumed_total_direct_cost_usd), 0), 2)::float AS total_direct_cost_usd,
      ROUND(COALESCE(SUM(rr.estimated_route_contribution_usd), 0), 2)::float AS estimated_contribution_usd,
      ROUND(
        (SUM(CASE WHEN fo.is_on_time_arr THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2
      )::float AS otp_arr_pct,
      ROUND(
        (SUM(CASE WHEN fo.is_cancelled THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2
      )::float AS cancel_rate_pct
    FROM scheduled_flights sf
    JOIN calendar_dimension cd ON cd.flight_date = sf.flight_date
    JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
    JOIN passenger_traffic pt ON pt.schedule_id = sf.schedule_id
    JOIN ticket_fares tf ON tf.schedule_id = sf.schedule_id
    JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
    ${whereSql}
    GROUP BY cd.month_num, cd.month_name, cd.season
    ORDER BY cd.month_num ASC;
  `;

  const res = await db.query<MonthlyPerformanceRow>(sql, params);
  return res.rows;
}

export async function fetchCancellationBreakdown(filters: GlobalFilters): Promise<CancellationBreakdownRow[]> {
  const db = await getPgDb();
  const { whereSql, params } = buildFilterClause(filters, 'sf');

  const sql = `
    WITH canc AS (
      SELECT
        c.cancellation_code,
        c.cancellation_reason,
        COUNT(c.cancellation_id)::int AS cancelled_flights,
        COALESCE(SUM(rr.assumed_disruption_cost_usd), 0)::float AS est_disruption_penalty_usd
      FROM scheduled_flights sf
      JOIN cancellations c ON c.schedule_id = sf.schedule_id
      JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
      ${whereSql}
      GROUP BY c.cancellation_code, c.cancellation_reason
    ),
    tot AS (
      SELECT NULLIF(SUM(cancelled_flights), 0)::numeric AS total_c FROM canc
    )
    SELECT
      canc.cancellation_code,
      canc.cancellation_reason,
      canc.cancelled_flights,
      ROUND((canc.cancelled_flights::numeric / COALESCE(tot.total_c, 1)) * 100, 1)::float AS share_pct,
      ROUND(canc.est_disruption_penalty_usd::numeric, 2)::float AS est_disruption_penalty_usd
    FROM canc
    CROSS JOIN tot
    ORDER BY canc.cancelled_flights DESC;
  `;

  const res = await db.query<CancellationBreakdownRow>(sql, params);
  return res.rows;
}

export interface DayOfWeekPerformanceRow {
  day_of_week: number;
  day_name: string;
  flights: number;
  passengers: number;
  available_seats: number;
  load_factor_pct: number;
  avg_base_fare_usd: number;
  otp_arr_pct: number;
  avg_arr_delay_mins: number;
  estimated_contribution_usd: number;
}

export interface FleetGaugeUtilizationRow {
  aircraft_code: string;
  aircraft_model: string;
  total_seats: number;
  departures: number;
  completed_flights: number;
  load_factor_pct: number;
  fuel_gallons_per_block_hr: number;
  crew_cost_per_block_hr: number;
  avg_direct_cost_per_flight: number;
  avg_revenue_per_flight: number;
  avg_contribution_per_flight: number;
  rask_cents: number;
  cask_cents: number;
}

export interface TurnaroundBufferTierRow {
  turnaround_tier: string;
  flights: number;
  avg_buffer_mins: number;
  otp_dep_pct: number;
  otp_arr_pct: number;
  avg_arr_delay_mins: number;
  avg_late_aircraft_mins: number;
  avg_disruption_cost_usd: number;
}

export async function fetchDayOfWeekPerformance(filters: GlobalFilters): Promise<DayOfWeekPerformanceRow[]> {
  const db = await getPgDb();
  const { whereSql, params } = buildFilterClause(filters, 'sf');

  const sql = `
    SELECT
      cd.day_of_week,
      cd.day_name,
      COUNT(sf.schedule_id)::int AS flights,
      COALESCE(SUM(pt.revenue_passengers), 0)::int AS passengers,
      COALESCE(SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END), 0)::int AS available_seats,
      ROUND(
        CASE WHEN SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END) > 0
        THEN (SUM(pt.revenue_passengers)::numeric / SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END)::numeric) * 100
        ELSE 0 END, 2
      )::float AS load_factor_pct,
      ROUND(COALESCE(AVG(tf.avg_base_fare_usd), 0), 2)::float AS avg_base_fare_usd,
      ROUND(
        (SUM(CASE WHEN fo.is_on_time_arr THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2
      )::float AS otp_arr_pct,
      ROUND(COALESCE(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.actual_arr_delay_mins END), 0), 1)::float AS avg_arr_delay_mins,
      ROUND(COALESCE(SUM(rr.estimated_route_contribution_usd), 0), 2)::float AS estimated_contribution_usd
    FROM scheduled_flights sf
    JOIN calendar_dimension cd ON cd.flight_date = sf.flight_date
    JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
    JOIN passenger_traffic pt ON pt.schedule_id = sf.schedule_id
    JOIN ticket_fares tf ON tf.schedule_id = sf.schedule_id
    JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
    ${whereSql}
    GROUP BY cd.day_of_week, cd.day_name
    ORDER BY CASE WHEN cd.day_of_week = 0 THEN 7 ELSE cd.day_of_week END ASC;
  `;

  const res = await db.query<DayOfWeekPerformanceRow>(sql, params);
  return res.rows;
}

export async function fetchFleetGaugeUtilization(filters: GlobalFilters): Promise<FleetGaugeUtilizationRow[]> {
  const db = await getPgDb();
  const { whereSql, params } = buildFilterClause(filters, 'sf');

  const sql = `
    SELECT
      ac.aircraft_code,
      (ac.manufacturer || ' ' || ac.model_name) AS aircraft_model,
      ac.total_seats::int AS total_seats,
      COUNT(sf.schedule_id)::int AS departures,
      SUM(CASE WHEN NOT fo.is_cancelled THEN 1 ELSE 0 END)::int AS completed_flights,
      ROUND(
        CASE WHEN SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END) > 0
        THEN (SUM(pt.revenue_passengers)::numeric / SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END)::numeric) * 100
        ELSE 0 END, 2
      )::float AS load_factor_pct,
      oca.fuel_gallons_per_block_hr::float AS fuel_gallons_per_block_hr,
      oca.crew_cost_per_block_hr::float AS crew_cost_per_block_hr,
      ROUND(COALESCE(AVG(rr.assumed_total_direct_cost_usd), 0), 0)::float AS avg_direct_cost_per_flight,
      ROUND(COALESCE(AVG(rr.total_operating_revenue_usd), 0), 0)::float AS avg_revenue_per_flight,
      ROUND(COALESCE(AVG(rr.estimated_route_contribution_usd), 0), 0)::float AS avg_contribution_per_flight,
      ROUND(COALESCE(AVG(rr.rask_cents), 0), 2)::float AS rask_cents,
      ROUND(COALESCE(AVG(rr.cask_direct_cents), 0), 2)::float AS cask_cents
    FROM scheduled_flights sf
    JOIN aircraft_capacity ac ON ac.aircraft_code = sf.aircraft_code
    JOIN operating_cost_assumptions oca ON oca.aircraft_code = sf.aircraft_code
    JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
    JOIN passenger_traffic pt ON pt.schedule_id = sf.schedule_id
    JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
    ${whereSql}
    GROUP BY ac.aircraft_code, ac.manufacturer, ac.model_name, ac.total_seats, oca.fuel_gallons_per_block_hr, oca.crew_cost_per_block_hr
    ORDER BY avg_contribution_per_flight DESC;
  `;

  const res = await db.query<FleetGaugeUtilizationRow>(sql, params);
  return res.rows;
}

export async function fetchTurnaroundBufferTiers(filters: GlobalFilters): Promise<TurnaroundBufferTierRow[]> {
  const db = await getPgDb();
  const { whereSql, params } = buildFilterClause(filters, 'sf');

  const sql = `
    SELECT
      CASE
        WHEN sf.turnaround_buffer_mins < 40 THEN '1. Tight Turnaround (<40 min)'
        WHEN sf.turnaround_buffer_mins BETWEEN 40 AND 52 THEN '2. Standard Turnaround (40–52 min)'
        ELSE '3. Cushioned Turnaround (>52 min)'
      END AS turnaround_tier,
      COUNT(sf.schedule_id)::int AS flights,
      ROUND(AVG(sf.turnaround_buffer_mins)::numeric, 1)::float AS avg_buffer_mins,
      ROUND((SUM(CASE WHEN fo.is_on_time_dep THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2)::float AS otp_dep_pct,
      ROUND((SUM(CASE WHEN fo.is_on_time_arr THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sf.schedule_id), 0)::numeric) * 100, 2)::float AS otp_arr_pct,
      ROUND(COALESCE(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.actual_arr_delay_mins END), 0)::numeric, 1)::float AS avg_arr_delay_mins,
      ROUND(COALESCE(AVG(fd.late_aircraft_delay_mins), 0)::numeric, 1)::float AS avg_late_aircraft_mins,
      ROUND(COALESCE(AVG(rr.assumed_disruption_cost_usd), 0)::numeric, 0)::float AS avg_disruption_cost_usd
    FROM scheduled_flights sf
    JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
    JOIN flight_delays fd ON fd.schedule_id = sf.schedule_id
    JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
    ${whereSql}
    GROUP BY 1
    ORDER BY 1 ASC;
  `;

  const res = await db.query<TurnaroundBufferTierRow>(sql, params);
  return res.rows;
}

/**
 * Curated Analytical SQL Explorer Catalog (10 Enterprise PostgreSQL Queries)
 */
export interface CuratedSqlQuery {
  id: string;
  title: string;
  category: string;
  businessPurpose: string;
  sqlFeatures: string[];
  sqlText: string;
}

export const CURATED_SQL_QUERIES: CuratedSqlQuery[] = [
  {
    id: 'q1_route_ranking',
    title: '01. Route Commercial Contribution & RASK/CASK Ranking',
    category: 'Commercial Performance',
    businessPurpose:
      'Ranks all O&D routes by estimated direct route contribution and margin, separating observed DB1B-calibrated ticket revenue from estimated ancillary/cargo streams and Form 41 direct block-hour costs.',
    sqlFeatures: ['CTE', 'RANK() Window Function', 'Multi-Table Joins', 'Conditional Aggregation'],
    sqlText: `WITH route_financials AS (
  SELECT
    r.route_code,
    r.market_type,
    r.distance_miles,
    COUNT(sf.schedule_id) AS flights,
    SUM(pt.revenue_passengers) AS total_pax,
    ROUND((SUM(pt.revenue_passengers)::numeric / NULLIF(SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END), 0)) * 100, 2) AS load_factor_pct,
    ROUND(SUM(rr.observed_ticket_revenue_usd), 0) AS observed_ticket_rev,
    ROUND(SUM(rr.estimated_ancillary_revenue_usd + rr.estimated_cargo_revenue_usd), 0) AS est_ancillary_cargo_rev,
    ROUND(SUM(rr.assumed_total_direct_cost_usd), 0) AS assumed_direct_cost,
    ROUND(SUM(rr.estimated_route_contribution_usd), 0) AS est_contribution,
    ROUND(AVG(rr.rask_cents), 2) AS rask_cents,
    ROUND(AVG(rr.cask_direct_cents), 2) AS cask_cents
  FROM scheduled_flights sf
  JOIN routes r ON r.route_code = sf.route_code
  JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
  JOIN passenger_traffic pt ON pt.schedule_id = sf.schedule_id
  JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
  GROUP BY r.route_code, r.market_type, r.distance_miles
)
SELECT
  RANK() OVER (ORDER BY est_contribution DESC) AS rank_num,
  route_code,
  market_type,
  flights,
  load_factor_pct,
  observed_ticket_rev,
  assumed_direct_cost,
  est_contribution,
  ROUND((est_contribution / NULLIF(observed_ticket_rev + est_ancillary_cargo_rev, 0)) * 100, 1) AS margin_pct,
  rask_cents,
  cask_cents
FROM route_financials
ORDER BY rank_num ASC;`,
  },
  {
    id: 'q2_rolling_7d_otp',
    title: '02. Rolling 7-Day Operational OTP & Contribution Velocity',
    category: 'Operational Performance',
    businessPurpose:
      'Computes daily arrival On-Time Performance (A14) and route contribution alongside a 7-day trailing moving average window to filter out day-of-week schedule noise and detect winter storm recovery time.',
    sqlFeatures: ['Window Frame ROWS BETWEEN 6 PRECEDING', 'CTE', 'Date Aggregation'],
    sqlText: `WITH daily_metrics AS (
  SELECT
    sf.flight_date,
    COUNT(sf.schedule_id) AS daily_flights,
    ROUND((SUM(CASE WHEN fo.is_on_time_arr THEN 1 ELSE 0 END)::numeric / COUNT(sf.schedule_id)) * 100, 2) AS daily_otp_pct,
    ROUND(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.actual_arr_delay_mins END), 1) AS avg_arr_delay_mins,
    ROUND(SUM(rr.estimated_route_contribution_usd), 0) AS daily_contribution_usd
  FROM scheduled_flights sf
  JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
  JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
  GROUP BY sf.flight_date
)
SELECT
  flight_date::text AS flight_date,
  daily_flights,
  daily_otp_pct,
  ROUND(AVG(daily_otp_pct) OVER (ORDER BY flight_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2) AS rolling_7d_otp_pct,
  avg_arr_delay_mins,
  daily_contribution_usd,
  ROUND(AVG(daily_contribution_usd) OVER (ORDER BY flight_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 0) AS rolling_7d_contribution_usd
FROM daily_metrics
ORDER BY flight_date DESC
LIMIT 30;`,
  },
  {
    id: 'q3_monthly_seasonality',
    title: '03. Monthly Seasonality & Yield Progression',
    category: 'Commercial Performance',
    businessPurpose:
      'Evaluates how load factor, DB1B average base fare, yield (cents/RPM), and contribution evolve from Q1 Winter trough (January/February) into March Spring Shoulder peak travel.',
    sqlFeatures: ['Calendar Dimension Join', 'LAG() Window Comparison', 'Conditional Ratios'],
    sqlText: `WITH monthly_perf AS (
  SELECT
    cd.month_num,
    cd.month_name,
    cd.season,
    COUNT(sf.schedule_id) AS flights,
    SUM(pt.revenue_passengers) AS revenue_pax,
    ROUND((SUM(pt.revenue_passengers)::numeric / NULLIF(SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END), 0)) * 100, 2) AS load_factor_pct,
    ROUND(AVG(tf.avg_base_fare_usd), 2) AS avg_base_fare_usd,
    ROUND(AVG(tf.yield_per_rpm_cents), 2) AS avg_yield_cents,
    ROUND(SUM(rr.total_operating_revenue_usd), 0) AS total_rev_usd,
    ROUND(SUM(rr.estimated_route_contribution_usd), 0) AS contribution_usd
  FROM scheduled_flights sf
  JOIN calendar_dimension cd ON cd.flight_date = sf.flight_date
  JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
  JOIN passenger_traffic pt ON pt.schedule_id = sf.schedule_id
  JOIN ticket_fares tf ON tf.schedule_id = sf.schedule_id
  JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
  GROUP BY cd.month_num, cd.month_name, cd.season
)
SELECT
  month_num,
  month_name,
  season,
  flights,
  revenue_pax,
  load_factor_pct,
  avg_base_fare_usd,
  avg_yield_cents,
  total_rev_usd,
  contribution_usd,
   contribution_usd - LAG(contribution_usd) OVER (ORDER BY month_num) AS mom_contribution_delta_usd
FROM monthly_perf
ORDER BY month_num ASC;`,
  },
  {
    id: 'q4_airport_congestion_delays',
    title: '04. Airport Hub Congestion, Taxi-Out & Weather Delay Comparison',
    category: 'Operational Performance',
    businessPurpose:
      'Quantifies origin airport bottlenecks by correlating hub congestion index and severe weather days against average taxi-out duration, departure delay minutes, and NAS/Weather delay minutes.',
    sqlFeatures: ['Multi-Table Left Join', 'COUNT(DISTINCT)', 'DENSE_RANK()'],
    sqlText: `SELECT
  ap.airport_code,
  ap.city,
  ap.hub_tier,
  ap.congestion_index,
  COUNT(sf.schedule_id) AS departures,
  ROUND(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.taxi_out_mins END), 1) AS avg_taxi_out_mins,
  ROUND(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.actual_dep_delay_mins END), 1) AS avg_dep_delay_mins,
  ROUND((SUM(CASE WHEN fo.is_on_time_arr THEN 1 ELSE 0 END)::numeric / COUNT(sf.schedule_id)) * 100, 2) AS otp_arr_pct,
  SUM(fd.nas_delay_mins) AS total_nas_delay_mins,
  SUM(fd.weather_delay_mins) AS total_weather_delay_mins,
  DENSE_RANK() OVER (ORDER BY AVG(CASE WHEN NOT fo.is_cancelled THEN fo.actual_dep_delay_mins END) DESC) AS delay_severity_rank
FROM scheduled_flights sf
JOIN airports ap ON ap.airport_code = sf.origin_airport
JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
JOIN flight_delays fd ON fd.schedule_id = sf.schedule_id
GROUP BY ap.airport_code, ap.city, ap.hub_tier, ap.congestion_index
ORDER BY delay_severity_rank ASC;`,
  },
  {
    id: 'q5_delay_decomposition',
    title: '05. BTS 5-Bucket Delay Cause Decomposition by Route',
    category: 'Delay & Cancellation Analysis',
    businessPurpose:
      'Breaks down total arrival delay minutes across the 5 official BTS delay categories (Carrier, Extreme Weather, NAS, Security, Late Arriving Aircraft) to isolate controllable vs exogenous disruptions.',
    sqlFeatures: ['Conditional Sum', 'Percentage Share Decomposition', 'Calculated Financial Cost'],
    sqlText: `SELECT
  sf.route_code,
  SUM(CASE WHEN fo.is_delayed_15 THEN 1 ELSE 0 END) AS delayed_15_flights,
  SUM(fd.carrier_delay_mins) AS carrier_mins,
  SUM(fd.weather_delay_mins) AS weather_mins,
  SUM(fd.nas_delay_mins) AS nas_mins,
  SUM(fd.late_aircraft_delay_mins) AS late_aircraft_mins,
  SUM(fd.security_delay_mins) AS security_mins,
  SUM(fd.carrier_delay_mins + fd.weather_delay_mins + fd.nas_delay_mins + fd.late_aircraft_delay_mins + fd.security_delay_mins) AS total_delay_mins,
  ROUND(
    (SUM(fd.late_aircraft_delay_mins + fd.carrier_delay_mins)::numeric /
     NULLIF(SUM(fd.carrier_delay_mins + fd.weather_delay_mins + fd.nas_delay_mins + fd.late_aircraft_delay_mins + fd.security_delay_mins), 0)) * 100, 1
  ) AS controllable_rotational_share_pct,
  ROUND(SUM(rr.assumed_disruption_cost_usd), 0) AS est_disruption_cost_usd
FROM scheduled_flights sf
JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
JOIN flight_delays fd ON fd.schedule_id = sf.schedule_id
JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
GROUP BY sf.route_code
ORDER BY total_delay_mins DESC;`,
  },
  {
    id: 'q6_cancellation_impact',
    title: '06. Cancellation Root-Cause & Unrecovered Revenue Analysis',
    category: 'Delay & Cancellation Analysis',
    businessPurpose:
      'Analyzes cancelled flights by BTS cancellation code (A: Carrier, B: Weather, C: NAS) and estimates direct disruption penalty costs and seat capacity lost.',
    sqlFeatures: ['Inner Join Cancellations', 'Window Share SUM() OVER ()'],
    sqlText: `SELECT
  c.cancellation_code,
  c.cancellation_reason,
  COUNT(c.cancellation_id) AS cancelled_flights,
  ROUND((COUNT(c.cancellation_id)::numeric / SUM(COUNT(c.cancellation_id)) OVER ()) * 100, 1) AS pct_of_cancellations,
  SUM(pt.available_seats) AS lost_seat_capacity,
  ROUND(AVG(c.unrecovered_pax_ratio) * 100, 1) AS avg_unrecovered_pax_pct,
  ROUND(SUM(rr.assumed_disruption_cost_usd), 0) AS total_cancellation_penalty_usd
FROM cancellations c
JOIN scheduled_flights sf ON sf.schedule_id = c.schedule_id
JOIN passenger_traffic pt ON pt.schedule_id = sf.schedule_id
JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
GROUP BY c.cancellation_code, c.cancellation_reason
ORDER BY cancelled_flights DESC;`,
  },
  {
    id: 'q7_capacity_utilisation',
    title: '07. Fleet Gauge & Aircraft Capacity Utilisation Efficiency',
    category: 'Capacity Planning',
    businessPurpose:
      'Evaluates aircraft sub-fleet deployment (B738, A321, B739, A320, B752, E175) against achieved load factor, block-hour direct operating cost assumptions, and contribution per departure.',
    sqlFeatures: ['Aircraft Capacity Join', 'Operating Cost Assumptions Join'],
    sqlText: `SELECT
  ac.aircraft_code,
  ac.manufacturer || ' ' || ac.model_name AS aircraft_model,
  ac.total_seats,
  COUNT(sf.schedule_id) AS total_departures,
  ROUND((SUM(pt.revenue_passengers)::numeric / NULLIF(SUM(CASE WHEN NOT fo.is_cancelled THEN pt.available_seats ELSE 0 END), 0)) * 100, 2) AS load_factor_pct,
  oca.fuel_gallons_per_block_hr,
  oca.crew_cost_per_block_hr,
  ROUND(AVG(rr.assumed_total_direct_cost_usd), 0) AS avg_direct_cost_per_flight,
  ROUND(AVG(rr.estimated_route_contribution_usd), 0) AS avg_contribution_per_flight
FROM scheduled_flights sf
JOIN aircraft_capacity ac ON ac.aircraft_code = sf.aircraft_code
JOIN operating_cost_assumptions oca ON oca.aircraft_code = sf.aircraft_code
JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
JOIN passenger_traffic pt ON pt.schedule_id = sf.schedule_id
JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
GROUP BY ac.aircraft_code, ac.manufacturer, ac.model_name, ac.total_seats, oca.fuel_gallons_per_block_hr, oca.crew_cost_per_block_hr
ORDER BY avg_contribution_per_flight DESC;`,
  },
  {
    id: 'q8_fare_yield_analysis',
    title: '08. DB1B Fare Basis, Ancillary Attach & Distance Yield Curve',
    category: 'Revenue Analytics',
    businessPurpose:
      'Examines how ticket base fare, ancillary revenue per passenger, and yield per Revenue Passenger Mile (RPM) scale across short-haul shuttle vs long-haul premium transcon markets.',
    sqlFeatures: ['Route Market Segmentation', 'Yield Calculation', 'NTILE(4) Quartiles'],
    sqlText: `SELECT
  r.route_code,
  r.market_type,
  r.distance_miles,
  tf.db1b_fare_basis,
  ROUND(AVG(tf.avg_base_fare_usd), 2) AS avg_base_fare_usd,
  ROUND(AVG(tf.ancillary_rev_per_pax_usd), 2) AS avg_ancillary_usd,
  ROUND(AVG(tf.total_fare_per_pax_usd), 2) AS avg_total_fare_usd,
  ROUND(AVG(tf.yield_per_rpm_cents), 2) AS yield_per_rpm_cents,
  NTILE(4) OVER (ORDER BY AVG(tf.yield_per_rpm_cents) DESC) AS yield_quartile
FROM scheduled_flights sf
JOIN routes r ON r.route_code = sf.route_code
JOIN ticket_fares tf ON tf.schedule_id = sf.schedule_id
GROUP BY r.route_code, r.market_type, r.distance_miles, tf.db1b_fare_basis
ORDER BY yield_per_rpm_cents DESC;`,
  },
  {
    id: 'q9_turnaround_buffer_bottleneck',
    title: '09. Turnaround Buffer & Late-Aircraft Cascading Delay Bottleneck',
    category: 'Operational Efficiency',
    businessPurpose:
      'Demonstrates how tight scheduled aircraft turnaround buffers (<45 mins) and afternoon/evening departure waves amplify rotational Late-Aircraft delays and erode route contribution.',
    sqlFeatures: ['CASE Bucket Segmentation', 'Correlation Aggregation'],
    sqlText: `SELECT
  CASE
    WHEN sf.turnaround_buffer_mins < 40 THEN '1. Tight Buffer (<40 min)'
    WHEN sf.turnaround_buffer_mins BETWEEN 40 AND 52 THEN '2. Standard Buffer (40-52 min)'
    ELSE '3. Cushioned Buffer (>52 min)'
  END AS turnaround_tier,
  COUNT(sf.schedule_id) AS flights,
  ROUND(AVG(sf.turnaround_buffer_mins), 1) AS avg_buffer_mins,
  ROUND((SUM(CASE WHEN fo.is_on_time_arr THEN 1 ELSE 0 END)::numeric / COUNT(sf.schedule_id)) * 100, 2) AS otp_arr_pct,
  ROUND(AVG(CASE WHEN NOT fo.is_cancelled THEN fo.actual_arr_delay_mins END), 1) AS avg_arr_delay_mins,
  ROUND(AVG(fd.late_aircraft_delay_mins), 1) AS avg_late_aircraft_mins,
  ROUND(AVG(rr.assumed_disruption_cost_usd), 0) AS avg_disruption_cost_per_flight
FROM scheduled_flights sf
JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
JOIN flight_delays fd ON fd.schedule_id = sf.schedule_id
JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
GROUP BY 1
ORDER BY 1 ASC;`,
  },
  {
    id: 'q10_scenario_baseline_prep',
    title: '10. Scenario Baseline Input Preparation Matrix by Route',
    category: 'Scenario Planning',
    businessPurpose:
      'Prepares baseline route parameters (frequency, mean seats per departure, load factor, average fare, block hours, fuel burn gallons, and delay minutes) consumed by the interactive Scenario Planner.',
    sqlFeatures: ['Multi-Table Aggregation', 'Block-Hour Fuel Burn Parameterization'],
    sqlText: `SELECT
  r.route_code,
  r.typical_block_mins,
  COUNT(sf.schedule_id) AS baseline_flights,
  ROUND(AVG(pt.available_seats), 1) AS avg_seats_per_flight,
  ROUND(AVG(CASE WHEN NOT fo.is_cancelled THEN pt.load_factor END) * 100, 2) AS baseline_lf_pct,
  ROUND(AVG(tf.avg_base_fare_usd), 2) AS baseline_base_fare_usd,
  ROUND(AVG(tf.ancillary_rev_per_pax_usd), 2) AS baseline_ancillary_usd,
  ROUND(AVG(oca.fuel_gallons_per_block_hr), 1) AS avg_fuel_gal_per_block_hr,
  ROUND(SUM(rr.total_operating_revenue_usd), 0) AS baseline_total_rev_usd,
  ROUND(SUM(rr.assumed_total_direct_cost_usd), 0) AS baseline_direct_cost_usd,
  ROUND(SUM(rr.estimated_route_contribution_usd), 0) AS baseline_contribution_usd
FROM scheduled_flights sf
JOIN routes r ON r.route_code = sf.route_code
JOIN flight_operations fo ON fo.schedule_id = sf.schedule_id
JOIN passenger_traffic pt ON pt.schedule_id = sf.schedule_id
JOIN ticket_fares tf ON tf.schedule_id = sf.schedule_id
JOIN operating_cost_assumptions oca ON oca.aircraft_code = sf.aircraft_code
JOIN revenue_records rr ON rr.schedule_id = sf.schedule_id
GROUP BY r.route_code, r.typical_block_mins
ORDER BY baseline_contribution_usd DESC;`,
  },
];
