import { Planned } from "@/components/planned";
export const metadata = { title: "Automations" };
export default function Page() { return <Planned title="Automations" phase={2} summary="A visual WHEN / IF / THEN builder running on the event log that Phase 1 already records for every lead, deal and task change."
  bullets={["17 triggers, 15 condition types, 16 actions (assign, create task, notify, send approved WhatsApp template, call webhook…)", "15 editable recipes — e.g. lead not contacted in 15 min, proposal follow-up after 2 days, won → handover", "Versioning, test mode, execution logs, retries, idempotency, rate limits, manual rerun"]}
  now={[{ href: "/settings?section=organisation", label: "Built-in rules: assignment, SLA, first-contact task, high-value alerts" }]} />; }
