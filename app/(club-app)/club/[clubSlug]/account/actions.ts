// app/(club-app)/club/[clubSlug]/account/actions.ts
// アカウント情報変更に関するアクションファイル

"use server";

import {
  redirect,
  unstable_rethrow,//Next.jsの画面遷移システムを邪魔しないために、Next.js自身が使うエラーだけを自動的に見分けてスルーさせるための安全装置
} from "next/navigation";

import {
  requireClubAppAccess,//クラブのアプリが使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import type {
  ClubAccessContext,// 認可成功時に返すデータ
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  revalidateClubAccountNamePaths,//クラブアカウント名の更新をした時の影響のあるクラブのページのrevalidatePath実行関数
  revalidateClubAccountPaths,// 子どもの情報を変更したときのクラブのアカウント関連ページのrevalidatePath実行関数
} from "@/app/(club-app)/club/revalidate-club-paths";
import {
  ACCOUNT_NAME_MAX_LENGTH,//アカウント名の最大の長さ（100）
  parseAccountNameFormData,//フォームデータのアカウント名を抜き出して検証し復元する関数
  type AccountNameActionState,//アカウント名のアクションステイトの型
} from "@/domain/club/account/account-form";
import type {
  ClubAccountChildCandidatesResult,//クラブアカウントに紐づけられている子供アカウントの検索結果の型
  ClubAccountMutationResult,//クラブアカウントのデータを変更・更新した結果を表す型
} from "@/domain/club/account/account-types";
import {
  CHILD_GRADE_OPTIONS,//子どもの学年のバリューとラベル一覧
  parseChildFormData,//フォームデータから子どもの名前と学年を抜き出して検証し復元する関数
  parseChildIdFormData,//フォームデータからchildIdを抜き出して検証し復元する関数
  validateChildIdInput,//子どものIDがUUID v4形式かを検証する関数
  type ChildActionState,//子どもに関するアクションステイトの型
  type ChildMembershipActionState,//子どものメンバーシップのアクションステイト
} from "@/domain/club/account/child-form";
import type {
  ActionState,//アクションステイトの型
  FieldErrors,//項目エラーの型
} from "@/domain/shared/action-state";
import {
  createRequestId,//新しいrequestIdをUUID v4形式で生成する。
  isRequestId,//値がUUID v4形式のrequestIdか検証する。
} from "@/domain/shared/request-id";
import {
  getAttachableClubChildren,//子どもアカウントの追加変更候補のデータを取得する関数
} from "@/src/application/club/account/get-club-account";
import {
  addClubChild,//子どものメンバーシップを追加、変更する関数（新規追加、退会ずみをアクティブへ）
  createClubChild,//子どもに関するデータ（名前と学年付き）をDB（childテーブルとchildClubMembershipテーブル）に新規作成する関数
  updateClubAccountName,//ユーザーのアカウント名を更新する関数
  updateClubChild,//DBのchildテーブルにあるデータの子どもの名前と学年を更新し、結果を返す関数
  withdrawClubChild,//子どものメンバーシップを追加、変更する関数（アクティブを退会ずみへ）
} from "@/src/application/club/account/update-club-account";

const EXPIRED_FORM_MESSAGE = "フォームの有効期限が切れました。ページを開き直してください。";
const TARGET_MESSAGE = "対象の子どもを選び直してください。";
const FAILED_MESSAGE = "処理に失敗しました。ページを開き直して確認してください。";

//フォームデータ内のある項目が文字列かつ1件のある場合だけ抜き出して返す。
function singleString(formData: FormData, name: string): string | null {
  const entries = formData instanceof FormData ? formData.getAll(name) : [];//正しいフォームデータの形であれば名前を抜き出す。それ以外は空欄
  return entries.length === 1 && typeof entries[0] === "string" ? entries[0] : null;//nameが一つであり文字列であればnameをそのまま返す
}

