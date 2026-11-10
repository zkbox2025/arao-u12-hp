//admin/events/new/ClubEventCreateForm.tsx
//イベント新規作成フォーム

"use client";

import type {
  ClubEventActionState,//イベントのアクションステイト
} from "@/domain/club/event/event-form";
import {
  ClubEventForm,//イベント新規作成・編集共通フォーム
} from "../_components/ClubEventForm";

//引数
type ClubEventCreateFormProps = {
  action: (
    previousState:
      ClubEventActionState,
    formData: FormData,
  ) => Promise<ClubEventActionState>;
  initialState:
    ClubEventActionState;
  cancelHref: string;
  clubSlug: string;
  lineTargets:
    readonly {
      id: string;
      targetName: string | null;
    }[];
};

export function ClubEventCreateForm(
  props: ClubEventCreateFormProps,
) {
  return (
    <ClubEventForm
      {...props}
      existingAttachments={[]}
      isEdit={false}
    />
  );
}