// app/api/users/upsert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccountJson =
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
  process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountJson) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_SERVICE_ACCOUNT).");
}

const app: App =
  getApps().length
    ? getApps()[0]!
    : initializeApp(
        serviceAccountJson
          ? { credential: cert(JSON.parse(serviceAccountJson)) }
          : {}
      );

const adminDb = getFirestore(app);

export async function POST(req: NextRequest) {
  try {
    const { uid, name, email, role } = await req.json();

    if (!uid || !name || typeof role === "undefined") {
      return NextResponse.json(
        { error: "uid, name, role are required" },
        { status: 400 }
      );
    }

    // Normalize role to number (0=Student, 1=Admin)
    const roleNumber =
      typeof role === "number"
        ? role
        : typeof role === "string" && !Number.isNaN(parseInt(role, 10))
        ? parseInt(role, 10)
        : String(role).toLowerCase().includes("admin")
        ? 1
        : 0;

    await adminDb
      .collection("users")
      .doc(uid)
      .set(
        {
          name,
          email: email || null,
          role: roleNumber,
          updatedAt: new Date(),
          createdAt: new Date(), // harmless if overwriting an existing doc
        },
        { merge: true }
      );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[/api/users/upsert] error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to upsert user profile" },
      { status: 500 }
    );
  }
}