//リクエストIDが一致するかをチェックする関数
function checkRequest(previousState: unknown, formData: FormData) {
  const previousId = typeof previousState === "object" &&
    previousState !== null &&
    !Array.isArray(previousState) &&
    "requestId" in previousState
    ? previousState.requestId//上記に当てはまるならpreviousId＝previousState.requestId
    : null;//ひとつでも当てはまらないならpreviousId＝null
  const submittedId = singleString(formData, "requestId");//フォームデータ内のあるrequestIdが文字列かつ1件のある場合だけ抜き出して返す。
  return {
    requestId: isRequestId(previousId) ? previousId : createRequestId(),//previousIdの値がUUID v4形式であればpreviousId。違うなら新しいrequestIdをUUID v4形式で生成する。
    valid: isRequestId(submittedId) &&//submittedIdの値がUUID v4形式である、かつ
      isRequestId(previousId) &&//previousIdの値がUUID v4形式である、かつ
      submittedId === previousId,
  };
}

//エラー時のステイトの型（<TValues> は、ジェネリクス（型引数）でどんな型でも当てはめる）
function errorState<TValues>(
  values: TValues,
  requestId: string,
  formError: string | null,
  fieldErrors: FieldErrors<Extract<keyof TValues, string>> = {},//項目エラーの型に引数を入れる（キーを厳選し文字列のみ取り出す）
): ActionState<TValues> {//アクションステイトの型
  return {
    status: "error",
    values,
    fieldErrors,
    formError,
    requestId,
  };
}

//childIdが一致しているかのチェック関数
function matchesChildTarget(targetChildId: string, formData: FormData): boolean {
  const submitted = parseChildIdFormData(formData);//フォームデータからchildIdを抜き出して検証し復元する関数
  return validateChildIdInput(targetChildId).success &&//子どものIDがUUID v4形式かを検証する関数
    submitted.success &&
    submitted.data.childId === targetChildId;
}

//引数として受け取った処理（operation）をそのまま実行しつつ、エラーが発生したら処理するラッパー関数
async function callMutation(
  operation: () => Promise<ClubAccountMutationResult>,//クラブアカウントのデータを変更・更新した結果を表す型
): Promise<ClubAccountMutationResult> {//クラブアカウントのデータを変更・更新した結果を表す型
  try {
    return await operation();
  } catch (error) {
    unstable_rethrow(error);//Next.jsの画面遷移システムを邪魔しないために、Next.js自身が使うエラーだけを自動的に見分けてスルーさせるための安全装置
    return {
      outcome: "UPDATE_FAILED",
    };
  }
}

//クラブアカウントのデータを変更・更新した結果を受け取り固定メッセージへ変換する関数
function mutationMessage(result: ClubAccountMutationResult): string {//クラブアカウントのデータを変更・更新した結果を表す型
  switch (result.outcome) {
    case "NOT_FOUND":
    case "FORBIDDEN":
      return "対象の情報を更新できません。ページを開き直してください。";
    case "CONFLICT":
      return "同時更新が発生しました。ページを開き直して確認してください。";
    case "RULE_VIOLATION":
      switch (result.reason) {
        case "ALREADY_ACTIVE":
          return "すでに現在クラブへ追加されています。ページを開き直してください。";
        case "ALREADY_WITHDRAWN":
          return "すでに現在クラブから外されています。ページを開き直してください。";
        case "MEMBERSHIP_NOT_FOUND":
          return "現在クラブの所属を確認できません。ページを開き直してください。";
        case "STATUS_CHANGE_NOT_ALLOWED":
          return "現在の所属状態では変更できません。クラブ管理者へ確認してください。";
      }
  }
  return FAILED_MESSAGE;//それ以外は"処理に失敗しました。ページを開き直して確認してください。"を返す
}

//アカウント情報の変更がすべて無事に保存された後に、キャッシュを更新し、適切な通知メッセージを添えてアカウントページへ画面遷移させる関数
function finishSavedAccount(
  access: ClubAccessContext,// 認可成功時に返すデータ
  requestId: string,
  affectedClubSlugs: readonly string[],//影響あるクラブスラッグ
  feedback: string,
  revalidate: typeof revalidateClubAccountPaths,// 子どもの情報を変更したときのクラブのアカウント関連ページのrevalidatePath実行関数
): never {
  let toast = feedback;
  try {
    revalidate(affectedClubSlugs);
  } catch (error) {
    unstable_rethrow(error);//Next.jsの画面遷移システムを邪魔しないために、Next.js自身が使うエラーだけを自動的に見分けてスルーさせるための安全装置
    toast = "saved-reload";//保存自体はできたけれど、キャッシュの即時更新に失敗したから、画面を一度リロード（再読み込み）して最新の状態を反映させたよていう意味
  }
  const query = new URLSearchParams({
    toast,
    toastId: requestId,
  });
  redirect(`/club/${encodeURIComponent(access.club.slug)}/account?${query.toString()}`);
}

