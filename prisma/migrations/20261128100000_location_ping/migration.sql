-- CreateTable
CREATE TABLE "location_ping" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL,
    "action" TEXT NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "accuracy_m" INTEGER,
    "note" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "location_ping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "location_ping_at_idx" ON "location_ping"("at");

-- CreateIndex
CREATE INDEX "location_ping_person_id_at_idx" ON "location_ping"("person_id", "at");

-- AddForeignKey
ALTER TABLE "location_ping" ADD CONSTRAINT "location_ping_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

