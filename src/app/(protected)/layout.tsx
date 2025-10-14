//bua/src/app/(protected)/layout.tsx

"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../../lib/auth/UserContext";
import { SignOutButton } from "../../components/SignOutButton";


export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
const { user, loading } = useUser();
const router = useRouter();


useEffect(() => {
if (!loading && !user) router.replace("/login");
}, [loading, user, router]);


if (loading || !user) {
return <p className="text-sm text-slate-600">Checking session…</p>;
}


return (
<div className="space-y-4">
<div className="flex items-center justify-between">
<p className="text-sm text-slate-600">Signed in as <span className="font-medium">{user.email}</span></p>
<SignOutButton />
</div>
{children}
</div>
);
}