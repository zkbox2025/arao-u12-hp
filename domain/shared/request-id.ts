// domain/shared/request-id.ts
// リクエストを識別するrequest-id（UUID v4）の生成・検証を行う。

//UUIDが正規であるかのバリテーション型
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

//新しいrequestIdをUUID v4形式で生成する。
export function createRequestId(): string {
  return globalThis.crypto.randomUUID();
}

//値がUUID v4形式のrequestIdか検証する。
//requestIdはログ追跡や重複送信対策などに使用する識別子であり、
//ユーザー認証・認可の判定には使用しない。
export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}