# AeroIntel — Airline Commercial & Operations Intelligence

**Enterprise Decision-Support Platform for Airline Revenue, Route Profitability, Delay Decomposition, Leakage-Safe Predictive Modeling & PostgreSQL Analytics**

---

## 1. Product Overview & Business Objectives

**AeroIntel** is an airline commercial analytics and operations research decision-support application built for airline network planning, revenue management, and system operations control (SOC) teams. It enables commercial and operational analysts to answer:

- **Commercial Performance & Route Profitability**: Which Origin & Destination (O&D) routes generate the strongest direct contribution, and which suffer from weak seat capacity utilisation or yield dilution?
- **Seasonality & Load Factor Dynamics**: How do load factor, DB1B base ticket fares, ancillary attach rates, and RASK/CASK spreads evolve across Q1 Winter trough (January–February) versus March Spring shoulder peak travel?
- **Operational Disruption & Bottleneck Diagnosis**: How do delays and cancellations decompose across the 5 official US DOT / BTS categories (*Air Carrier, Extreme Weather, National Aviation System, Security, Late Arriving Aircraft*), and how do tight ground turnaround buffers (<42 minutes) amplify afternoon rotational delays?
- **Pre-Departure Predictive Decision Support**: Given strictly pre-departure features known at T-2h, what is the calibrated probability of an A14 arrival disruption ($\ge 15$ minutes delay or cancellation) across 5 machine learning architectures?
- **Parametric Scenario & Sensitivity Planning**: How do changes in flight frequency, aircraft gauge, ticket fares, demand elasticity, Jet-A fuel spot price, and target On-Time Performance affect estimated route contribution?

---

## 2. System Architecture

1. **Relational Analytical Engine (`src/db/pgEngine.ts` & `src/db/queries.ts`)**:
   - Powered by an embedded **PostgreSQL** engine (`@electric-sql/pglite`) executing full PostgreSQL DDL and analytical queries in-browser with zero latency.
   - Implements all **14 normalized relational tables** with primary keys, foreign key constraints, `CHECK` constraints, and composite indexes.
   - Uses advanced PostgreSQL analytical constructs: Common Table Expressions (`WITH`), window functions (`RANK() OVER`, `DENSE_RANK() OVER`, `LAG() OVER`, `NTILE(4) OVER`, and rolling 7-day window frames `AVG(...) OVER (ORDER BY flight_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)`).

2. **Cloud Persistence & Security Layer (`src/lib/firebase.ts`, `firebase-blueprint.json`, `firestore.rules`)**:
   - Integrates **Firebase Authentication** (Google Sign-In) and **Cloud Firestore** to persist analyst-authored commercial scenarios (`/saved_scenarios`), custom SQL queries (`/saved_queries`), and Form 41 aircraft cost assumption overrides (`/cost_overrides`).
   - Enforces Zero-Trust Attribute-Based Access Control (ABAC) in `firestore.rules`, validated via `@firebase/eslint-plugin-security-rules`.

3. **Leakage-Safe Machine Learning Engine (`src/analytics/predictiveModels.ts`)**:
   - Trains and evaluates 5 binary classifiers (*Logistic Regression, CART Decision Tree, Random Forest, Gradient Boosting, and 2nd-Order Regularized XGBoost*) directly on time-split PostgreSQL queries.

---

## 3. Data Sources, Provenance & Limitations

- **BTS Calibration & Provenance**:
  - The baseline dataset (`data_source_type = 'BTS_CALIBRATED_PUBLIC'`) spans **Q1 2026 (January 1, 2026 – March 31, 2026)** across **6 US Major Carriers** (`DL, UA, AA, WN, B6, AS`), **12 Major US Hub Airports** (`JFK, LAX, ORD, ATL, DFW, SFO, DEN, SEA, MIA, BOS, EWR, MCO`), **6 Aircraft Sub-Fleets** (`B738, A321, B739, A320, B752, E175`), and **18 O&D Routes** (~2,250 scheduled flight records).
  - Route distances, block times, load factor distributions, base ticket fares, and 5-bucket delay causes are calibrated to public **US Bureau of Transportation Statistics (BTS)** distributions (*Form 41 T-100 Domestic Segment traffic, DB1B 10% Origin & Destination Ticket Survey, and On-Time Performance 5-Cause Delay Reporting*).
  - Direct operating cost parameters are calibrated to **US DOT Form 41 Schedule P-5.2** direct aircraft block-hour benchmarks.
