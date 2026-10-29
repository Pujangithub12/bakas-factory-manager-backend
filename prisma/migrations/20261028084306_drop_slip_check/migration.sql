/*
  Warnings:

  - You are about to drop the `slip_check` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "slip_check" DROP CONSTRAINT "slip_check_by_fkey";

-- DropForeignKey
ALTER TABLE "slip_check" DROP CONSTRAINT "slip_check_ticket_id_fkey";

-- DropTable
DROP TABLE "slip_check";
