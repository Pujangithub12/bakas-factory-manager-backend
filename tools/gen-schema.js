// Generates backend/prisma/schema.prisma from the factory database map PDF.
// Column line: name type [pk] [opt] [uq] [rs] [fk:table] [def:value] [| doc]
// Types: uuid text bool int ts date time json num<p>.<s>
const fs = require("fs");

const SPEC = `
## 1 person | Everyone: staff, operators, helpers, drivers, guards, and new labourers registered at the gate.
id uuid pk | Made on the phone or laptop, so entries work without signal
full_name text | Name as on the ID
mobile text opt uq | 10 digits; a duplicate mobile is refused
address text opt
id_no text opt | Citizenship or other ID, if they have one
active bool def:true | Inactive people stay in old records
checked bool def:false | False until the supervisor confirms a new worker's details
registered_by uuid opt fk:person | Security guard who registered them
registered_at ts opt
checked_by uuid opt fk:person | Supervisor who confirmed them
checked_at ts opt
pin_hash text opt | Phone sign-in PIN, hashed
## 1 person_role | The jobs a person has. One person can have several. Roles decide which screens they can open.
person_id uuid pk fk:person
role text pk | Owner (super admin), Manager (admin), Supervisor, Operator, Driver, Security, Fitter, Store, Weighbridge
is_main bool def:false | The main job, shown on lists
## 1 operator_machine | Which machines each operator may run. The supervisor ticks them.
person_id uuid pk fk:person
machine_id uuid pk fk:machine
## 1 shift | Day 06:00-18:00 and night 18:00-06:00. The first shift starts the production day.
id uuid pk
name text
starts time
ends time
## 1 attendance | Gate in and out by security, on duty by the supervisor. Belongs to the shift it is for.
id uuid pk
person_id uuid fk:person
shift_id uuid fk:shift
shift_start ts | Start of that shift
gate_in ts opt
gate_out ts opt | Empty while on site
gate_by uuid opt fk:person | Security guard
on_duty_at ts opt | When the supervisor marked them working
on_duty_by uuid opt fk:person
## 1 shift_in_charge | Who is in charge of each shift. At night it changes as needed.
shift_start ts pk
shift_id uuid fk:shift
person_id uuid fk:person | Supervisor, manager, operator, fitter or electrician
set_by uuid fk:person
set_at ts
## 2 visitor | Visitor gate passes, numbered VP-0101 and on.
id uuid pk
pass_no text uq
name text
mobile text opt
from_org text opt | Company or address
purpose text | Meeting, Buyer, Supplier, Delivery, Contractor or repair, Government or inspection, Other
meet_person_id uuid opt fk:person | Who they came to meet
people_count int opt
vehicle_no text opt
id_doc text opt | ID type and number
carrying text opt | Tools or material taken in
time_in ts
time_out ts opt
pass_by uuid fk:person | Security guard
out_by uuid opt fk:person
## 1 machine | The eight machines: DC-01, FC-01, WHM-01, DR-01, BM-01, HM-01, PM-01, BS-01.
id uuid pk
tag text uq | PM-01
name text
make_model text opt | Andritz PM30-5
stage text | chip, wetmill, dry, briquette, mill, pellet, sharpen
rated_capacity text opt | Maker's figure only. Output is never worked out from it
motor_kw num7.1 opt
hour_meter_start num9.1 opt | Meter reading when records start
hour_meter_start_at ts opt
wear_part text opt | Briquette die set
wear_limit_t num7.1 opt | Change after this many tons (300 t)
notes text opt
## 1 stop_reason | Why a machine stopped.
id uuid pk
name text | End of shift, Breakdown, Power cut...
type text | Planned or Unplanned
machine_down bool def:false
calls_maintenance bool def:false
## 1 log_field | The lines of each paper log sheet: hourly readings, pre-start checks and greasing.
id uuid pk
stage text | pellet, briquette, dry
kind text | reading, prestart or greasing
field_key text | svLoad, oneMin, doorBolt...
label text | As on the paper sheet
unit text opt | %, C, A, kg/cm2
required bool def:false | The briquette 1-minute weight is required every hour
sort int def:0
## 1 machine_run | Start and stop of a machine. One open run per machine, locked to the operator who started it. No quantities here.
id uuid pk
machine_id uuid fk:machine
operator_id uuid fk:person | Must be checked in at the gate
started_at ts
stopped_at ts opt | Empty while running
stop_reason_id uuid opt fk:stop_reason
notes text opt
entered_by uuid fk:person
## 1 run_helper | Helpers on a run. Only people checked in and not on another machine.
run_id uuid pk fk:machine_run
person_id uuid pk fk:person
## 1 prestart_answer | The yes/no checks answered at every start.
run_id uuid pk fk:machine_run
field_id uuid pk fk:log_field | A prestart line
answer bool | Yes or No
## 1 run_bypass | A start with a No, run anyway with a remark. Opens a maintenance job.
run_id uuid pk fk:machine_run
remark text | What is wrong and why it is safe to run
job_id uuid opt fk:maintenance_job
by uuid fk:person
at ts
## 1 downtime | Time a machine is down: breakdown, die change, power cut, no raw material.
id uuid pk
machine_id uuid fk:machine
started_at ts
ended_at ts opt
stop_reason_id uuid opt fk:stop_reason
notes text opt
job_id uuid opt fk:maintenance_job | When it called maintenance
entered_by uuid fk:person
## 1 log_reading | One hourly line of the log sheet. Briquette tons = the 1-minute weight x running time, until the next weighing.
id uuid pk
machine_id uuid fk:machine
run_id uuid opt fk:machine_run
at ts
vals json | field_key -> value, for that machine's log_field lines
one_min_kg num7.2 opt | Briquette output in one minute
by uuid fk:person
## 1 greasing_check | Pellet mill greasing once a shift, in seconds.
id uuid pk
machine_id uuid fk:machine
shift_start ts
vals json | T shaft and main bearing seconds
by uuid fk:person
at ts
## 1 bag_count | Pellet bags counted into the store every few hours. Pellet tons = bags x kg per bag.
id uuid pk
product_id uuid fk:material
period_from ts
period_to ts
bags int
kg_per_bag num5.1 def:25
entered_by uuid fk:person | Operator, supervisor or store
entered_at ts
## 1 maintenance_job | Breakdowns, problems reported, bypasses and maintenance requests. Reported -> working on it -> fixed.
id uuid pk
kind text | breakdown, problem, bypass, wear, request, round
machine_id uuid fk:machine
problem text | Strange noise, Overheating... or Maintenance request: part
note text opt
when_needed text opt | Requests: next stop, this week, today
reported_by uuid fk:person
reported_at ts
machine_stopped bool def:false
downtime_id uuid opt fk:downtime
fitter_id uuid opt fk:person | Who took it
started_at ts opt
fixed_at ts opt
work_done text opt
parts_used text opt
## 2 pm_task | The maintenance plan: 51 tasks from the Andritz and FOMA manuals and the lubrication list. Due on running hours or days, whichever comes first.
id uuid pk
machine_id uuid fk:machine | Whose hour meter counts
equipment text | Pellet mill PM30, Cooler PCF020...
component text | Gearbox, Mill bearings, Ring die...
task text
every_hours num8.1 opt | Or tons, see counts
every_days int opt
counts text opt | hours or tons (briquette wear set every 300 t)
lubricant text opt | Grade and amount
source text opt | Manual section
operator_can_do bool def:false | Daily checks, greasing, cleaning, checks
## 2 pm_done | Maintenance done: a plan task, or other work written in.
id uuid pk
task_id uuid opt fk:pm_task | Empty for other work
machine_id uuid fk:machine
done_at ts
by uuid fk:person | Fitter or operator
hour_meter num9.1 opt | At that time
minutes int opt
note text opt
## 2 hour_meter_reading | Real meter readings from the machines, to correct the counted hours now and then.
id uuid pk
machine_id uuid fk:machine
at ts
hours num9.1
by uuid fk:person
## 2 vehicle | JCB-01, Tractor 2365, Tractor 1441.
id uuid pk
name text
type text | JCB, Tractor
reg_no text opt
meter text | hours or km
## 2 driver_vehicle | Which vehicles each driver may drive.
person_id uuid pk fk:person
vehicle_id uuid pk fk:vehicle
## 2 vehicle_session | Start and stop of work with the hour meter. One open session per vehicle.
id uuid pk
vehicle_id uuid fk:vehicle
driver_id uuid fk:person
started_at ts
stopped_at ts opt
meter_start num9.1 opt
meter_end num9.1 opt
job text opt | Feeding the chippers, Moving raw material...
## 2 diesel_fill | Diesel filled, logged by the driver.
id uuid pk
vehicle_id uuid fk:vehicle
at ts
litres num7.1
meter num9.1 opt | At the fill
by uuid fk:person
## 2 power_reading | Main kWh meter read every hour. kWh between readings goes into the NEA time-of-day band of that hour.
id uuid pk
at ts
kwh_meter num12.1 | Cumulative
load_kw num7.1 opt
power_factor num3.2 opt
by uuid fk:person
## 1 material | Raw materials and finished products.
id uuid pk
name text
kind text | Raw or Finished product
feed_stage text opt | First machine for a raw material: chip, wetmill, dry
bag_kg num5.1 opt | Pellets 25
notes text opt
## 1 supplier | Raw material suppliers.
id uuid pk
name text
phone text opt
address text opt
pan text opt
usually_supplies text opt
## 1 buyer | Customers.
id uuid pk
name text
phone text opt
address text opt
pan_vat text opt | Goes on the bill
products text opt
## 1 yard | Yards A, B, C: 17, 17 and 16 trucks.
id uuid pk
name text
letter text uq | Used in batch codes
holds_trucks int opt
## 1 yard_batch | Each filling of a yard (A-08).
id uuid pk
yard_id uuid fk:yard
seq int | A-08 -> 8
opened_at ts
closed_at ts opt | Closed for filling
started_at ts opt | First fed into a machine
finished_at ts opt | Marked empty
started_by uuid opt fk:person
finished_by uuid opt fk:person
## 1 weigh_ticket | One truck at the weighbridge, weighed twice, in kg. In: first = gross, second = tare. Out (sale): first = tare, second = gross.
id uuid pk
wbsn int uq | Weighbridge serial
direction text | in or out
vehicle_type text opt
vehicle_no text | May have Devanagari digits
driver_name text opt
driver_contact text opt
supplier_id uuid opt fk:supplier | Trucks in
buyer_id uuid opt fk:buyer | Sales out
material_id uuid fk:material
first_kg int
first_at ts
second_kg int opt | Empty while on site
second_at ts opt
moisture_1 num4.1 opt | Pins, raw material
moisture_2 num4.1 opt
moisture_3 num4.1 opt
batch_id uuid opt fk:yard_batch | Yard it unloads at
challan_no text opt | Sales: from the challan book, BREL/032; restarts each fiscal year
po_no text opt | Buyer's P.O.
vcts_no text opt
remarks text opt
entered_by uuid fk:person
out_by uuid opt fk:person
## 1 opening_stock | Stock in the store when records start. Stock now = opening + made - sold (worked out, not stored).
product_id uuid pk fk:material
as_of ts pk
kg int
## 2 store_item | Tools and tackles, spares (with part numbers), lubricants and consumables.
id uuid pk
kind text | Tool, Spare, Lubricant, Consumable
code text opt uq | Part no., e.g. 132184541
name text
unit text | pc, set, kg, L
qty num10.2 def:0 | In store now
min_qty num10.2 opt | Below this: alert and a ready-made request
rate num12.2 opt rs | Rs per unit
location text opt | Tool room, Spares rack A...
## 2 store_movement | Stock received, used, and tools out and back.
id uuid pk
item_id uuid fk:store_item
type text | received, issued, tool_out
qty num10.2
to_person_id uuid opt fk:person | Who took it
by uuid fk:person | Store supervisor
at ts
due_back ts opt | Tools: end of shift
returned_at ts opt
condition text opt | OK, Damaged, Missing
returned_by uuid opt fk:person
note text opt
job_id uuid opt fk:maintenance_job
task_id uuid opt fk:pm_task
pr_id uuid opt fk:purchase_request | Received against
## 2 purchase_request | Anyone asks for something the factory needs. Requested -> approved or rejected -> ordered -> received.
id uuid pk
pr_no text uq | PR-0001
requested_by uuid fk:person
requested_at ts
reason text opt
need_by date opt
priority text | Normal or Urgent
status text | Requested, Approved, Rejected, Ordered, Received
approved_by uuid opt fk:person
approved_at ts opt
reject_reason text opt
ordered_by uuid opt fk:person
ordered_at ts opt
vendor text opt
expected_on date opt
amount num12.2 opt rs
received_by uuid opt fk:person
received_at ts opt
## 2 purchase_request_line | Items on a request: a store item or anything written in.
id uuid pk
pr_id uuid fk:purchase_request
item_id uuid opt fk:store_item | Empty if not a store item
description text opt
qty num10.2
unit text opt
## 1 setting | One-off values: company name, address, PAN/VAT, phone, moisture deduction rule, daily targets.
key text pk
value json
changed_by uuid opt fk:person
changed_at ts
## 2 phone_screen | Phone screens and tabs switched on or off by the factory manager or the owner.
screen text pk | store, weighbridge, operator.info...
is_on bool def:true
changed_by uuid opt fk:person
changed_at ts opt
## 1 audit_log | Every insert, change and delete, with who and when. Corrections are made by management and stay visible here.
id uuid pk
table_name text
record_id uuid
action text | insert, update, delete
old_values json opt
new_values json opt
by uuid fk:person
at ts
## 3 sales_bill | The bill from the printed bill book, entered here: same no. as the challan. A cash bill counts as paid.
id uuid pk
ticket_id uuid uq fk:weigh_ticket | One bill per sales truck
bill_no text | 032
bill_date date
rate num8.2 rs | Rs per kg
vat_pct num4.2 rs | Pellets 13, briquettes 0
payment_mode text | Cash, Credit, Other
po_no text opt
note text opt
entered_by uuid fk:person | Manager or finance
entered_at ts
changed_by uuid opt fk:person
changed_at ts opt
## 3 payment | Money paid to suppliers and received from buyers.
id uuid pk
direction text | paid or received
supplier_id uuid opt fk:supplier
buyer_id uuid opt fk:buyer
at ts
amount num12.2 rs
mode text | Bank, Cheque, Cash
ref text opt | Cheque or transfer no.
entered_by uuid fk:person
entered_at ts
changed_by uuid opt fk:person
changed_at ts opt
## 3 raw_price | What we pay per kg of raw material, for all suppliers or one supplier, from a date.
id uuid pk
material_id uuid fk:material
supplier_id uuid opt fk:supplier | Empty = every supplier
rate_per_kg num8.2 rs
valid_from date
## 3 sale_price | What a buyer pays per kg of a product, from a date.
id uuid pk
buyer_id uuid fk:buyer
product_id uuid fk:material
rate_per_kg num8.2 rs
valid_from date
## 3 product_vat | VAT by product.
product_id uuid pk fk:material
vat_pct num4.2 rs
## 3 moisture_standard | Moisture standard per raw material. For each 1% above it, 1% of the weight is not paid.
material_id uuid pk fk:material
standard_pct num4.1
## 3 daily_wage | Wage per shift by role, for the labour cost.
role text pk
rupees num8.2 rs
## 3 nea_tariff | NEA time-of-day tariff: demand charge and peak, off-peak, normal rates.
id uuid pk
name text | Industrial, 11 kV, TOD
demand_per_kva num8.2 rs
billed_kva num8.1
peak_rate num6.2 rs | 17:00-23:00
offpeak_rate num6.2 rs | 23:00-05:00
normal_rate num6.2 rs | 05:00-17:00
valid_from date
## 3 lab_test | A test on a truck. Sales trucks get a printed lab report. On raw material, a lab result replaces the pin readings.
id uuid pk
report_no text uq | LR-0501
ticket_id uuid fk:weigh_ticket
method text | meter, oven, pins
reading_1 num4.1 opt | Moisture meter or pins
reading_2 num4.1 opt
reading_3 num4.1 opt
oven_wet_g num8.2 opt | Hot air oven, 105 C
oven_dry_g num8.2 opt
moisture_pct num4.1 opt | Result
ash_sample_g num8.3 opt | Muffle furnace
ash_left_g num8.3 opt
ash_pct num4.1 opt
`;