- **Reproducible CSV Ingestion**:
  - Analysts can upload custom flight observation CSV datasets via the **SQL Analytics -> CSV Flight Data Ingestion** workflow. Imported rows are validated against the relational schema and explicitly tagged with `data_source_type = 'USER_CSV_IMPORT'`.
- **Epistemic Integrity**:
  - The platform never claims synthetic or modeled cost parameters are audited airline corporate net profit. Every financial view explicitly separates **Observed Ticket Revenue**, **Estimated Ancillary/Cargo Revenue**, **Assumed Direct Operating Costs**, and **Estimated Direct Route Contribution**.

---

## 4. Complete 14-Table PostgreSQL Data Dictionary

| # | Table Name | Primary Key | Foreign Keys & Core Attributes |
| :--- | :--- | :--- | :--- |
| 1 | `airlines` | `airline_code` | `airline_name`, `carrier_group`, `hub_airports`, `fleet_size` |
| 2 | `airports` | `airport_code` | `airport_name`, `city`, `state_code`, `latitude`, `longitude`, `hub_tier`, `congestion_index` |
| 3 | `routes` | `route_code` | `origin_airport -> airports`, `dest_airport -> airports`, `distance_miles`, `typical_block_mins`, `market_type`, `slot_controlled` |
| 4 | `scheduled_flights` | `schedule_id` | `flight_number`, `airline_code -> airlines`, `route_code -> routes`, `origin_airport -> airports`, `dest_airport -> airports`, `aircraft_code -> aircraft_capacity`, `flight_date -> calendar_dimension`, `sched_dep_hour`, `turnaround_buffer_mins`, `data_source_type` |
| 5 | `flight_operations` | `operation_id` | `schedule_id -> scheduled_flights`, `actual_dep_delay_mins`, `actual_arr_delay_mins`, `actual_block_mins`, `taxi_out_mins`, `taxi_in_mins`, `is_cancelled`, `is_diverted`, `is_on_time_dep`, `is_on_time_arr`, `is_delayed_15` |
| 6 | `flight_delays` | `delay_id` | `schedule_id -> scheduled_flights`, `carrier_delay_mins`, `weather_delay_mins`, `nas_delay_mins`, `security_delay_mins`, `late_aircraft_delay_mins`, `primary_delay_cause` |
| 7 | `cancellations` | `cancellation_id` | `schedule_id -> scheduled_flights`, `cancellation_code` (A/B/C), `cancellation_reason`, `unrecovered_pax_ratio` |
| 8 | `aircraft_capacity` | `aircraft_code` | `manufacturer`, `model_name`, `total_seats`, `first_business_seats`, `economy_seats`, `cargo_payload_kg`, `cruise_speed_kts` |
| 9 | `passenger_traffic` | `traffic_id` | `schedule_id -> scheduled_flights`, `available_seats`, `revenue_passengers`, `non_rev_passengers`, `load_factor`, `connecting_pax_share`, `cargo_tons` |
| 10 | `ticket_fares` | `fare_id` | `schedule_id -> scheduled_flights`, `avg_base_fare_usd`, `ancillary_rev_per_pax_usd`, `total_fare_per_pax_usd`, `yield_per_rpm_cents`, `db1b_fare_basis` |
| 11 | `revenue_records` | `revenue_id` | `schedule_id -> scheduled_flights`, `observed_ticket_revenue_usd`, `estimated_ancillary_revenue_usd`, `estimated_cargo_revenue_usd`, `total_operating_revenue_usd`, `assumed_fuel_cost_usd`, `assumed_crew_maint_cost_usd`, `assumed_station_pax_cost_usd`, `assumed_disruption_cost_usd`, `assumed_total_direct_cost_usd`, `estimated_route_contribution_usd`, `rask_cents`, `cask_direct_cents` |
| 12 | `operating_cost_assumptions` | `aircraft_code` | `aircraft_code -> aircraft_capacity`, `fuel_gallons_per_block_hr`, `default_fuel_price_per_gal`, `crew_cost_per_block_hr`, `maintenance_cost_per_block_hr`, `aircraft_ownership_per_block_hr`, `landing_navigation_fee_per_dep`, `ground_handling_per_turn`, `pax_service_cost_per_pax`, `delay_cost_per_min`, `cancellation_penalty_per_flight`, `assumption_source` |
| 13 | `weather_observations` | `weather_id` | `airport_code -> airports`, `obs_date -> calendar_dimension`, `temp_celsius`, `wind_speed_kts`, `precip_mm`, `visibility_miles`, `severe_weather_flag`, `weather_severity_index` |
| 14 | `calendar_dimension` | `flight_date` | `year_num`, `quarter_num`, `month_num`, `month_name`, `day_of_month`, `day_of_week`, `day_name`, `is_weekend`, `season`, `is_peak_travel`, `jet_fuel_spot_usd_gal` |

