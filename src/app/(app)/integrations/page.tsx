import Link from "next/link";
import { requireCtx } from "@/lib/auth/context";
import { PageHeader } from "@/components/crm/bits";
import { Badge, Card } from "@/components/ui";

export const metadata = { title: "Integrations" };
const LIVE = [["REST API v1 (leads)", "Create, list and update leads with API keys, idempotency and rate limits.", "/settings?section=api"], ["Inbound lead webhook", "Point website forms, Zapier, Make or n8n at POST /api/v1/leads.", "/settings?section=api"], ["CSV / Excel import", "Column mapping, validation, dedupe, agent assignment, undo.", "/leads/import"], ["CSV export", "Filtered exports for every CRM entity, audited.", "/leads"]];
const PLANNED = ["Gmail", "Microsoft Outlook", "Google Calendar", "Outlook Calendar", "Meta WhatsApp Cloud API", "Facebook Lead Ads", "Instagram Lead Ads", "Google Sheets", "Google Drive", "Slack", "Microsoft Teams", "Stripe", "Zoom", "Google Meet", "Outgoing signed webhooks"];

export default async function IntegrationsPage() {
  const ctx = await requireCtx();
  const admin = ["owner", "admin"].includes(ctx.role);
  return (
    <div className="pb-10">
      <PageHeader title="Integrations" description="Official APIs only — no scraping or bypassing platform controls." />
      <div className="space-y-4 px-4 sm:px-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{LIVE.map(([t, d, h]) => <Card key={t} className="p-4"><div className="flex items-center justify-between"><p className="font-medium">{t}</p><Badge tone="green">Live</Badge></div><p className="mt-1 text-sm text-muted">{d}</p>{admin && <Link href={h!} className="mt-2 inline-block text-sm text-brand-600 hover:underline">Configure →</Link>}</Card>)}</div>
        <Card className="p-4"><p className="font-medium">Connectors scheduled for Phase 2</p><div className="mt-3 flex flex-wrap gap-2">{PLANNED.map((p) => <Badge key={p}>{p}</Badge>)}</div></Card>
      </div>
    </div>
  );
}
