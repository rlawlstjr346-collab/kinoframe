import { NextResponse } from "next/server";
import { getAuthConfigStatus } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getAuthConfigStatus());
}
