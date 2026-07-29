// lib/axiom/server.ts
// Axiomのサーバー側でのログ出力を行うためのラッパー関数群
//Axiom：外部ログ記録サービス。Vercelだと１時間以内のログしか出ないため、Axiomに送信することで長期保存できるようにする。

import "server-only";

import { Axiom } from "@axiomhq/js";
import { Logger, AxiomJSTransport } from "@axiomhq/logging";

type LogFields = Record<string, unknown>;

const token = process.env.AXIOM_TOKEN;
const dataset = process.env.AXIOM_DATASET;

// Axiom設定がない時でもWebhook自体は落とさない。
// 本番で環境変数を入れ忘れても、Vercelログには出るようにする。
const axiomLogger =
  token && dataset
    ? new Logger({
        transports: [
          new AxiomJSTransport({
            axiom: new Axiom({ token }),
            dataset,
          }),
        ],
      })
    : null;

export function logInfo(message: string, fields?: LogFields) {
  // Vercelログ用
  console.info(message, fields ?? {});

  // Axiom用
  axiomLogger?.info(message, fields);
}

export function logWarn(message: string, fields?: LogFields) {
  console.warn(message, fields ?? {});
  axiomLogger?.warn(message, fields);
}

export function logError(message: string, fields?: LogFields) {
  console.error(message, fields ?? {});
  axiomLogger?.error(message, fields);
}

export async function flushLogs() {
  if (!axiomLogger) {
    return;
  }

  try {
    await axiomLogger.flush();
  } catch (error) {
    // Axiom送信失敗でLINE webhookを失敗扱いにしない
    console.error("Axiomログのflushに失敗しました", error);
  }
}