// ---- parse ----
const tables = [];
for (const raw of SPEC.split("\n")) {
  const line = raw.trim();
  if (!line) continue;
  if (line.startsWith("## ")) {
    const m = line.match(/^## (\d) (\w+)(?: \| (.*))?$/);
    tables.push({ phase: m[1], name: m[2], doc: m[3] || "", cols: [] });
    continue;
  }
  const [head, doc] = line.split(" | ");
  const t = head.split(/\s+/);
  const col = { name: t[0], type: t[1], pk: false, opt: false, uq: false, rs: false, fk: null, def: null, doc: doc || "" };
  for (const f of t.slice(2)) {
    if (f === "pk") col.pk = true;
    else if (f === "opt") col.opt = true;
    else if (f === "uq") col.uq = true;
    else if (f === "rs") col.rs = true;
    else if (f.startsWith("fk:")) col.fk = f.slice(3);
    else if (f.startsWith("def:")) col.def = f.slice(4);
    else throw new Error(`bad flag ${f} in ${line}`);
  }
  tables[tables.length - 1].cols.push(col);
}

const names = new Set(tables.map((t) => t.name));
const back = {}; // target table -> list of back-relation lines

function prismaType(c) {
  const q = c.opt ? "?" : "";
  const num = c.type.match(/^num(\d+)\.(\d+)$/);
  if (num) return [`Decimal${q}`, `@db.Decimal(${num[1]}, ${num[2]})`];
  switch (c.type) {
    case "uuid": return [`String${q}`, "@db.Uuid"];
    case "text": return [`String${q}`, ""];
    case "bool": return [`Boolean${q}`, ""];
    case "int": return [`Int${q}`, ""];
    case "ts": return [`DateTime${q}`, "@db.Timestamptz(6)"];
    case "date": return [`DateTime${q}`, "@db.Date"];
    case "time": return [`DateTime${q}`, "@db.Time(6)"];
    case "json": return [`Json${q}`, ""];
  }
  throw new Error("bad type " + c.type);
}

function defaultAttr(c, t) {
  if (c.def !== null) return `@default(${c.def})`;
  if (c.pk && c.name === "id" && c.type === "uuid") return `@default(dbgenerated("gen_random_uuid()"))`;
  return "";
}

let out = `generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// Generated from the "Factory database map" (50 tables). Table and column names
// match the map exactly. Phase 1 = gate, weighbridge, machines, production;
// Phase 2 = maintenance plan, store, vehicles, electricity; Phase 3 = money, lab, planning.
// Columns marked "Rs" are owner and accountant only - enforce that in the API.
`;

for (const t of tables) {
  for (const c of t.cols) {
    if (!c.fk) continue;
    if (!names.has(c.fk)) throw new Error(`${t.name}.${c.name} -> unknown ${c.fk}`);
    const relName = `${t.name}_${c.name}`;
    (back[c.fk] ||= []).push(
      c.uq
        ? `  ${relName}_back ${t.name}? @relation("${relName}")`
        : `  ${relName}_back ${t.name}[] @relation("${relName}")`
    );
  }
}

for (const t of tables) {
  out += `\n/// Phase ${t.phase}. ${t.doc}\nmodel ${t.name} {\n`;
  const pks = t.cols.filter((c) => c.pk);
  for (const c of t.cols) {
    const [ty, db] = prismaType(c);
    const attrs = [
      pks.length === 1 && c.pk ? "@id" : "",
      c.uq ? "@unique" : "",
      defaultAttr(c, t),
      db,
    ].filter(Boolean).join(" ");
    const doc = [c.rs ? "Rs (owner and finance only)" : "", c.doc].filter(Boolean).join(". ");
    out += `  ${c.name} ${ty}${attrs ? " " + attrs : ""}${doc ? " /// " + doc : ""}\n`;
  }
  for (const c of t.cols) {
    if (!c.fk) continue;
    const q = c.opt ? "?" : "";
    out += `  ${c.name}_rel ${c.fk}${q} @relation("${t.name}_${c.name}", fields: [${c.name}], references: [id], onDelete: Restrict)\n`;
  }
  for (const b of back[t.name] || []) out += b + "\n";
  if (pks.length > 1) out += `\n  @@id([${pks.map((c) => c.name).join(", ")}])\n`;
  out += `}\n`;
}

// Writes prisma/schema.prisma and src/meta.json (table/column info for the sync API and the app).
const path = require("path");
const root = path.join(__dirname, "..");
fs.writeFileSync(path.join(root, "prisma", "schema.prisma"), out, { encoding: "utf8" });
const meta = {};
for (const t of tables) {
  meta[t.name] = {
    phase: Number(t.phase),
    pk: t.cols.filter((c) => c.pk).map((c) => c.name),
    cols: Object.fromEntries(t.cols.map((c) => [c.name, { type: c.type, opt: c.opt, ...(c.fk ? { fk: c.fk } : {}) }])),
  };
}
const metaJson = JSON.stringify(meta, null, 1) + "\n";
fs.writeFileSync(path.join(root, "src", "meta.json"), metaJson, { encoding: "utf8" });
const mobileSrc = path.join(root, "..", "mobile", "src");
if (fs.existsSync(path.join(root, "..", "mobile"))) {
  fs.mkdirSync(mobileSrc, { recursive: true });
  fs.writeFileSync(path.join(mobileSrc, "meta.json"), metaJson, { encoding: "utf8" });
}
console.log(`${tables.length} models, ${tables.reduce((n, t) => n + t.cols.length, 0)} columns`);
for (const p of ["1", "2", "3"]) console.log(`phase ${p}: ${tables.filter((t) => t.phase === p).length}`);
