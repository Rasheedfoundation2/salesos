import { Planned } from "@/components/planned";
export const metadata = { title: "Inbox" };
export default function Page() { return <Planned title="Unified inbox" phase={2} summary="One threaded inbox for email, WhatsApp and website chat, with the contact and deal context alongside every conversation."
  bullets={["Gmail / Outlook sync and Meta WhatsApp Cloud API (plus a modular QR-provider adapter where permitted)", "Team inboxes, unassigned queue, owner assignment, statuses (Open, Pending, Awaiting Customer, Resolved, Spam, Closed)", "Templates, saved replies, delivery status, STOP/opt-out detection, 24-hour window rules", "AI summaries and reply drafts (approval required)"]}
  now={[{ href: "/activities", label: "Log WhatsApp/email as activities" }]} />; }
