select
  "lineChannelId",
  "lineBotUserId",
  "webhookKey",
  "lineChannelAccessTokenEncrypted" is not null
    as "hasEncryptedAccessToken",
  "lineChannelSecretEncrypted" is not null
    as "hasEncryptedSecret"
from "ClubLineSetting"
where "clubId" = '9ba5ec8d-b7e9-4b41-8592-c6a3b1ece5c4';