---

## 5. Predictive Modeling Methodology & Leakage Prevention

- **Target Variable**: Binary disruption indicator $Y \in \{0, 1\}$, where $Y = 1$ if `actual_arr_delay_mins >= 15` (DOT A14 failure) or `is_cancelled = TRUE`, else $0$.
- **Strict Temporal Split**:
  - Training window: `flight_date < splitCutoffDate` (default `2026-03-01`, $N_{\text{train}} \approx 1,480$ flights).
  - Out-of-time evaluation window: `flight_date >= splitCutoffDate` ($N_{\text{test}} \approx 770$ flights).
- **Feature Engineering & Leakage Safeguards**:
  - Only features available at the declared pre-departure decision time (T-2h) are used: `sched_dep_hour`, `turnaround_buffer_mins`, `origin_weather_severity_index`, `origin_congestion_index`, empirical-Bayes smoothed historical route disruption rate (computed **exclusively** on the training split), `dest_weather_severity_index`, `dest_congestion_index`, `slot_controlled`, and `is_peak_travel`.
  - Post-departure realizations (`actual_dep_delay_mins`, `taxi_out_mins`) are strictly excluded.
- **Evaluated Classifiers**:
  1. **XGBoost (2nd-Order Regularized Newton-Raphson Boosted Trees)**
  2. **Gradient Boosting (First-Order Stagewise Additive Regression Trees)**
  3. **Random Forest (15 Bootstrap Aggregated CART Trees with Feature Subsampling)**
  4. **Logistic Regression (L2-Regularized Batch Gradient Descent on Z-Score Standardized Features)**
  5. **Decision Tree (Single CART Gini-Variance Tree)**
- **Real Computed Metrics**: ROC-AUC (trapezoidal integration), PR-AUC, Precision, Recall, F1-Score, Brier Calibration Score, Confusion Matrix, and Reliability Curves are computed dynamically from out-of-time test set predictions.

---

## 6. Scenario Planning Equations

For a user-selected frequency delta $\Delta F$, seat gauge delta $\Delta G$, fare delta $\Delta P$, exogenous demand shift $\Delta D$, price elasticity $\epsilon$ (default $-0.85$), Jet-A fuel price $P_{\text{fuel}}$, target OTP $\text{OTP}_{\text{sim}}$, and target cancellation rate $\text{Canc}_{\text{sim}}$:

$$\text{Pax}_{\text{sim}} = \min\Big(0.985 \times \text{Seats}_{\text{sim}},\; \text{Pax}_{\text{base}} \times (1 + \Delta D) \times (1 + \Delta P)^{\epsilon} \times (1 + 0.35 \Delta F)\Big)$$

$$\text{FuelCost}_{\text{sim}} = \text{FuelCost}_{\text{base}} \times (1 + \Delta F) \times (1 + 0.45 \Delta G) \times \left(\frac{P_{\text{fuel}}}{\$2.78}\right) \times \left(\frac{100 - \text{Canc}_{\text{sim}}}{100 - \text{Canc}_{\text{base}}}\right)$$

---

## 7. Running Locally

```bash
npm install
npm run dev
```
The development server launches on `http://localhost:3000`.
