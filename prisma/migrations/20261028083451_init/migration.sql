-- CreateTable
CREATE TABLE "person" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" TEXT NOT NULL,
    "mobile" TEXT,
    "address" TEXT,
    "id_no" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "registered_by" UUID,
    "registered_at" TIMESTAMPTZ(6),
    "checked_by" UUID,
    "checked_at" TIMESTAMPTZ(6),
    "pin_hash" TEXT,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_role" (
    "person_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "is_main" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "person_role_pkey" PRIMARY KEY ("person_id","role")
);

-- CreateTable
CREATE TABLE "operator_machine" (
    "person_id" UUID NOT NULL,
    "machine_id" UUID NOT NULL,

    CONSTRAINT "operator_machine_pkey" PRIMARY KEY ("person_id","machine_id")
);

-- CreateTable
CREATE TABLE "shift" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "starts" TIME(6) NOT NULL,
    "ends" TIME(6) NOT NULL,

    CONSTRAINT "shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "shift_start" TIMESTAMPTZ(6) NOT NULL,
    "gate_in" TIMESTAMPTZ(6),
    "gate_out" TIMESTAMPTZ(6),
    "gate_by" UUID,
    "on_duty_at" TIMESTAMPTZ(6),
    "on_duty_by" UUID,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_in_charge" (
    "shift_start" TIMESTAMPTZ(6) NOT NULL,
    "shift_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "set_by" UUID NOT NULL,
    "set_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shift_in_charge_pkey" PRIMARY KEY ("shift_start")
);

-- CreateTable
CREATE TABLE "visitor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pass_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT,
    "from_org" TEXT,
    "purpose" TEXT NOT NULL,
    "meet_person_id" UUID,
    "people_count" INTEGER,
    "vehicle_no" TEXT,
    "id_doc" TEXT,
    "carrying" TEXT,
    "time_in" TIMESTAMPTZ(6) NOT NULL,
    "time_out" TIMESTAMPTZ(6),
    "pass_by" UUID NOT NULL,
    "out_by" UUID,

    CONSTRAINT "visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "make_model" TEXT,
    "stage" TEXT NOT NULL,
    "rated_capacity" TEXT,
    "motor_kw" DECIMAL(7,1),
    "hour_meter_start" DECIMAL(9,1),
    "hour_meter_start_at" TIMESTAMPTZ(6),
    "wear_part" TEXT,
    "wear_limit_t" DECIMAL(7,1),
    "notes" TEXT,

    CONSTRAINT "machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stop_reason" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "machine_down" BOOLEAN NOT NULL DEFAULT false,
    "calls_maintenance" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "stop_reason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_field" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stage" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "log_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "machine_id" UUID NOT NULL,
    "operator_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "stopped_at" TIMESTAMPTZ(6),
    "stop_reason_id" UUID,
    "notes" TEXT,
    "entered_by" UUID NOT NULL,

    CONSTRAINT "machine_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_helper" (
    "run_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "run_helper_pkey" PRIMARY KEY ("run_id","person_id")
);

-- CreateTable
CREATE TABLE "prestart_answer" (
    "run_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "answer" BOOLEAN NOT NULL,

    CONSTRAINT "prestart_answer_pkey" PRIMARY KEY ("run_id","field_id")
);

-- CreateTable
CREATE TABLE "run_bypass" (
    "run_id" UUID NOT NULL,
    "remark" TEXT NOT NULL,
    "job_id" UUID,
    "by" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "run_bypass_pkey" PRIMARY KEY ("run_id")
);

