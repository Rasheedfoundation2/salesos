import { PageHeader } from "@/components/crm/bits";
import { Card, CardHeader } from "@/components/ui";

export const metadata = { title: "Help centre" };
const K = ({ k }: { k: string }) => <kbd className="rounded border border-line bg-white px-1.5 py-0.5 font-mono text-xs">{k}</kbd>;

export default function Help() {
  const guides = [
    ["Add your sales team", "Team → Add users. Paste a list (email, name, role, team) to create many accounts at once — either with one-time temporary passwords or invitation links."],
    ["Import and distribute your lead data", "Leads → Import. Upload CSV/Excel, map columns, choose round robin across selected agents (or an Owner column), validate, then import. Each agent is notified and gets first-contact tasks."],
    ["Work leads", "Open a lead, follow the Next best action, log calls/WhatsApp with outcomes, and set the next follow-up. The response-time SLA stops when the first touch is logged."],
    ["Qualify and convert", "The explainable score shows why a lead is Hot/Warm. Convert to create the contact, company and opportunity in one step."],
    ["Move deals", "Drag cards on the Pipeline. Stages can require fields (value, close date, contact); Closed Lost always needs a reason; Closed Won creates the client handover."],
    ["Report", "Home shows your role dashboard; Reports adds filters, saved views, CSV exports and print-to-PDF."],
  ];
  return (
    <div className="pb-10">
      <PageHeader title="Help centre" description="Quick guides and keyboard shortcuts" />
      <div className="grid gap-4 px-4 sm:px-6 xl:grid-cols-[1fr_320px]">
        <Card><CardHeader title="Getting started" /><ol className="divide-y divide-line">{guides.map(([t, d], i) => <li key={t} className="flex gap-3 px-4 py-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white">{i + 1}</span><div><p className="font-medium">{t}</p><p className="text-sm text-muted">{d}</p></div></li>)}</ol></Card>
        <Card><CardHeader title="Keyboard shortcuts" /><ul className="space-y-2 p-4 text-sm">
          <li className="flex justify-between">Search & commands <span><K k="⌘" /> <K k="K" /></span></li><li className="flex justify-between">Search (anywhere) <K k="/" /></li>
          <li className="flex justify-between">Save inline edit <K k="Enter" /></li><li className="flex justify-between">Cancel inline edit <K k="Esc" /></li><li className="flex justify-between">Move a deal card (keyboard) <span><K k="Space" /> <K k="←→" /></span></li>
        </ul></Card>
      </div>
    </div>
  );
}
