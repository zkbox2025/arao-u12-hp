//src/infrastructure/prisma/client.ts

//設計図(schema.prisma)を書き換えるたびにPrismaClient(電話回線)が新しく作らずに今あるものを使うための設定
//PrismaClientは、Prismaが提供するデータベースクライアントのクラスで、これを使ってデータベースに接続し、クエリ（命令）を実行します。
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg"

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL が設定されていません。.env.local または .env.prod を読み込んでください。"
  );
}


//globalThis は、再起動しても消えない「共通の倉庫」のような場所。そこに prisma という名前で道具を置いておけるように型を定義している
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// 1. 実際のデータベース（PostgreSQL）に繋ぐためのプール（DBへの電話回線を束ねる装置）を作る
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// 2. Prismaが理解できる形（アダプター：PrismaPg）に変換する
const adapter = new PrismaPg(pool);


export const prisma =//prismaClient（電話回線）がすでにあればそれを使い、なければ新しく作る関数を公開
  globalForPrisma.prisma ??
  new PrismaClient({
  adapter, // ★ ここでアダプターを渡すのが新ルール！
    log: ["error", "warn"],//エラーと警告だけターミナルにメッセージを表示する
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;//本番環境（production）ではない時（＝開発中）だけ、倉庫に回線を保存しておく(本番環境では Next.js の挙動が異なるため、この使い回しテクニックは主に開発中のエラーを防ぐために使われる)