-- CreateTable
CREATE TABLE "downtime" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "machine_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "stop_reason_id" UUID,
    "notes" TEXT,
    "job_id" UUID,
    "entered_by" UUID NOT NULL,

    CONSTRAINT "downtime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_reading" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "machine_id" UUID NOT NULL,
    "run_id" UUID,
    "at" TIMESTAMPTZ(6) NOT NULL,
    "vals" JSONB NOT NULL,
    "one_min_kg" DECIMAL(7,2),
    "by" UUID NOT NULL,

    CONSTRAINT "log_reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "greasing_check" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "machine_id" UUID NOT NULL,
    "shift_start" TIMESTAMPTZ(6) NOT NULL,
    "vals" JSONB NOT NULL,
    "by" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "greasing_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bag_count" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "period_from" TIMESTAMPTZ(6) NOT NULL,
    "period_to" TIMESTAMPTZ(6) NOT NULL,
    "bags" INTEGER NOT NULL,
    "kg_per_bag" DECIMAL(5,1) NOT NULL DEFAULT 25,
    "entered_by" UUID NOT NULL,
    "entered_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bag_count_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_job" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" TEXT NOT NULL,
    "machine_id" UUID NOT NULL,
    "problem" TEXT NOT NULL,
    "note" TEXT,
    "when_needed" TEXT,
    "reported_by" UUID NOT NULL,
    "reported_at" TIMESTAMPTZ(6) NOT NULL,
    "machine_stopped" BOOLEAN NOT NULL DEFAULT false,
    "downtime_id" UUID,
    "fitter_id" UUID,
    "started_at" TIMESTAMPTZ(6),
    "fixed_at" TIMESTAMPTZ(6),
    "work_done" TEXT,
    "parts_used" TEXT,

    CONSTRAINT "maintenance_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pm_task" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "machine_id" UUID NOT NULL,
    "equipment" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "every_hours" DECIMAL(8,1),
    "every_days" INTEGER,
    "counts" TEXT,
    "lubricant" TEXT,
    "source" TEXT,
    "operator_can_do" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pm_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pm_done" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID,
    "machine_id" UUID NOT NULL,
    "done_at" TIMESTAMPTZ(6) NOT NULL,
    "by" UUID NOT NULL,
    "hour_meter" DECIMAL(9,1),
    "minutes" INTEGER,
    "note" TEXT,

    CONSTRAINT "pm_done_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hour_meter_reading" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "machine_id" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL,
    "hours" DECIMAL(9,1) NOT NULL,
    "by" UUID NOT NULL,

    CONSTRAINT "hour_meter_reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reg_no" TEXT,
    "meter" TEXT NOT NULL,

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_vehicle" (
    "person_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,

    CONSTRAINT "driver_vehicle_pkey" PRIMARY KEY ("person_id","vehicle_id")
);

-- CreateTable
CREATE TABLE "vehicle_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "stopped_at" TIMESTAMPTZ(6),
    "meter_start" DECIMAL(9,1),
    "meter_end" DECIMAL(9,1),
    "job" TEXT,

    CONSTRAINT "vehicle_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diesel_fill" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_id" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL,
    "litres" DECIMAL(7,1) NOT NULL,
    "meter" DECIMAL(9,1),
    "by" UUID NOT NULL,

    CONSTRAINT "diesel_fill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "power_reading" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "at" TIMESTAMPTZ(6) NOT NULL,
    "kwh_meter" DECIMAL(12,1) NOT NULL,
    "load_kw" DECIMAL(7,1),
    "power_factor" DECIMAL(3,2),
    "by" UUID NOT NULL,

    CONSTRAINT "power_reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "feed_stage" TEXT,
    "bag_kg" DECIMAL(5,1),
    "notes" TEXT,

    CONSTRAINT "material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "pan" TEXT,
    "usually_supplies" TEXT,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "pan_vat" TEXT,
    "products" TEXT,

    CONSTRAINT "buyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yard" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "letter" TEXT NOT NULL,
    "holds_trucks" INTEGER,

    CONSTRAINT "yard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yard_batch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "yard_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "started_by" UUID,
    "finished_by" UUID,

    CONSTRAINT "yard_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weigh_ticket" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wbsn" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "vehicle_type" TEXT,
    "vehicle_no" TEXT NOT NULL,
    "driver_name" TEXT,
    "driver_contact" TEXT,
    "supplier_id" UUID,
    "buyer_id" UUID,
    "material_id" UUID NOT NULL,
    "first_kg" INTEGER NOT NULL,
    "first_at" TIMESTAMPTZ(6) NOT NULL,
    "second_kg" INTEGER,
    "second_at" TIMESTAMPTZ(6),
    "moisture_1" DECIMAL(4,1),
    "moisture_2" DECIMAL(4,1),
    "moisture_3" DECIMAL(4,1),
    "batch_id" UUID,
    "challan_no" TEXT,
    "po_no" TEXT,
    "vcts_no" TEXT,
    "remarks" TEXT,
    "entered_by" UUID NOT NULL,
    "out_by" UUID,

    CONSTRAINT "weigh_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slip_check" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "serial_no" TEXT NOT NULL,
    "vehicle_no" TEXT,
    "material" TEXT,
    "party_ref" TEXT,
    "gross_kg" INTEGER,
    "tare_kg" INTEGER,
    "net_kg" INTEGER,
    "gross_time" TEXT,
    "tare_time" TEXT,
    "read_how" TEXT NOT NULL,
    "photo_key" TEXT,
    "matches" BOOLEAN NOT NULL,
    "differences" TEXT,
    "by" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "slip_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_stock" (
    "product_id" UUID NOT NULL,
    "as_of" TIMESTAMPTZ(6) NOT NULL,
    "kg" INTEGER NOT NULL,

    CONSTRAINT "opening_stock_pkey" PRIMARY KEY ("product_id","as_of")
);

