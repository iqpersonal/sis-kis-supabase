import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { verifyPassword, hashPassword } from "@/lib/password";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/parent-auth
 * Verify parent credentials against the families table.
 * Returns family data + children on success.
 */
export async function POST(req: NextRequest) {
  try {
    const { username, password } = (await req.json()) as { username: string; password: string };

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = createServiceClient();

    const { data: famRows } = await supabase
      .from("families")
      .select("*")
      .eq("username", username.trim())
      .limit(1);

    if (!famRows || famRows.length === 0) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const family = famRows[0] as Record<string, unknown>;

    const { match, needsUpgrade } = await verifyPassword(
      password.trim(),
      String(family.password_hash || "")
    );
    if (!match) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    if (needsUpgrade) {
      const hashed = await hashPassword(password.trim());
      await supabase.from("families").update({ password_hash: hashed }).eq("id", family.id);
    }

    // Return family data (without password_hash)
    const { password_hash: _pw, ...safeFamily } = family;

    return NextResponse.json({ success: true, family: safeFamily }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("Parent auth error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
