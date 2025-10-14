// bua/src/app/(auth)/login/page.tsx
"use client";

import React, { useState } from "react";
import { Button } from "@/src/components/Button";
import { Card } from "@/src/components/Card";
import { Input } from "@/src/components/Input";
import { Spinner } from "@/src/components/Spinner";

import { auth } from "../../../lib/firebase/client";
import { signInWithEmailAndPassword, User as FirebaseUser } from "firebase/auth";

import { User as DomainUser, Role } from "../../../../types";

interface SignInPageProps {
  onSignUp: () => void;
  onSignInSuccess: (user: DomainUser) => void;
}


function toDomainUser(u: FirebaseUser): DomainUser {
  
  const fallbackName =
    u.email?.split("@")[0] ??
    "Student";

  
  return {
    id: u.uid,
    name: u.displayName ?? fallbackName,
    role: Role.Student,
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
      onSignInSuccess(toDomainUser(cred.user));
    } catch (err: any) {
      const msg =
        err?.code === "auth/invalid-email"
          ? "That email address looks invalid."
          : err?.code === "auth/user-not-found" || err?.code === "auth/wrong-password"
          ? "Invalid email or password. Please try again."
          : err?.code === "auth/too-many-requests"
          ? "Too many attempts. Please wait a moment and try again."
          : "An unexpected error occurred. Please try again.";
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