-- CreateTable
CREATE TABLE "store_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "min_qty" DECIMAL(10,2),
    "rate" DECIMAL(12,2),
    "location" TEXT,

    CONSTRAINT "store_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_movement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "to_person_id" UUID,
    "by" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL,
    "due_back" TIMESTAMPTZ(6),
    "returned_at" TIMESTAMPTZ(6),
    "condition" TEXT,
    "returned_by" UUID,
    "note" TEXT,
    "job_id" UUID,
    "task_id" UUID,
    "pr_id" UUID,

    CONSTRAINT "store_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pr_no" TEXT NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,
    "need_by" DATE,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "reject_reason" TEXT,
    "ordered_by" UUID,
    "ordered_at" TIMESTAMPTZ(6),
    "vendor" TEXT,
    "expected_on" DATE,
    "amount" DECIMAL(12,2),
    "received_by" UUID,
    "received_at" TIMESTAMPTZ(6),

    CONSTRAINT "purchase_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pr_id" UUID NOT NULL,
    "item_id" UUID,
    "description" TEXT,
    "qty" DECIMAL(10,2) NOT NULL,
    "unit" TEXT,

    CONSTRAINT "purchase_request_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "phone_screen" (
    "screen" TEXT NOT NULL,
    "is_on" BOOLEAN NOT NULL DEFAULT true,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6),

    CONSTRAINT "phone_screen_pkey" PRIMARY KEY ("screen")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "table_name" TEXT NOT NULL,
    "record_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "by" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_bill" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "bill_no" TEXT NOT NULL,
    "bill_date" DATE NOT NULL,
    "rate" DECIMAL(8,2) NOT NULL,
    "vat_pct" DECIMAL(4,2) NOT NULL,
    "payment_mode" TEXT NOT NULL,
    "po_no" TEXT,
    "note" TEXT,
    "entered_by" UUID NOT NULL,
    "entered_at" TIMESTAMPTZ(6) NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6),

    CONSTRAINT "sales_bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "direction" TEXT NOT NULL,
    "supplier_id" UUID,
    "buyer_id" UUID,
    "at" TIMESTAMPTZ(6) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "mode" TEXT NOT NULL,
    "ref" TEXT,
    "entered_by" UUID NOT NULL,
    "entered_at" TIMESTAMPTZ(6) NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6),

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_price" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "material_id" UUID NOT NULL,
    "supplier_id" UUID,
    "rate_per_kg" DECIMAL(8,2) NOT NULL,
    "valid_from" DATE NOT NULL,

    CONSTRAINT "raw_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_price" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "buyer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "rate_per_kg" DECIMAL(8,2) NOT NULL,
    "valid_from" DATE NOT NULL,

    CONSTRAINT "sale_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_vat" (
    "product_id" UUID NOT NULL,
    "vat_pct" DECIMAL(4,2) NOT NULL,

    CONSTRAINT "product_vat_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "moisture_standard" (
    "material_id" UUID NOT NULL,
    "standard_pct" DECIMAL(4,1) NOT NULL,

    CONSTRAINT "moisture_standard_pkey" PRIMARY KEY ("material_id")
);

-- CreateTable
CREATE TABLE "daily_wage" (
    "role" TEXT NOT NULL,
    "rupees" DECIMAL(8,2) NOT NULL,

    CONSTRAINT "daily_wage_pkey" PRIMARY KEY ("role")
);

