/** Deterministic next-best-action rules (transparent; AI suggestions arrive in Phase 3). */
export interface Nba { title: string; detail: string; tone: "red" | "amber" | "blue" | "green"; action?: "call" | "whatsapp" | "task" | "convert" | "assign" | "email" }

export function leadNextAction(l: { status: string; owner_id: string | null; score: number; first_contacted_at: string | null; first_response_due_at: string | null; next_follow_up_at: string | null; phone?: string | null; whatsapp?: string | null; email?: string | null }): Nba {
  const now = Date.now();
  if (["converted"].includes(l.status)) return { title: "Converted", detail: "Work continues on the opportunity.", tone: "green" };
  if (["do_not_contact", "unqualified"].includes(l.status)) return { title: "No action required", detail: "This lead is closed out.", tone: "blue" };
  if (!l.owner_id) return { title: "Assign an owner", detail: "Unassigned leads are not being worked. Assign now to start the response SLA.", tone: "red", action: "assign" };
  if (!l.first_contacted_at && l.first_response_due_at) {
    const mins = Math.round((new Date(l.first_response_due_at).getTime() - now) / 60000);
    if (mins < 0) return { title: "First response overdue", detail: `SLA breached ${Math.abs(mins) > 120 ? Math.round(Math.abs(mins) / 60) + " hours" : Math.abs(mins) + " minutes"} ago — call${l.whatsapp || l.phone ? " or WhatsApp" : ""} immediately.`, tone: "red", action: l.phone ? "call" : "email" };
    return { title: l.score >= 80 ? "Hot lead — call now" : "Make first contact", detail: `Respond within ${mins} minute${mins === 1 ? "" : "s"} to meet the SLA.`, tone: "amber", action: l.phone ? "call" : "email" };
  }
  if (l.status === "attempting_contact") return { title: "Try another channel", detail: l.whatsapp || l.phone ? "No answer yet — send a WhatsApp message and schedule a retry." : "No reply yet — send a follow-up email.", tone: "amber", action: l.whatsapp || l.phone ? "whatsapp" : "email" };
  if (l.status === "qualified") return { title: "Convert and book discovery", detail: "Qualified — create the opportunity and schedule the discovery meeting.", tone: "green", action: "convert" };
  if (!l.next_follow_up_at || new Date(l.next_follow_up_at).getTime() < now) return { title: l.next_follow_up_at ? "Follow-up overdue" : "Schedule the next follow-up", detail: "Every open lead should have a dated next action.", tone: l.next_follow_up_at ? "red" : "amber", action: "task" };
  return { title: "Continue qualification", detail: "Confirm budget, authority, need and timeframe.", tone: "blue", action: "call" };
}

export function oppNextAction(o: { status: string; next_action: string | null; expected_close_date: string | null; last_activity_at: string | null; stage_entered_at: string; max_days: number | null; contact_id: string | null; risk_level: string }): Nba {
  if (o.status === "won") return { title: "Deliver the handover", detail: "Make sure the delivery team has everything they need.", tone: "green" };
  if (o.status === "lost") return { title: "Closed lost", detail: "Consider re-engaging in 30–90 days.", tone: "blue" };
  const now = Date.now();
  if (o.expected_close_date && new Date(o.expected_close_date).getTime() < now - 86400000) return { title: "Close date has passed", detail: "Update the expected close date or move the deal to the right stage.", tone: "red", action: "task" };
  if (!o.next_action) return { title: "Set a next action", detail: "Deals without a next step stall. Add a dated task.", tone: "amber", action: "task" };
  if (!o.last_activity_at || new Date(o.last_activity_at).getTime() < now - 7 * 86400000) return { title: "Deal going cold", detail: "No activity for 7+ days — re-engage the buyer.", tone: "amber", action: "call" };
  if (o.max_days && new Date(o.stage_entered_at).getTime() < now - o.max_days * 86400000) return { title: "Stuck in stage", detail: `Longer than the ${o.max_days}-day stage limit.`, tone: "amber", action: "call" };
  if (!o.contact_id) return { title: "Add the primary contact", detail: "Late stages require a named decision maker.", tone: "amber" };
  return { title: o.next_action, detail: "Next action recorded on the deal.", tone: "blue", action: "task" };
}
