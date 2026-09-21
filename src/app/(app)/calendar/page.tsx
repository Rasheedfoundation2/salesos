import { Planned } from "@/components/planned";
export const metadata = { title: "Calendar" };
export default function Page() { return <Planned title="Calendar" phase={2} summary="Calendar views of meetings, follow-ups and task due dates with Google Calendar and Outlook two-way sync." bullets={["Day / week / month views", "Google Calendar & Microsoft Outlook connectors", "Meeting reminders and booking links"]} now={[{ href: "/tasks?view=upcoming", label: "Upcoming follow-ups (next 7 days)" }, { href: "/tasks?view=today", label: "Today’s agenda" }]} />; }
