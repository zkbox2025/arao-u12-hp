-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "license" TEXT,
    "achievement" TEXT,
    "imageUrl" TEXT,
    "imagePath" TEXT,
    "imageAlt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPageSetting" (
    "id" TEXT NOT NULL DEFAULT 'staff-page-setting',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "topSummaryTitle" TEXT NOT NULL,
    "topSummaryBody" TEXT NOT NULL,
    "leadBody" TEXT NOT NULL,
    "topImageUrl" TEXT,
    "topImagePath" TEXT,
    "topImageAlt" TEXT,

    CONSTRAINT "StaffPageSetting_pkey" PRIMARY KEY ("id")
);
