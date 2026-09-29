//admin/events/[eventId]/edit/ClubEventEditForm.tsx
//イベント編集フォーム


"use client";

import type {
  ClubEventActionState,//イベントのアクションステイト
} from "@/domain/club/event/event-form";
import {
  ClubEventForm,//イベント新規作成・編集共通フォーム
} from "../../_components/ClubEventForm";

type ClubEventEditFormProps = {
  action: (
    previousState:
      ClubEventActionState,
    formData: FormData,
  ) => Promise<ClubEventActionState>;
  initialState:
    ClubEventActionState;
  cancelHref: string;
  clubSlug: string;
  existingAttachments:
    readonly {
      id: string;
      fileName: string;
      sizeBytes: number;
    }[];
  lineTargets:
    readonly {
      id: string;
      targetName: string | null;
    }[];
};

export function ClubEventEditForm(
  props: ClubEventEditFormProps,
) {
  return (
    <ClubEventForm
      {...props}
      isEdit
    />
  );
}