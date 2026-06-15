-- CreateTable
CREATE TABLE "FormNotificationSetting" (
    "formType" "FormType" NOT NULL,
    "emails" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormNotificationSetting_pkey" PRIMARY KEY ("formType")
);
