// bua/src/app/(auth)/login/page.tsx
"use client";

import React, { useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Spinner } from "@/components/Spinner";

import { auth, db } from "../../../lib/firebase/client";
import { signInWithEmailAndPassword, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { User as DomainUser, Role } from "../../../../types";

interface SignInPageProps {
  onSignUp: () => void;
  onSignInSuccess: (user: DomainUser) => void;
}

function buildDomainUserFromFirebase(u: FirebaseUser, profileData?: any): DomainUser {
  const fallbackName = u.displayName ?? u.email?.split("@")[0] ?? "Student";

  // coerce role into a number safely
  const roleFromProfile =
    profileData && typeof profileData.role !== "undefined"
      ? Number(profileData.role)
      : Role.Student;

  const nameFromProfile = profileData && profileData.name ? String(profileData.name) : fallbackName;

  return {
    id: u.uid,
    name: nameFromProfile,
    role: Number.isNaN(roleFromProfile) ? Role.Student : (roleFromProfile as Role),
  };
}

const SignInPage: React.FC<SignInPageProps> = ({ onSignUp, onSignInSuccess }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const fbUser = cred.user;

      // attempt to read profile doc to get role/name if present
      let profileData: any = null;
      try {
        const ref = doc(db, "users", fbUser.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) profileData = snap.data();
      } catch (err) {
        // non-fatal — we'll fallback to defaults
        console.warn("Failed to fetch user profile doc:", err);
      }

      const domainUser = buildDomainUserFromFirebase(fbUser, profileData);
      onSignInSuccess(domainUser);
    } catch (err: any) {
      const msg =
        err?.code === "auth/invalid-email"
          ? "That email address looks invalid."
          : err?.code === "auth/user-not-found" || err?.code === "auth/wrong-password"
          ? "Invalid email or password. Please try again."
          : err?.code === "auth/too-many-requests"
          ? "Too many attempts. Please wait a moment and try again."
          : err?.message || "An unexpected error occurred. Please try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="max-w-md w-full px-4">
        <h1 className="text-3xl font-bold text-center text-blue-600 dark:text-blue-400 mb-2">Bua</h1>
        <h2 className="text-2xl font-bold text-center text-slate-800 dark:text-white mb-6">Sign In</h2>

        <Card>
          <form onSubmit={handleSignIn} className="space-y-6">
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <Input
              label="Email Address"
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="alex@school.edu"
            />

            <Input
              label="Password"
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Spinner className="mr-2" /> Signing In...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-slate-600 dark:text-slate-400 mt-6">
            Don&apos;t have an account?{" "}
            <button
              onClick={onSignUp}
              className="font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Sign up
            </button>
          </p>
        </Card>
      </div>
    </div>
  );
};

export default SignInPage;


