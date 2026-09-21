"use client";
import * as React from "react";
import { Dialog as RDialog, DropdownMenu as RDropdown, Tooltip as RTooltip } from "radix-ui";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "./variants";
export { buttonVariants };
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Button ──
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { loading?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
    {loading && <Loader2 className="animate-spin" />}
    {children}
  </button>
));
Button.displayName = "Button";

// ── Inputs ──
const field = "w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-400 shadow-sm transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:bg-slate-50 aria-[invalid=true]:border-red-400";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn(field, "h-9", className)} {...p} />);
Input.displayName = "Input";
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, "min-h-[80px] py-2", className)} {...p} />);
Textarea.displayName = "Textarea";
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(field, "h-9 pr-8 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235b6b82%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_0.6rem_center] bg-no-repeat", className)} {...p}>{children}</select>
));
Select.displayName = "Select";

export function Label({ className, children, required, ...p }: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return <label className={cn("mb-1 block text-[13px] font-medium text-slate-700", className)} {...p}>{children}{required && <span className="ml-0.5 text-red-500">*</span>}</label>;
}
export function Field({ label, name, error, hint, required, children, className }: { label: string; name?: string; error?: string[] | string; hint?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  const msg = Array.isArray(error) ? error[0] : error;
  return (
    <div className={className}>
      <Label htmlFor={name} required={required}>{label}</Label>
      {children}
      {msg ? <p className="mt-1 text-xs text-red-600" role="alert">{msg}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

// ── Display ──
const tones: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200", blue: "bg-brand-50 text-brand-700 ring-brand-100", green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200", red: "bg-red-50 text-red-700 ring-red-200", violet: "bg-violet-50 text-violet-700 ring-violet-200", navy: "bg-navy-900 text-white ring-navy-900",
};
export function Badge({ tone = "slate", className, children }: { tone?: string; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap", tones[tone] ?? tones.slate, className)}>{children}</span>;
}
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-white shadow-card", className)} {...p}>{children}</div>;
}
export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-line px-4 py-3", className)}>
      <div className="min-w-0"><h3 className="text-sm font-semibold text-ink">{title}</h3>{description && <p className="mt-0.5 text-xs text-muted">{description}</p>}</div>
      {action}
    </div>
  );
}
export function Skeleton({ className }: { className?: string }) { return <div className={cn("animate-pulse rounded-md bg-slate-200/70", className)} />; }
export function Avatar({ name, className }: { name?: string | null; className?: string }) {
  const n = name ?? "?"; const hue = [...n].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return <span title={n} className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white", className)} style={{ background: `hsl(${hue} 45% 42%)` }}>
    {n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("")}
  </span>;
}
export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-500 [&_svg]:size-6">{icon}</div>}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Dialog ──
export function Dialog({ open, onOpenChange, title, description, children, footer, size = "md", trigger }: {
  open?: boolean; onOpenChange?: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg" | "xl"; trigger?: React.ReactNode;
}) {
  const w = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RDialog.Trigger asChild>{trigger}</RDialog.Trigger>}
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-navy-950/40 backdrop-blur-[1px] data-[state=open]:animate-in" />
        <RDialog.Content className={cn("fixed left-1/2 top-[6vh] z-50 flex max-h-[88vh] w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-col rounded-2xl bg-white shadow-pop focus:outline-none", w)}>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div><RDialog.Title className="text-base font-semibold">{title}</RDialog.Title>{description ? <RDialog.Description className="mt-0.5 text-sm text-muted">{description}</RDialog.Description> : <RDialog.Description className="sr-only">{title}</RDialog.Description>}</div>
            <RDialog.Close className="rounded-md p-1 text-muted hover:bg-slate-100" aria-label="Close"><X className="size-4" /></RDialog.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line bg-slate-50/60 px-5 py-3 rounded-b-2xl">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

// ── Dropdown ──
export const Menu = RDropdown.Root;
export const MenuTrigger = RDropdown.Trigger;
export function MenuContent({ children, align = "end", className }: { children: React.ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return <RDropdown.Portal><RDropdown.Content align={align} sideOffset={6} className={cn("z-50 min-w-[190px] rounded-xl border border-line bg-white p-1 shadow-pop", className)}>{children}</RDropdown.Content></RDropdown.Portal>;
}
export function MenuItem({ children, onSelect, className, danger, disabled }: { children: React.ReactNode; onSelect?: (e: Event) => void; className?: string; danger?: boolean; disabled?: boolean }) {
  return <RDropdown.Item disabled={disabled} onSelect={onSelect} className={cn("flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-slate-100 data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-muted", danger && "text-red-600", className)}>{children}</RDropdown.Item>;
}
export const MenuSeparator = () => <RDropdown.Separator className="my-1 h-px bg-line" />;
export const MenuLabel = ({ children }: { children: React.ReactNode }) => <RDropdown.Label className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</RDropdown.Label>;

// ── Tooltip ──
export function Tip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <RTooltip.Provider delayDuration={250}>
      <RTooltip.Root>
        <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
        <RTooltip.Portal><RTooltip.Content sideOffset={6} className="z-50 max-w-xs rounded-md bg-navy-900 px-2 py-1 text-xs text-white shadow-pop">{content}</RTooltip.Content></RTooltip.Portal>
      </RTooltip.Root>
    </RTooltip.Provider>
  );
}

// ── Confirm dialog ──
export function Confirm({ trigger, title, description, confirmLabel = "Confirm", danger, onConfirm }: { trigger: React.ReactNode; title: string; description?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => Promise<unknown> | void }) {
  const [open, setOpen] = React.useState(false); const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={trigger} title={title} description={description} size="sm"
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant={danger ? "danger" : "primary"} loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); setOpen(false); } finally { setBusy(false); } }}>{confirmLabel}</Button></>}>
      <p className="text-sm text-muted">{description ?? "Are you sure?"}</p>
    </Dialog>
  );
}
