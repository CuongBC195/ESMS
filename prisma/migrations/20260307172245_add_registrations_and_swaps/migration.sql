-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SwapStatus" AS ENUM ('PENDING_TARGET', 'PENDING_MANAGER', 'APPROVED', 'REJECTED_TARGET', 'REJECTED_MANAGER');

-- CreateTable
CREATE TABLE "ShiftRegistration" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftSwapRequest" (
    "id" TEXT NOT NULL,
    "requesterShiftId" TEXT NOT NULL,
    "targetShiftId" TEXT NOT NULL,
    "status" "SwapStatus" NOT NULL DEFAULT 'PENDING_TARGET',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftSwapRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftRegistration_employeeId_idx" ON "ShiftRegistration"("employeeId");

-- CreateIndex
CREATE INDEX "ShiftRegistration_departmentId_idx" ON "ShiftRegistration"("departmentId");

-- CreateIndex
CREATE INDEX "ShiftRegistration_status_idx" ON "ShiftRegistration"("status");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_requesterShiftId_idx" ON "ShiftSwapRequest"("requesterShiftId");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_targetShiftId_idx" ON "ShiftSwapRequest"("targetShiftId");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_status_idx" ON "ShiftSwapRequest"("status");

-- AddForeignKey
ALTER TABLE "ShiftRegistration" ADD CONSTRAINT "ShiftRegistration_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRegistration" ADD CONSTRAINT "ShiftRegistration_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRegistration" ADD CONSTRAINT "ShiftRegistration_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ShiftTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_requesterShiftId_fkey" FOREIGN KEY ("requesterShiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_targetShiftId_fkey" FOREIGN KEY ("targetShiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
