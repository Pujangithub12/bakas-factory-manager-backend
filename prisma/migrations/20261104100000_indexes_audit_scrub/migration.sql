-- Indexes for the queries the sync pull and sign-in run on every call.

-- CreateIndex
CREATE INDEX "attendance_shift_start_idx" ON "attendance"("shift_start");

-- CreateIndex
CREATE INDEX "attendance_person_id_shift_start_idx" ON "attendance"("person_id", "shift_start");

-- CreateIndex
CREATE INDEX "audit_log_table_name_record_id_idx" ON "audit_log"("table_name", "record_id");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- CreateIndex
CREATE INDEX "bag_count_period_to_idx" ON "bag_count"("period_to");

-- CreateIndex
CREATE INDEX "diesel_fill_at_idx" ON "diesel_fill"("at");

-- CreateIndex
CREATE INDEX "diesel_fill_vehicle_id_at_idx" ON "diesel_fill"("vehicle_id", "at");

-- CreateIndex
CREATE INDEX "downtime_started_at_idx" ON "downtime"("started_at");

-- CreateIndex
CREATE INDEX "downtime_machine_id_started_at_idx" ON "downtime"("machine_id", "started_at");

-- CreateIndex
CREATE INDEX "greasing_check_at_idx" ON "greasing_check"("at");

-- CreateIndex
CREATE INDEX "hour_meter_reading_at_idx" ON "hour_meter_reading"("at");

-- CreateIndex
CREATE INDEX "hour_meter_reading_machine_id_at_idx" ON "hour_meter_reading"("machine_id", "at");

-- CreateIndex
CREATE INDEX "lab_test_ticket_id_idx" ON "lab_test"("ticket_id");

-- CreateIndex
CREATE INDEX "log_reading_at_idx" ON "log_reading"("at");

-- CreateIndex
CREATE INDEX "log_reading_machine_id_at_idx" ON "log_reading"("machine_id", "at");

-- CreateIndex
CREATE INDEX "machine_run_started_at_idx" ON "machine_run"("started_at");

-- CreateIndex
CREATE INDEX "machine_run_operator_id_stopped_at_idx" ON "machine_run"("operator_id", "stopped_at");

-- CreateIndex
CREATE INDEX "machine_run_machine_id_started_at_idx" ON "machine_run"("machine_id", "started_at");

-- CreateIndex
CREATE INDEX "maintenance_job_reported_at_idx" ON "maintenance_job"("reported_at");

-- CreateIndex
CREATE INDEX "maintenance_job_machine_id_idx" ON "maintenance_job"("machine_id");

-- CreateIndex
CREATE INDEX "payment_at_idx" ON "payment"("at");

-- CreateIndex
CREATE INDEX "person_role_role_idx" ON "person_role"("role");

-- CreateIndex
CREATE INDEX "pin_reset_person_id_idx" ON "pin_reset"("person_id");

-- CreateIndex
CREATE INDEX "pm_done_done_at_idx" ON "pm_done"("done_at");

-- CreateIndex
CREATE INDEX "pm_done_task_id_done_at_idx" ON "pm_done"("task_id", "done_at");

-- CreateIndex
CREATE INDEX "power_reading_at_idx" ON "power_reading"("at");

-- CreateIndex
CREATE INDEX "purchase_request_requested_at_idx" ON "purchase_request"("requested_at");

-- CreateIndex
CREATE INDEX "purchase_request_status_idx" ON "purchase_request"("status");

-- CreateIndex
CREATE INDEX "purchase_request_line_pr_id_idx" ON "purchase_request_line"("pr_id");

-- CreateIndex
CREATE INDEX "run_helper_person_id_idx" ON "run_helper"("person_id");

-- CreateIndex
CREATE INDEX "sales_bill_ticket_id_idx" ON "sales_bill"("ticket_id");

-- CreateIndex
CREATE INDEX "sales_bill_bill_date_idx" ON "sales_bill"("bill_date");

-- CreateIndex
CREATE INDEX "shift_in_charge_person_id_shift_start_idx" ON "shift_in_charge"("person_id", "shift_start");

-- CreateIndex
CREATE INDEX "store_movement_at_idx" ON "store_movement"("at");

-- CreateIndex
CREATE INDEX "vehicle_session_started_at_idx" ON "vehicle_session"("started_at");

-- CreateIndex
CREATE INDEX "vehicle_session_driver_id_started_at_idx" ON "vehicle_session"("driver_id", "started_at");

-- CreateIndex
CREATE INDEX "visitor_time_in_idx" ON "visitor"("time_in");

-- CreateIndex
CREATE INDEX "weigh_ticket_first_at_idx" ON "weigh_ticket"("first_at");

-- CreateIndex
CREATE INDEX "weigh_ticket_direction_first_at_idx" ON "weigh_ticket"("direction", "first_at");

-- CreateIndex
CREATE INDEX "yard_batch_opened_at_idx" ON "yard_batch"("opened_at");


-- The audit log used to copy whole person rows, including the PIN hash and the email. Take those out of the rows already written.
UPDATE "audit_log"
SET "old_values" = "old_values" - 'pin_hash' - 'email' - 'token_version',
    "new_values" = "new_values" - 'pin_hash' - 'email' - 'token_version'
WHERE "table_name" = 'person';
