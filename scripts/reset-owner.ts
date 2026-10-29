// Removes the Owner account so the next launch of the app asks you to set one up (name + 6-digit PIN).
//
//   npm run reset-owner
//
// It only runs when the Owner is the ONLY person in the database. If anyone else exists, or the Owner has
// records (gate entries, runs, tickets...), it stops and changes nothing: the Owner's PIN can then be
// changed from Users & roles instead.
import "dotenv/config";
import { prisma } from "../src/prisma";

async function main() {
  const people = await prisma.person.findMany({ select: { id: true, full_name: true, person_role_person_id_back: { select: { role: true } } } });
  const owners = people.filter((p) => p.person_role_person_id_back.some((r) => r.role === "Owner"));
  if (owners.length === 0) return console.log("There is no Owner. Nothing to do: the app will ask for one at first launch.");
  if (people.length !== 1) return console.log(`There are ${people.length} people, not just the Owner. Nothing changed. Change the Owner's PIN from Users & roles instead.`);
  const owner = owners[0];
  await prisma.$transaction([
    prisma.audit_log.deleteMany({ where: { by: owner.id } }),
    prisma.person_role.deleteMany({ where: { person_id: owner.id } }),
    prisma.person.delete({ where: { id: owner.id } }),
  ]);
  console.log(`Removed the Owner "${owner.full_name}". Open the app to set up the Owner again.`);
}

main()
  .catch((e) => console.error("Nothing changed:", e instanceof Error ? e.message.split("\n").slice(-3).join(" ") : e))
  .finally(() => prisma.$disconnect());