//アカウント名を更新するアクション関数（DB保存→リバリデート→画面遷移まで）
export async function updateAccountNameAction(
  clubSlug: string,
  previousState: AccountNameActionState,//アカウント名のアクションステイトの型
  formData: FormData,
): Promise<AccountNameActionState> {//アカウント名のアクションステイトの型
  const access = await requireClubAppAccess(clubSlug);//クラブのアプリが使えるか確認する関数
  const values = {
    name: (singleString(formData, "name") ?? "").slice(0, ACCOUNT_NAME_MAX_LENGTH),//フォームデータ内のある名前が文字列かつ1件のある場合だけ抜き出してアカウント名の最大の長さ（100）にトリミングする
  };
  const request = checkRequest(previousState, formData);//リクエストIDが一致するかをチェックする関数
  if (!request.valid) {
    return errorState(values, request.requestId, EXPIRED_FORM_MESSAGE);//エラー時のステイトの型"にフォームの有効期限が切れました。ページを開き直してください。"などを入れてステイトを返す
  }
  const validation = parseAccountNameFormData(formData);//フォームデータのアカウント名を抜き出して検証し復元する関数
  if (!validation.success) {
    return errorState(values, request.requestId, null, validation.fieldErrors);//エラー時のステイトの型
  }
  const result = await callMutation(() => updateClubAccountName(access, validation.data));//ユーザーのアカウント名を更新する関数を、引数として受け取った処理（operation）をそのまま実行しつつ、エラーが発生したら処理するラッパー関数へ入れて実行する
  if (result.outcome !== "UPDATED") {
    return errorState(values, request.requestId, mutationMessage(result));//エラー時のステイトの型にクラブアカウントのデータを変更・更新した結果を受け取り固定メッセージへ変換したものなどを入れて返す
  }
  finishSavedAccount(//アカウント情報の変更がすべて無事に保存された後に、キャッシュを更新し、適切な通知メッセージを添えてアカウントページへ画面遷移させる関数
    access,
    request.requestId,
    result.affectedClubSlugs,
    "name-saved",
    revalidateClubAccountNamePaths,//クラブアカウント名の更新をした時の影響のあるクラブのページのrevalidatePath実行関数
  );
}

