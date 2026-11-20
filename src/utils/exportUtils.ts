/**
 * AeroIntel — CSV Export, Excel Spreadsheet Export, and Reproducible CSV Ingestion into PostgreSQL
 */
import { getPgDb } from '../db/pgEngine.ts';

export function exportToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? '';
          const str = String(val).replace(/"/g, '""');
          return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
        })
        .join(',')
    ),
  ];
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToExcelXml(filename: string, sheetName: string, rows: Record<string, unknown>[]) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const headerCells = headers
    .map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
    .join('');

  const dataRows = rows
    .map((row) => {
      const cells = headers
        .map((h) => {
          const val = row[h];
          const isNum = typeof val === 'number' && !Number.isNaN(val);
          const type = isNum ? 'Number' : 'String';
          return `<Cell><Data ss:Type="${type}">${escapeXml(String(val ?? ''))}</Data></Cell>`;
        })
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${escapeXml(sheetName.slice(0, 28))}">
  <Table>
   <Row>${headerCells}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const SAMPLE_CSV_TEMPLATE = `flight_date,airline_code,flight_number,origin_airport,dest_airport,aircraft_code,sched_dep_hour,turnaround_buffer_mins,available_seats,revenue_passengers,avg_base_fare_usd,actual_dep_delay_mins,actual_arr_delay_mins,is_cancelled
2026-03-25,DL,DL901,JFK,LAX,B752,18,38,176,162,418.00,28,32,false
2026-03-26,UA,UA882,EWR,SFO,B739,17,41,180,159,429.00,19,22,false
2026-03-27,AA,AA714,ORD,JFK,B738,9,55,166,144,242.00,-2,-5,false
2026-03-28,B6,B6604,BOS,MIA,A321,14,46,196,178,224.00,8,4,false`;

/**
 * Ingests user-uploaded CSV flight observations into the PostgreSQL database
 * with explicit data_source_type = 'USER_CSV_IMPORT' provenance tag.
 */
export async function importCsvFlightsToPostgres(csvText: string): Promise<{
  importedCount: number;
  errors: string[];
}> {
  const db = await getPgDb();
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { importedCount: 0, errors: ['CSV must include a header row and at least one data row.'] };
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const requiredCols = [
    'flight_date',
    'airline_code',
    'flight_number',
    'origin_airport',
    'dest_airport',
    'aircraft_code',
    'available_seats',
    'revenue_passengers',
    'avg_base_fare_usd',
    'actual_dep_delay_mins',
    'actual_arr_delay_mins',
  ];

  for (const req of requiredCols) {
    if (!headers.includes(req)) {
      return { importedCount: 0, errors: [`Missing required CSV column: ${req}`] };
    }
  }

  const maxRes = await db.query<{ max_id: number }>(`SELECT COALESCE(MAX(schedule_id), 50000)::int AS max_id FROM scheduled_flights;`);
  let nextId = Math.max(50001, (maxRes.rows[0]?.max_id || 50000) + 1);

  let importedCount = 0;
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map((v) => v.trim());
    if (vals.length < headers.length) {
      errors.push(`Row ${i + 1}: Column count mismatch.`);
      continue;
    }
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = vals[idx];
    });

    try {
      const sid = nextId++;
      const flightDate = rowObj.flight_date;
      const airlineCode = rowObj.airline_code.toUpperCase();
      const flightNumber = rowObj.flight_number.toUpperCase();
      const orig = rowObj.origin_airport.toUpperCase();
      const dest = rowObj.dest_airport.toUpperCase();
      const routeCode = `${orig}-${dest}`;
      const ac = rowObj.aircraft_code.toUpperCase();
      const depHour = Number(rowObj.sched_dep_hour || 12);
      const bufferMins = Number(rowObj.turnaround_buffer_mins || 48);
      const seats = Number(rowObj.available_seats);
      const pax = Number(rowObj.revenue_passengers);
      const baseFare = Number(rowObj.avg_base_fare_usd);
      const depDelay = Number(rowObj.actual_dep_delay_mins);
      const arrDelay = Number(rowObj.actual_arr_delay_mins);
      const isCanc = rowObj.is_cancelled === 'true' || rowObj.is_cancelled === '1';

      // Ensure route exists
      await db.query(
        `INSERT INTO routes (route_code, origin_airport, dest_airport, distance_miles, typical_block_mins, market_type, slot_controlled)
         VALUES ($1, $2, $3, 1000, 165, 'Imported O&D Market', FALSE)
         ON CONFLICT (route_code) DO NOTHING`,
        [routeCode, orig, dest]
      );

      // Ensure date exists in calendar_dimension
      await db.query(
        `INSERT INTO calendar_dimension (
          flight_date, year_num, quarter_num, month_num, month_name,
          day_of_month, day_of_week, day_name, is_weekend, season, is_peak_travel, jet_fuel_spot_usd_gal
        ) VALUES ($1, 2026, 1, 3, 'March', 25, 3, 'Wednesday', FALSE, 'Spring Shoulder', FALSE, 2.78)
        ON CONFLICT (flight_date) DO NOTHING`,
        [flightDate]
      );

      await db.query(
        `INSERT INTO scheduled_flights (
          schedule_id, flight_number, airline_code, route_code, origin_airport, dest_airport,
          aircraft_code, flight_date, sched_dep_hour, sched_dep_time, sched_arr_time,
          sched_block_mins, turnaround_buffer_mins, data_source_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '12:00', '15:00', 180, $10, 'USER_CSV_IMPORT')`,
        [sid, flightNumber, airlineCode, routeCode, orig, dest, ac, flightDate, depHour, bufferMins]
      );

      const isDelayed15 = !isCanc && arrDelay >= 15;
      await db.query(
        `INSERT INTO flight_operations (
          operation_id, schedule_id, actual_dep_delay_mins, actual_arr_delay_mins,
          actual_block_mins, taxi_out_mins, taxi_in_mins, is_cancelled, is_diverted,
          is_on_time_dep, is_on_time_arr, is_delayed_15
        ) VALUES ($1, $1, $2, $3, 180, 18, 9, $4, FALSE, $5, $6, $7)`,
        [sid, depDelay, arrDelay, isCanc, !isCanc && depDelay < 15, !isCanc && arrDelay < 15, isDelayed15]
      );

      const carrierD = isDelayed15 ? Math.round(arrDelay * 0.5) : 0;
      const lateD = isDelayed15 ? arrDelay - carrierD : 0;
      await db.query(
        `INSERT INTO flight_delays (
          schedule_id, carrier_delay_mins, weather_delay_mins, nas_delay_mins, security_delay_mins, late_aircraft_delay_mins, primary_delay_cause
        ) VALUES ($1, $2, 0, 0, 0, $3, $4)`,
        [sid, carrierD, lateD, isDelayed15 ? 'Carrier / Maintenance / Crew' : 'On Time']
      );

      const lf = seats > 0 ? Number((pax / seats).toFixed(4)) : 0;
      await db.query(
        `INSERT INTO passenger_traffic (
          schedule_id, available_seats, revenue_passengers, non_rev_passengers, load_factor, connecting_pax_share, cargo_tons
        ) VALUES ($1, $2, $3, 2, $4, 0.25, 1.1)`,
        [sid, seats, pax, lf]
      );

      const anc = 26.0;
      await db.query(
        `INSERT INTO ticket_fares (
          schedule_id, avg_base_fare_usd, ancillary_rev_per_pax_usd, total_fare_per_pax_usd, yield_per_rpm_cents, db1b_fare_basis
        ) VALUES ($1, $2, $3, $4, 18.5, 'CSV Imported Fare Basis')`,
        [sid, baseFare, anc, baseFare + anc]
      );

      const obsRev = Number((pax * baseFare).toFixed(2));
      const ancRev = Number((pax * anc).toFixed(2));
      const cargoRev = 480;
      const totRev = obsRev + ancRev + cargoRev;
      const fuelCost = 6400;
      const crewMaint = 7800;
      const stationCost = Number((2100 + pax * 14.5).toFixed(2));
      const disrCost = isCanc ? 16500 : isDelayed15 ? arrDelay * 84 : 0;
      const totCost = fuelCost + crewMaint + stationCost + disrCost;
      const contrib = totRev - totCost;

      await db.query(
        `INSERT INTO revenue_records (
          schedule_id, observed_ticket_revenue_usd, estimated_ancillary_revenue_usd, estimated_cargo_revenue_usd,
          total_operating_revenue_usd, assumed_fuel_cost_usd, assumed_crew_maint_cost_usd, assumed_station_pax_cost_usd,
          assumed_disruption_cost_usd, assumed_total_direct_cost_usd, estimated_route_contribution_usd, rask_cents, cask_direct_cents
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 16.4, 13.8)`,
        [sid, obsRev, ancRev, cargoRev, totRev, fuelCost, crewMaint, stationCost, disrCost, totCost, contrib]
      );

      importedCount++;
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { importedCount, errors };
}
