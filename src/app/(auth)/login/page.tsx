import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/context";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  if (await getSessionUser()) redirect(typeof sp.next === "string" ? sp.next : "/home");
  return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
      <p className="mt-1 text-sm text-muted">Welcome back. Sign in to your workspace.</p>
      {sp.reset && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Password updated — sign in with your new password.</p>}
      <LoginForm next={typeof sp.next === "string" ? sp.next : ""} />
      <p className="mt-6 text-center text-sm text-muted">New to SalesOS? <Link href="/register" className="font-medium text-brand-600 hover:underline">Create an organisation</Link></p>
    </>
  );
}
