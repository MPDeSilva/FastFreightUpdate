/**
 * Seed sample shipments into the demo SQLite DB so the scanner has things to find.
 * Equipment IDs are short codes that are easy to type into the manual-entry
 * fallback or encode as QR codes for printing.
 */
import Database from 'better-sqlite3';
import path from 'node:path';

const DB_PATH = process.env.DEMO_DB_PATH ?? path.join(__dirname, '..', 'demo.db');
const db = new Database(DB_PATH);

const now = new Date().toISOString();
const samples = [
  { equipment_id: 'EQ-1001', description: 'Booth panel kit (large)', stand_number: 'A12', status: 'Arrived' },
  { equipment_id: 'EQ-1002', description: 'LED wall 4x2',             stand_number: 'A12', status: 'Arrived' },
  { equipment_id: 'EQ-1003', description: 'Flight case — cables',     stand_number: 'A12', status: 'Arrived' },
  { equipment_id: 'EQ-2001', description: 'Reception counter',        stand_number: 'B07', status: 'Arrived' },
  { equipment_id: 'EQ-2002', description: 'Bar stools (set of 4)',    stand_number: 'B07', status: 'Arrived' },
  { equipment_id: 'EQ-2003', description: 'Espresso machine',         stand_number: 'B07', status: 'Arrived' },
  { equipment_id: 'EQ-3001', description: 'Demo product crate #1',    stand_number: 'C03', status: 'Arrived' },
  { equipment_id: 'EQ-3002', description: 'Demo product crate #2',    stand_number: 'C03', status: 'Arrived' },
  { equipment_id: 'EQ-3003', description: 'Signage — pull-up banners',stand_number: 'C03', status: 'Arrived' },
  { equipment_id: 'EQ-3004', description: 'AV rack',                  stand_number: 'C03', status: 'Arrived' },
];

const stmt = db.prepare(
  `INSERT INTO shipments (equipment_id, description, stand_number, status, updated_at)
   VALUES (@equipment_id, @description, @stand_number, @status, @updated_at)
   ON CONFLICT(equipment_id) DO UPDATE SET
     description = excluded.description,
     stand_number = excluded.stand_number,
     status = excluded.status,
     updated_at = excluded.updated_at`
);

const tx = db.transaction(() => {
  for (const s of samples) stmt.run({ ...s, updated_at: now });
});
tx();

console.log(`Seeded ${samples.length} shipments into ${DB_PATH}`);
console.log('Equipment IDs:');
for (const s of samples) console.log(`  ${s.equipment_id.padEnd(10)} ${s.stand_number.padEnd(4)} ${s.description}`);
