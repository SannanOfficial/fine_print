import { ObjectId } from "mongodb";
import { NextResponse, type NextRequest } from "next/server";
import { readToken } from "@/core/newsletter-links.ts";
import { COLLECTIONS, type SubscriberRecord } from "@/core/records.ts";
import { getDb } from "@/lib/db.ts";

/*
 * One-click unsubscribe (RFC 8058), used by mail apps' "Unsubscribe" button
 * through the List-Unsubscribe headers on every email. A plain visit (GET)
 * only shows the preferences page, so link scanners can't unsubscribe anyone.
 */

export async function POST(request: NextRequest) {
  const link = readToken(request.nextUrl.searchParams.get("t") ?? "");
  if (link?.k === "manage") {
    await (await getDb())
      .collection<SubscriberRecord>(COLLECTIONS.subscribers)
      .deleteOne({ _id: new ObjectId(link.s), tokenVersion: link.v });
  }
  return new NextResponse("Unsubscribed.\n", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export function GET(request: NextRequest) {
  const url = new URL("/newsletter/manage", request.url);
  url.searchParams.set("t", request.nextUrl.searchParams.get("t") ?? "");
  return NextResponse.redirect(url, 303);
}
