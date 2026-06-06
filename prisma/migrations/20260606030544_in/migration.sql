-- CreateIndex
CREATE INDEX "FormSubmissionLog_formType_ipHash_createdAt_idx" ON "FormSubmissionLog"("formType", "ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "FormSubmissionLog_formType_emailHash_createdAt_idx" ON "FormSubmissionLog"("formType", "emailHash", "createdAt");

-- CreateIndex
CREATE INDEX "FormSubmissionLog_formType_emailHash_contentHash_createdAt_idx" ON "FormSubmissionLog"("formType", "emailHash", "contentHash", "createdAt");
