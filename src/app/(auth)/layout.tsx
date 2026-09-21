import { Logo } from "@/components/logo";
import { BarChart3, ShieldCheck, Users, Zap } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative flex items-center gap-2.5 text-lg font-semibold"><Logo /> DigiFalx SalesOS</div>
        <div className="relative mt-auto max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">One operating system for every lead, deal and follow-up.</h1>
          <p className="mt-3 text-slate-300">Capture, assign, qualify and close — with every action on the record and every number from live data.</p>
          <ul className="mt-8 space-y-3 text-sm text-slate-200">
            {[[Users, "Assign imported lead lists to your sales agents in seconds"], [Zap, "Response-time SLAs and automatic first follow-ups"], [BarChart3, "Pipeline, forecast and source-to-revenue reporting"], [ShieldCheck, "Tenant isolation and role permissions enforced in the database"]].map(([I, t], i) => {
              const Icon = I as typeof Users;
              return <li key={i} className="flex items-center gap-3"><span className="rounded-lg bg-white/10 p-1.5"><Icon className="size-4" /></span>{t as string}</li>;
            })}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-slate-400">© {new Date().getFullYear()} DigiFalx · Dubai · Mumbai · London</p>
      </aside>
      <main className="flex items-center justify-center bg-white px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 font-semibold lg:hidden"><Logo /> DigiFalx SalesOS</div>
          {children}
        </div>
      </main>
    </div>
  );
}

