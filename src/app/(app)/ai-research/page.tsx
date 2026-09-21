import { Planned } from "@/components/planned";
export const metadata = { title: "AI Research" };
export default function Page() { return <Planned title="AI research & sales assistant" phase={3} summary="Source-cited company research, meeting briefs, SPIN questions and draft outreach — always labelled, editable and approval-gated, within organisation AI budgets."
  bullets={["Website, public news and social analysis with sources", "Discovery questions, meeting briefs, follow-up drafts, proposal outlines", "RAG over your case studies (tenant-isolated)", "Sentiment, buying signals and deal-risk detection; per-org model choice and usage logs"]}
  now={[{ href: "/leads", label: "Explainable lead scoring & next best action" }]} />; }