-- CreateTable
CREATE TABLE "nea_tariff" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "demand_per_kva" DECIMAL(8,2) NOT NULL,
    "billed_kva" DECIMAL(8,1) NOT NULL,
    "peak_rate" DECIMAL(6,2) NOT NULL,
    "offpeak_rate" DECIMAL(6,2) NOT NULL,
    "normal_rate" DECIMAL(6,2) NOT NULL,
    "valid_from" DATE NOT NULL,

    CONSTRAINT "nea_tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_test" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_no" TEXT NOT NULL,
    "ticket_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "reading_1" DECIMAL(4,1),
    "reading_2" DECIMAL(4,1),
    "reading_3" DECIMAL(4,1),
    "oven_wet_g" DECIMAL(8,2),
    "oven_dry_g" DECIMAL(8,2),
    "moisture_pct" DECIMAL(4,1),
    "ash_sample_g" DECIMAL(8,3),
    "ash_left_g" DECIMAL(8,3),
    "ash_pct" DECIMAL(4,1),

    CONSTRAINT "lab_test_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "person_mobile_key" ON "person"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_pass_no_key" ON "visitor"("pass_no");

-- CreateIndex
CREATE UNIQUE INDEX "machine_tag_key" ON "machine"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "yard_letter_key" ON "yard"("letter");

-- CreateIndex
CREATE UNIQUE INDEX "weigh_ticket_wbsn_key" ON "weigh_ticket"("wbsn");

-- CreateIndex
CREATE UNIQUE INDEX "store_item_code_key" ON "store_item"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_request_pr_no_key" ON "purchase_request"("pr_no");

