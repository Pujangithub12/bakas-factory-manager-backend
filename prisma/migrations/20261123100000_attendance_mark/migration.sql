-- CreateTable
CREATE TABLE "attendance_mark" (
    "person_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "marked_by" UUID NOT NULL,
    "marked_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_mark_pkey" PRIMARY KEY ("person_id","day")
);

-- CreateIndex
CREATE INDEX "attendance_mark_day_idx" ON "attendance_mark"("day");

-- AddForeignKey
ALTER TABLE "attendance_mark" ADD CONSTRAINT "attendance_mark_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_mark" ADD CONSTRAINT "attendance_mark_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

