import type { Module } from "./rbac";

export interface NavItem { href: string; label: string; icon: string; module?: Module; phase?: 2 | 3; termKey?: string }

export const NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/leads", label: "Leads", icon: "leads", module: "leads", termKey: "leads" },
  { href: "/contacts", label: "Contacts", icon: "contacts", module: "contacts", termKey: "contacts" },
  { href: "/companies", label: "Companies", icon: "companies", module: "companies", termKey: "companies" },
  { href: "/opportunities", label: "Opportunities", icon: "opportunities", module: "opportunities", termKey: "opportunities" },
  { href: "/pipeline", label: "Pipeline", icon: "pipeline", module: "opportunities" },
  { href: "/inbox", label: "Inbox", icon: "inbox", phase: 2 },
  { href: "/activities", label: "Activities", icon: "activities", module: "activities" },
  { href: "/tasks", label: "Tasks", icon: "tasks", module: "tasks" },
  { href: "/calendar", label: "Calendar", icon: "calendar", phase: 2 },
  { href: "/proposals", label: "Proposals", icon: "proposals", phase: 2 },
  { href: "/products", label: "Products & Services", icon: "products" },
  { href: "/campaigns", label: "Campaigns", icon: "campaigns" },
  { href: "/automations", label: "Automations", icon: "automations", phase: 2 },
  { href: "/ai-research", label: "AI Research", icon: "ai", phase: 3 },
  { href: "/reports", label: "Reports", icon: "reports", module: "reports" },
  { href: "/knowledge", label: "Knowledge Base", icon: "knowledge", phase: 3 },
  { href: "/integrations", label: "Integrations", icon: "integrations" },
  { href: "/team", label: "Team", icon: "team" },
  { href: "/settings", label: "Settings", icon: "settings", module: "settings" },
];

export function term(terminology: Record<string, string> | undefined, key: string, fallback: string) {
  return terminology?.[key]?.trim() || fallback;
}