//子どもの名前と学年をDBに保存するアクション関数（DB保存→リバリデート→画面遷移まで）
async function saveChildAction(
  access: ClubAccessContext,// 認可成功時に返すデータ
  targetChildId: string | null,
  previousState: ChildActionState,//子どもに関するアクションステイトの型
  formData: FormData,
  operation: "CREATE" | "UPDATE",
): Promise<ChildActionState> {//子どもに関するアクションステイトの型
  const grade = singleString(formData, "grade");//フォームデータ内のあるgradeが文字列かつ1件のある場合だけ抜き出して返す。
  const selectedGrade = CHILD_GRADE_OPTIONS.find((option) => option.value === grade);//子どもの学年のバリューとラベル一覧から学年を抜き出し、フォームデータの学年と一致するかチェックする
  const values = {
    name: (singleString(formData, "name") ?? "").slice(0, ACCOUNT_NAME_MAX_LENGTH),//フォームデータ内のあるnameが文字列かつ1件のある場合だけ抜き出して返しアカウント名の最大の長さ（100）にトリミングする
    grade: selectedGrade?.value ?? "",
  };
  const request = checkRequest(previousState, formData);//リクエストIDが一致するかをチェックする関数
  if (!request.valid) {
    return errorState(values, request.requestId, EXPIRED_FORM_MESSAGE);//エラー時のステイトの型に"フォームの有効期限が切れました。ページを開き直してください。"などを入れステイトを返す
  }
  const id = validateChildIdInput(//子どものIDがUUID v4形式かを検証する関数
    operation === "CREATE" ? request.requestId : targetChildId,
  );
  if (
    !id.success || (
      operation === "UPDATE" &&
      !matchesChildTarget(id.data.childId, formData)//childIdが一致しているかのチェックがfalse
    )
  ) {
    return errorState(values, request.requestId, TARGET_MESSAGE);//エラー時のステイトの型に"対象の子どもを選び直してください。"などを入れ返す
  }
  const validation = parseChildFormData(formData);//フォームデータから子どもの名前と学年を抜き出して検証し復元する関数
  if (!validation.success) {
    return errorState(values, request.requestId, null, validation.fieldErrors);//エラー時のステイトの型
  }
  const input = {
    childId: id.data.childId,
    name: validation.data.name,
    grade: validation.data.grade,
  };
  const result = await callMutation(() => operation === "CREATE"//operation === "CREATE"なら引数として受け取った処理（operation）をそのまま実行しつつ、エラーが発生したら処理するラッパー関数にcreateClubChild(access, input)を入れて実行、なければupdateClubChild(access, input)を入れて実行
    ? createClubChild(access, input)//子どもに関するデータ（名前と学年付き）をDB（childテーブルとchildClubMembershipテーブル）に新規作成する関数
    : updateClubChild(access, input),);//DBのchildテーブルにあるデータの子どもの名前と学年を更新し、結果を返す関数
  if (result.outcome !== "UPDATED") {
    return errorState(values, request.requestId, mutationMessage(result));//エラー時のステイトの型に//クラブアカウントのデータを変更・更新した結果を受け取り固定メッセージへ変換したものなどを入れて返す
  }
  finishSavedAccount(//アカウント情報の変更がすべて無事に保存された後に、キャッシュを更新し、適切な通知メッセージを添えてアカウントページへ画面遷移させる関数
    access,
    request.requestId,
    result.affectedClubSlugs,
    operation === "CREATE" ? "child-created" : "child-updated",
    revalidateClubAccountPaths,// 子どもの情報を変更したときのクラブのアカウント関連ページのrevalidatePath実行関数
  );
}

//子どもの名前と学年をDBに新規保存するアクション関数（DB保存→リバリデート→画面遷移まで）
export async function createChildAction(
  clubSlug: string,
  previousState: ChildActionState,//子どもに関するアクションステイトの型
  formData: FormData,
): Promise<ChildActionState> {//子どもに関するアクションステイトの型
  const access = await requireClubAppAccess(clubSlug);//クラブのアプリが使えるか確認する関数
  return saveChildAction(access, null, previousState, formData, "CREATE");//子どもの名前と学年をDBに保存するアクション関数（DB保存→リバリデート→画面遷移まで）
}

//子どもの名前と学年をDBに上書き保存するアクション関数（DB保存→リバリデート→画面遷移まで）
export async function updateChildAction(
  clubSlug: string,
  targetChildId: string,
  previousState: ChildActionState,//子どもに関するアクションステイトの型
  formData: FormData,
): Promise<ChildActionState> {//子どもに関するアクションステイトの型
  const access = await requireClubAppAccess(clubSlug);//クラブのアプリが使えるか確認する関数
  return saveChildAction(access, targetChildId, previousState, formData, "UPDATE");//子どもの名前と学年をDBに保存するアクション関数（DB保存→リバリデート→画面遷移まで）
}

