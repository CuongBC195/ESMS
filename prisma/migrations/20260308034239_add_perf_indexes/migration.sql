-- CreateIndex
CREATE INDEX "PayrollRecord_payrollPeriodId_idx" ON "PayrollRecord"("payrollPeriodId");

-- CreateIndex
CREATE INDEX "Shift_status_date_idx" ON "Shift"("status", "date");
