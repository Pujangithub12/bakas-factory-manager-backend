// Starter data so the app can be used on day one. Safe to run again.
// Names marked "placeholder" are guesses: fix them in the Setup lists.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/prisma";

const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);

async function main() {
  if ((await prisma.shift.count()) === 0) {
    await prisma.shift.createMany({
      data: [
        { name: "Day", starts: time("06:00"), ends: time("18:00") },
        { name: "Night", starts: time("18:00"), ends: time("06:00") },
      ],
    });
  }

  if ((await prisma.stop_reason.count()) === 0) {
    await prisma.stop_reason.createMany({
      data: [
        { name: "End of shift", type: "Planned", machine_down: false, calls_maintenance: false },
        { name: "Breakdown", type: "Unplanned", machine_down: true, calls_maintenance: true },
        { name: "Die change", type: "Planned", machine_down: true, calls_maintenance: true },
        { name: "Power cut", type: "Unplanned", machine_down: true, calls_maintenance: false },
        { name: "No raw material", type: "Unplanned", machine_down: true, calls_maintenance: false },
      ],
    });
  }

  for (const [letter, trucks] of [["A", 17], ["B", 17], ["C", 16]] as const) {
    const have = await prisma.yard.findUnique({ where: { letter } });
    if (!have) await prisma.yard.create({ data: { name: `Yard ${letter}`, letter, holds_trucks: trucks } });
  }

  if ((await prisma.material.count()) === 0) {
    await prisma.material.createMany({
      data: [
        { name: "Ply veneer waste", kind: "Raw", feed_stage: "chip" }, // placeholder feed_stage
        { name: "Wood logs", kind: "Raw", feed_stage: "chip" }, // placeholder feed_stage
        { name: "Banmara", kind: "Raw", feed_stage: "wetmill" }, // placeholder feed_stage
        { name: "Saw dust", kind: "Raw", feed_stage: "dry" }, // placeholder feed_stage
        { name: "Biomass pellet", kind: "Finished product", bag_kg: "25" },
        { name: "Biomass briquette", kind: "Finished product" },
        { name: "Briquette dust", kind: "Finished product" },
      ],
    });
  }

  const machines: [string, string, string, string?][] = [
    ["DC-01", "Chipper 1", "chip"], // placeholder name
    ["FC-01", "Chipper 2", "chip"], // placeholder name
    ["WHM-01", "Wet hammer mill", "wetmill"],
    ["DR-01", "Dryer", "dry"],
    ["BM-01", "Briquette machine", "briquette"],
    ["HM-01", "Hammer mill", "mill"],
    ["PM-01", "Pellet mill", "pellet", "Andritz PM30-5"],
    ["BS-01", "Sharpener", "sharpen"], // placeholder name
  ];
  for (const [tag, name, stage, make_model] of machines) {
    const data = { name, stage, make_model, ...(stage === "briquette" ? { wear_part: "Briquette die set", wear_limit_t: "300" } : {}) };
    await prisma.machine.upsert({ where: { tag }, update: {}, create: { tag, ...data } });
  }

  // The log sheet lines, from the design prototype. Existing lines are updated by key; old pre-start lines that are no longer on a sheet are removed if nothing refers to them.
  type Line = [string, string, string?];
  const sheets: Record<string, { reading: Line[]; prestart: Line[]; greasing: Line[] }> = {
    pellet: {
      reading: [["feedMat", "In-feed raw material"], ["feedRatio", "Raw material ratio"], ["feedMoist", "In-feed moisture", "%"], ["airP", "Air pressure", "kg/cm2"], ["oilP", "Oil pressure", "kg/cm2"],
        ["rollR", "PM roller temp, right", "C"], ["rollL", "PM roller temp, left", "C"], ["hmAmp", "HM load", "A"], ["svLoad", "SV load", "%"], ["cvLoad", "CV load", "%"], ["pmAmp", "PM load", "A"],
        ["dp", "Differential pressure", "bar"], ["outMoist", "Pellet moisture at outlet", "%"]],
      prestart: [["doorBolt", "Door bolt tightened"], ["tShaftBolt", "T shaft bolt"], ["rollNut", "Roll shell nut"], ["greaseR", "Shell grease, right"], ["greaseL", "Shell grease, left"], ["magnet", "Hammer mill magnet cleaned"], ["doorGap", "Door gap"]],
      greasing: [["tShaft", "T shaft greasing", "sec"], ["mainBearing", "Main bearing greasing", "sec"]],
    },
    briquette: {
      reading: [["oneMin", "Output in 1 minute", "kg"], ["feedMoist", "In-feed moisture", "%"], ["oilP", "Oil pressure", "kg/cm2"], ["hmFeed", "HM inlet feeding", "%"], ["hmAmp", "HM section load", "A"],
        ["bqFeed", "Briquette feeding", "%"], ["bqAmp", "Briquette section load", "A"], ["outMoist", "Briquette moisture at outlet", "%"]],
      prestart: [["foundation", "Foundation nuts"], ["belt", "Belt alignment and tension"], ["clean", "Area clean"], ["oilLevel", "Oil level"], ["oilPipe", "Oil distribution pipe"], ["flywheel", "Flywheel check nuts (4)"],
        ["conrod", "Connecting rod bolts (4)"], ["linkpin", "Link pin secure bolts (2)"], ["dieholder", "Die holder clamping bolts (6)"], ["collet", "Collet bolts (3)"]],
      greasing: [],
    },
    dry: {
      reading: [["feedMat", "In-feed raw material"], ["feedRatio", "Raw material ratio"], ["feedMoist", "In-feed avg moisture", "%"], ["outMoist", "Dryer outlet moisture", "%"], ["fuel", "Furnace fuel"],
        ["fuelMoist", "Furnace fuel avg moisture", "%"], ["tIn", "Dryer inlet temperature", "C"], ["tOut", "Dryer outlet temperature", "C"], ["feedPct", "Dryer feeding", "%"], ["amp", "Total amp", "A"]],
      prestart: [["furnace", "Furnace cleaning"], ["preheater", "Pre-heater checking"], ["greasing", "Greasing and temperature checking"], ["preRpm", "Pre-heater RPM"]],
      greasing: [],
    },
  };
  for (const [stage, sheet] of Object.entries(sheets)) {
    for (const kind of ["reading", "prestart", "greasing"] as const) {
      const lines = sheet[kind];
      for (const [i, [field_key, label, unit]] of lines.entries()) {
        const data = { label, unit: unit ?? null, required: field_key === "oneMin", sort: i + 1 };
        const have = await prisma.log_field.findFirst({ where: { stage, kind, field_key } });
        if (have) await prisma.log_field.update({ where: { id: have.id }, data });
        else await prisma.log_field.create({ data: { stage, kind, field_key, ...data } });
      }
      const stale = await prisma.log_field.findMany({ where: { stage, kind, field_key: { notIn: lines.map((l) => l[0]) } } });
      for (const f of stale) await prisma.log_field.delete({ where: { id: f.id } }).catch(() => undefined);
    }
  }

  // Phase 2 starter data, taken from the design prototype: the store list, the maintenance plan and the vehicles.
  // pm_task.counts is "hours" (machine hour meter) or "tons" (briquettes made, for wear parts).
  const p2 = JSON.parse(readFileSync(join(__dirname, "phase2-seed.json"), "utf8")) as {
    store_items: { kind: string; code: string; name: string; unit: string; qty: number; min_qty: number; rate: number; location: string }[];
    pm_tasks: { machine_tag: string; equipment: string; component: string; task: string; every_hours: number | null; every_days: number | null; counts: string; lubricant: string | null; source: string | null; operator_can_do: boolean }[];
  };
  if ((await prisma.store_item.count()) === 0) await prisma.store_item.createMany({ data: p2.store_items });
  if ((await prisma.pm_task.count()) === 0) {
    const ids = new Map((await prisma.machine.findMany({ select: { id: true, tag: true } })).map((m) => [m.tag, m.id]));
    await prisma.pm_task.createMany({ data: p2.pm_tasks.map(({ machine_tag, ...t }) => ({ ...t, machine_id: ids.get(machine_tag)! })) });
  }
  if ((await prisma.vehicle.count()) === 0) {
    await prisma.vehicle.createMany({
      data: [
        { name: "JCB-01", type: "JCB", meter: "hours" },
        { name: "Tractor 2365", type: "Tractor", reg_no: "02-001-TA 2365", meter: "hours" },
        { name: "Tractor 1441", type: "Tractor", reg_no: "02-001-TA 1441", meter: "hours" },
      ],
    });
  }
  const phoneScreens = ["owner", "operator", "driver", "security", "supervisor", "fitter", "store", "weighbridge"];
  if ((await prisma.phone_screen.count()) === 0) await prisma.phone_screen.createMany({ data: phoneScreens.map((screen) => ({ screen, is_on: true })) });

  // Phase 3 starter values from the design prototype. All of them are placeholders: the Owner changes them in Prices.
  const today = new Date(new Date().toISOString().slice(0, 10));
  const mats = new Map((await prisma.material.findMany()).map((m) => [m.name, m.id]));
  if ((await prisma.raw_price.count()) === 0) {
    const raw: [string, number, number][] = [["Ply veneer waste", 5, 56], ["Wood logs", 6, 48], ["Banmara", 5, 52], ["Saw dust", 8, 43]];
    for (const [name, rate, std] of raw) {
      const material_id = mats.get(name);
      if (!material_id) continue;
      await prisma.raw_price.create({ data: { material_id, rate_per_kg: rate, valid_from: today } });
      await prisma.moisture_standard.upsert({ where: { material_id }, update: {}, create: { material_id, standard_pct: std } });
    }
  }
  if ((await prisma.product_vat.count()) === 0) {
    for (const [name, vat] of [["Biomass pellet", 13], ["Biomass briquette", 0], ["Briquette dust", 0]] as const) {
      const product_id = mats.get(name);
      if (product_id) await prisma.product_vat.create({ data: { product_id, vat_pct: vat } });
    }
  }
  if ((await prisma.daily_wage.count()) === 0) {
    const wages = { Operator: 900, Helper: 700, Driver: 900, Fitter: 1000, Security: 750, Supervisor: 1500, Weighbridge: 900, Store: 900, Manager: 2500 };
    await prisma.daily_wage.createMany({ data: Object.entries(wages).map(([role, rupees]) => ({ role, rupees })) });
  }
  if ((await prisma.nea_tariff.count()) === 0) {
    await prisma.nea_tariff.create({ data: { name: "Industrial, 11 kV, time-of-day meter", demand_per_kva: 250, billed_kva: 650, peak_rate: 10.5, offpeak_rate: 5.4, normal_rate: 8.55, valid_from: today } });
  }
  for (const [key, value] of [["moisture_deduction", 1], ["diesel_rate", 155], ["targets", { pellets_t: 30, briquettes_t: 20, kwh_per_t: 220, cover_days: 7 }]] as const) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value, changed_at: new Date() } });
  }

  // No Owner here on purpose: the first time the app opens it asks for the Owner's name and a 6-digit PIN.
  console.log("Seed done.");
}

main().finally(() => prisma.$disconnect());