//子どものクラブメンバーシップを追加変更するアクション関数（ADD：新規追加、退会ずみをアクティブへ、WITHDRAW：アクティブを退会ずみへ）（DB保存→リバリデート→画面遷移まで）
async function changeChildMembershipAction(
  access: ClubAccessContext,// 認可成功時に返すデータ
  targetChildId: string,
  previousState: ChildMembershipActionState,//子どものメンバーシップのアクションステイト
  formData: FormData,
  operation: "ADD" | "WITHDRAW",
): Promise<ChildMembershipActionState> {//子どものメンバーシップのアクションステイト
  const values = {
    childId: validateChildIdInput(targetChildId).success ? targetChildId : "",//子どものIDがUUID v4形式かを検証する関数
  };
  const request = checkRequest(previousState, formData);//リクエストIDが一致するかをチェックする関数
  if (!request.valid) {
    return errorState(values, request.requestId, EXPIRED_FORM_MESSAGE);//エラー時のステイトの型に"フォームの有効期限が切れました。ページを開き直してください。"などを入れ返す
  }
  if (!matchesChildTarget(targetChildId, formData)) {//childIdが一致しているかのチェック関数
    return errorState(values, request.requestId, null, {//エラー時のステイトの型に"対象の子どもを選び直してください。"などを入れ返す
      childId: [TARGET_MESSAGE],//"対象の子どもを選び直してください。"
    },);
  }
  const result = await callMutation(() => operation === "ADD"//operation === "ADD"なら引数として受け取った処理（operation）をそのまま実行しつつ、エラーが発生したら処理するラッパー関数にaddClubChild(access, values)を入れて実行、なければwithdrawClubChild(access, values)を入れて実行
    ? addClubChild(access, values)//子どものメンバーシップを追加、変更する関数（新規追加、退会ずみをアクティブへ）
    : withdrawClubChild(access, values),);//子どものメンバーシップを追加、変更する関数（アクティブを退会ずみへ）
  if (result.outcome !== "UPDATED") {
    return errorState(values, request.requestId, mutationMessage(result));//エラー時のステイトの型にクラブアカウントのデータを変更・更新した結果を受け取り固定メッセージへ変換したものなどを入れて返す
  }
  finishSavedAccount(//アカウント情報の変更がすべて無事に保存された後に、キャッシュを更新し、適切な通知メッセージを添えてアカウントページへ画面遷移させる関数
    access,
    request.requestId,
    result.affectedClubSlugs,
    operation === "ADD" ? "child-added" : "child-withdrawn",
    revalidateClubAccountPaths,// 子どもの情報を変更したときのクラブのアカウント関連ページのrevalidatePath実行関数
  );
}

//子どものクラブメンバーシップを追加変更するアクション関数（新規追加、退会ずみをアクティブへ）（DB保存→リバリデート→画面遷移まで）
export async function addChildToClubAction(
  clubSlug: string,
  targetChildId: string,
  previousState: ChildMembershipActionState,//子どものメンバーシップのアクションステイト
  formData: FormData,
): Promise<ChildMembershipActionState> {//子どものメンバーシップのアクションステイト
  const access = await requireClubAppAccess(clubSlug);//クラブのアプリが使えるか確認する関数
  return changeChildMembershipAction(access, targetChildId, previousState, formData, "ADD");//子どものクラブメンバーシップを追加変更するアクション関数（ADD：新規追加、退会ずみをアクティブへ、WITHDRAW：アクティブを退会ずみへ）（DB保存→リバリデート→画面遷移まで）
}

//子どものクラブメンバーシップを追加変更するアクション関数（アクティブを退会ずみへ）（DB保存→リバリデート→画面遷移まで）
export async function withdrawChildFromClubAction(
  clubSlug: string,
  targetChildId: string,
  previousState: ChildMembershipActionState,//子どものメンバーシップのアクションステイト
  formData: FormData,
): Promise<ChildMembershipActionState> {//子どものメンバーシップのアクションステイト
  const access = await requireClubAppAccess(clubSlug);//クラブのアプリが使えるか確認する関数
  return changeChildMembershipAction(//子どものクラブメンバーシップを追加変更するアクション関数（ADD：新規追加、退会ずみをアクティブへ、WITHDRAW：アクティブを退会ずみへ）（DB保存→リバリデート→画面遷移まで）
    access,
    targetChildId,
    previousState,
    formData,
    "WITHDRAW",
  );
}

// 追加変更候補の子どもの情報を取得し結果を返す関数
export async function getAttachableChildrenAction(
  clubSlug: string,
): Promise<ClubAccountChildCandidatesResult> {//クラブアカウントに紐づけられている子供アカウントの検索結果の型
  const access = await requireClubAppAccess(clubSlug);//クラブのアプリが使えるか確認する関数
  try {
    const result = await getAttachableClubChildren(access);//子どもアカウントの追加変更候補のデータを取得する関数
    if (result.outcome !== "FOUND") {
      return {
        outcome: result.outcome,
      };
    }
    return {
      outcome: "FOUND",
      children: result.children.map((child) => ({
        id: child.id,
        name: child.name,
        grade: child.grade,
      }),),
    };
  } catch (error) {
    unstable_rethrow(error);//Next.jsの画面遷移システムを邪魔しないために、Next.js自身が使うエラーだけを自動的に見分けてスルーさせるための安全装置
    return {
      outcome: "FETCH_FAILED",
    };
  }
}
