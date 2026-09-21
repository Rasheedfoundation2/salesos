import { Activity, BarChart3, Bot, Briefcase, Building2, Calendar, CheckSquare, FileText, Home, Inbox, KanbanSquare, Library, Megaphone, Package, Plug, Settings, Target, UserRound, Users, Workflow, type LucideIcon } from "lucide-react";

export const NAV_ICONS: Record<string, LucideIcon> = {
  home: Home, leads: Target, contacts: UserRound, companies: Building2, opportunities: Briefcase, pipeline: KanbanSquare, inbox: Inbox, activities: Activity,
  tasks: CheckSquare, calendar: Calendar, proposals: FileText, products: Package, campaigns: Megaphone, automations: Workflow, ai: Bot, reports: BarChart3,
  knowledge: Library, integrations: Plug, team: Users, settings: Settings,
};
