// bua/src/app/(auth)/signup/page.tsx
"use client";

import React, { useState } from "react";
import { Button } from "@/src/components/Button";
import { Card } from "@/src/components/Card";
import { Input } from "@/src/components/Input";
import { Spinner } from "@/src/components/Spinner";
import { Select } from "@/src/components/Select";

import { auth, db } from "../../../lib/firebase/client";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { User as DomainUser, Role } from "../../../../types";

interface SignUpPageProps {
  onSignIn: () => void;
  onSignUpSuccess: (user: DomainUser) => void;
}

function toDomainUser(u: FirebaseUser, role: Role, nameFallback: string): DomainUser {
  return {
    id: u.uid,
    name: u.displayName ?? nameFallback,
    role,
  };
}

const SignUpPage: React.FC<SignUpPageProps> = ({ onSignIn, onSignUpSuccess }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(Role.Student);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // 1) create auth user
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // 2) set displayName for convenience in client
      await updateProfile(cred.user, { displayName: name });

      // 3) create users/{uid} profile doc (stores role, name, metadata)
      await setDoc(doc(db, "users", cred.user.uid), {
        name,
        role, 
        email,
        createdAt: serverTimestamp(),
      });

      // 4) return your domain user
      onSignUpSuccess(toDomainUser(cred.user, role, name));
    } catch (err: any) {
      const msg =
        err?.code === "auth/email-already-in-use"
          ? "That email is already in use."
          : err?.code === "auth/invalid-email"
          ? "That email address looks invalid."
          : err?.code === "auth/weak-password"
          ? "Password should be at least 6 characters."
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
        <h2 className="text-2xl font-bold text-center text-slate-800 dark:text-white mb-6">
          Create an Account
        </h2>

        <Card>
          <form onSubmit={handleSignUp} className="space-y-6">
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <Input
              label="Full Name"
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Alex Doe"
            />

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

            <Select
              label="Role"
              id="role"
              value={role}
              onChange={(e) => setRole(parseInt(e.target.value, 10) as Role)}
            >
              <option value={Role.Student}>Student</option>
              <option value={Role.Admin}>Admin</option>
            </Select>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Spinner className="mr-2" /> Creating Account...
                </>
              ) : (
                "Sign Up"
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-slate-600 dark:text-slate-400 mt-6">
            Already have an account?{" "}
            <button
              onClick={onSignIn}
              className="font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Sign in
            </button>
          </p>
        </Card>
      </div>
    </div>
  );
};

export default SignUpPage;
