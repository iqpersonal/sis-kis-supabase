import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyPassword, hashPassword } from "@/lib/password";

/**
 * POST /api/parent-auth
 * Verify parent credentials against the families collection.
 * Returns family data + children on success.
 */
export async function POST(req: NextRequest) {
  try {
    const { username, password } = (await req.json()) as {
      username: string;
      password: string;
    };

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    // Look up family number from username index
    const indexDoc = await adminDb
      .collection("parent_config")
      .doc("username_index")
      .get();

    if (!indexDoc.exists) {
      return NextResponse.json(
        { error: "System not configured. Please contact administrator." },
        { status: 500 }
      );
    }

    const index = indexDoc.data()?.index as Record<string, string>;
    const familyNumber = index[username.trim()];

    if (!familyNumber) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Get family document
    const familyDoc = await adminDb
      .collection("families")
      .doc(familyNumber)
      .get();

    if (!familyDoc.exists) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const family = familyDoc.data()!;

    // Verify password (supports bcrypt hash and legacy plaintext)
    const { match, needsUpgrade } = await verifyPassword(
      password.trim(),
      family.password || ""
    );
    if (!match) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Upgrade plaintext → bcrypt on successful login
    if (needsUpgrade) {
      const hashed = await hashPassword(password.trim());
      await adminDb.collection("families").doc(familyNumber).update({ password: hashed });
    }

    // Return family data (without password)
    const { password: _pw, ...safeFamily } = family;

    return NextResponse.json({
      success: true,
      family: safeFamily,
    });
  } catch (err) {
    console.error("Parent auth error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