-- CreateIndex
CREATE UNIQUE INDEX "sales_bill_ticket_id_key" ON "sales_bill"("ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "lab_test_report_no_key" ON "lab_test"("report_no");

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_registered_by_fkey" FOREIGN KEY ("registered_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_role" ADD CONSTRAINT "person_role_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_machine" ADD CONSTRAINT "operator_machine_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_machine" ADD CONSTRAINT "operator_machine_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_gate_by_fkey" FOREIGN KEY ("gate_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_on_duty_by_fkey" FOREIGN KEY ("on_duty_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_in_charge" ADD CONSTRAINT "shift_in_charge_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_in_charge" ADD CONSTRAINT "shift_in_charge_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_in_charge" ADD CONSTRAINT "shift_in_charge_set_by_fkey" FOREIGN KEY ("set_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor" ADD CONSTRAINT "visitor_meet_person_id_fkey" FOREIGN KEY ("meet_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor" ADD CONSTRAINT "visitor_pass_by_fkey" FOREIGN KEY ("pass_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor" ADD CONSTRAINT "visitor_out_by_fkey" FOREIGN KEY ("out_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_run" ADD CONSTRAINT "machine_run_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_run" ADD CONSTRAINT "machine_run_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_run" ADD CONSTRAINT "machine_run_stop_reason_id_fkey" FOREIGN KEY ("stop_reason_id") REFERENCES "stop_reason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_run" ADD CONSTRAINT "machine_run_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_helper" ADD CONSTRAINT "run_helper_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "machine_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_helper" ADD CONSTRAINT "run_helper_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestart_answer" ADD CONSTRAINT "prestart_answer_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "machine_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestart_answer" ADD CONSTRAINT "prestart_answer_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "log_field"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_bypass" ADD CONSTRAINT "run_bypass_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "machine_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_bypass" ADD CONSTRAINT "run_bypass_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "maintenance_job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_bypass" ADD CONSTRAINT "run_bypass_by_fkey" FOREIGN KEY ("by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime" ADD CONSTRAINT "downtime_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime" ADD CONSTRAINT "downtime_stop_reason_id_fkey" FOREIGN KEY ("stop_reason_id") REFERENCES "stop_reason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime" ADD CONSTRAINT "downtime_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "maintenance_job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime" ADD CONSTRAINT "downtime_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_reading" ADD CONSTRAINT "log_reading_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_reading" ADD CONSTRAINT "log_reading_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "machine_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_reading" ADD CONSTRAINT "log_reading_by_fkey" FOREIGN KEY ("by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "greasing_check" ADD CONSTRAINT "greasing_check_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "greasing_check" ADD CONSTRAINT "greasing_check_by_fkey" FOREIGN KEY ("by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bag_count" ADD CONSTRAINT "bag_count_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bag_count" ADD CONSTRAINT "bag_count_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_job" ADD CONSTRAINT "maintenance_job_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_job" ADD CONSTRAINT "maintenance_job_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_job" ADD CONSTRAINT "maintenance_job_downtime_id_fkey" FOREIGN KEY ("downtime_id") REFERENCES "downtime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_job" ADD CONSTRAINT "maintenance_job_fitter_id_fkey" FOREIGN KEY ("fitter_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_task" ADD CONSTRAINT "pm_task_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_done" ADD CONSTRAINT "pm_done_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "pm_task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_done" ADD CONSTRAINT "pm_done_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_done" ADD CONSTRAINT "pm_done_by_fkey" FOREIGN KEY ("by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hour_meter_reading" ADD CONSTRAINT "hour_meter_reading_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hour_meter_reading" ADD CONSTRAINT "hour_meter_reading_by_fkey" FOREIGN KEY ("by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicle" ADD CONSTRAINT "driver_vehicle_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicle" ADD CONSTRAINT "driver_vehicle_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_session" ADD CONSTRAINT "vehicle_session_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_session" ADD CONSTRAINT "vehicle_session_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diesel_fill" ADD CONSTRAINT "diesel_fill_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diesel_fill" ADD CONSTRAINT "diesel_fill_by_fkey" FOREIGN KEY ("by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_reading" ADD CONSTRAINT "power_reading_by_fkey" FOREIGN KEY ("by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yard_batch" ADD CONSTRAINT "yard_batch_yard_id_fkey" FOREIGN KEY ("yard_id") REFERENCES "yard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yard_batch" ADD CONSTRAINT "yard_batch_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yard_batch" ADD CONSTRAINT "yard_batch_finished_by_fkey" FOREIGN KEY ("finished_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weigh_ticket" ADD CONSTRAINT "weigh_ticket_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weigh_ticket" ADD CONSTRAINT "weigh_ticket_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weigh_ticket" ADD CONSTRAINT "weigh_ticket_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weigh_ticket" ADD CONSTRAINT "weigh_ticket_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "yard_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weigh_ticket" ADD CONSTRAINT "weigh_ticket_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weigh_ticket" ADD CONSTRAINT "weigh_ticket_out_by_fkey" FOREIGN KEY ("out_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slip_check" ADD CONSTRAINT "slip_check_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "weigh_ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slip_check" ADD CONSTRAINT "slip_check_by_fkey" FOREIGN KEY ("by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_stock" ADD CONSTRAINT "opening_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_movement" ADD CONSTRAINT "store_movement_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "store_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_movement" ADD CONSTRAINT "store_movement_to_person_id_fkey" FOREIGN KEY ("to_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_movement" ADD CONSTRAINT "store_movement_by_fkey" FOREIGN KEY ("by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_movement" ADD CONSTRAINT "store_movement_returned_by_fkey" FOREIGN KEY ("returned_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_movement" ADD CONSTRAINT "store_movement_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "maintenance_job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_movement" ADD CONSTRAINT "store_movement_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "pm_task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_movement" ADD CONSTRAINT "store_movement_pr_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "purchase_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request" ADD CONSTRAINT "purchase_request_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request" ADD CONSTRAINT "purchase_request_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request" ADD CONSTRAINT "purchase_request_ordered_by_fkey" FOREIGN KEY ("ordered_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request" ADD CONSTRAINT "purchase_request_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_line" ADD CONSTRAINT "purchase_request_line_pr_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "purchase_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_line" ADD CONSTRAINT "purchase_request_line_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "store_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting" ADD CONSTRAINT "setting_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_screen" ADD CONSTRAINT "phone_screen_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_by_fkey" FOREIGN KEY ("by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_bill" ADD CONSTRAINT "sales_bill_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "weigh_ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_bill" ADD CONSTRAINT "sales_bill_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_bill" ADD CONSTRAINT "sales_bill_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_price" ADD CONSTRAINT "raw_price_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_price" ADD CONSTRAINT "raw_price_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_price" ADD CONSTRAINT "sale_price_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_price" ADD CONSTRAINT "sale_price_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_vat" ADD CONSTRAINT "product_vat_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moisture_standard" ADD CONSTRAINT "moisture_standard_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_test" ADD CONSTRAINT "lab_test_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "weigh_ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules from the map that Prisma cannot express: one open run per machine,
-- one open session per vehicle.
CREATE UNIQUE INDEX "machine_run_one_open_per_machine" ON "machine_run"("machine_id") WHERE "stopped_at" IS NULL;
CREATE UNIQUE INDEX "vehicle_session_one_open_per_vehicle" ON "vehicle_session"("vehicle_id") WHERE "stopped_at" IS NULL;