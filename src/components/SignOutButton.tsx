"use client";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase/client";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut(auth)}
      className="rounded border px-3 py-1 text-sm hover:bg-slate-50"
    >
      Sign out
    </button>
  );
}