// Starter data so the app can be used on day one. Safe to run again.
// Names marked "placeholder" are guesses: fix them in the Setup lists.
import "dotenv/config";
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

  // Only the log sheet lines named in the requirements. The rest go in through the Setup lists.
  if ((await prisma.log_field.count()) === 0) {
    await prisma.log_field.createMany({
      data: [
        { stage: "briquette", kind: "reading", field_key: "oneMin", label: "1-minute output weight", unit: "kg", required: true, sort: 1 },
        { stage: "pellet", kind: "reading", field_key: "svLoad", label: "SV load", unit: "%", required: false, sort: 1 },
        { stage: "pellet", kind: "prestart", field_key: "doorBolt", label: "Door bolts tightened", required: true, sort: 1 },
        { stage: "briquette", kind: "prestart", field_key: "doorBolt", label: "Door bolts tightened", required: true, sort: 1 },
        { stage: "dry", kind: "prestart", field_key: "doorBolt", label: "Door bolts tightened", required: true, sort: 1 },
        { stage: "pellet", kind: "greasing", field_key: "tShaft", label: "T shaft", unit: "sec", required: true, sort: 1 },
        { stage: "pellet", kind: "greasing", field_key: "mainBearing", label: "Main bearing", unit: "sec", required: true, sort: 2 },
      ],
    });
  }

  // No Owner here on purpose: the first time the app opens it asks for the Owner's name and a 6-digit PIN.
  console.log("Seed done.");
}

main().finally(() => prisma.$disconnect());
