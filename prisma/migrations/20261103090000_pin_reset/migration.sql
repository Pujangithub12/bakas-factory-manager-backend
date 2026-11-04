-- AlterTable
ALTER TABLE "person" ADD COLUMN     "email" TEXT,
ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "pin_reset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pin_reset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pin_reset_token_hash_key" ON "pin_reset"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "person_email_key" ON "person"("email");

-- AddForeignKey
ALTER TABLE "pin_reset" ADD CONSTRAINT "pin_reset_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

