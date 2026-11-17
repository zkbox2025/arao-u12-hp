/*
  Warnings:

  - A unique constraint covering the columns `[clubId,requestId,targetId]` on the table `ClubLineDelivery` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ClubLineDelivery_club_request_target_key" ON "ClubLineDelivery"("clubId", "requestId", "targetId");
