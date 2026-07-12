-- CreateTable
CREATE TABLE "MonthlyPracticePlan" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "pdfPath" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',

    CONSTRAINT "MonthlyPracticePlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyPracticePlan_status_year_month_idx" ON "MonthlyPracticePlan"("status", "year", "month");
