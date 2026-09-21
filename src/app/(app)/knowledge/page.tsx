import { Planned } from "@/components/planned";
export const metadata = { title: "Knowledge Base" };
export default function Page() { return <Planned title="Knowledge base" phase={3} summary="Case studies, pricing guides, objection handling and playbooks — searchable by the team and used by the AI assistant (tenant-isolated retrieval)." bullets={["Documents and articles with categories and permissions", "Semantic search", "Grounding source for AI drafts"]} />; }
