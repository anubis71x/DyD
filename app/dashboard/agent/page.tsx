import { redirect } from "next/navigation";

// The old Vapi voice page. Talking is paused for maintenance; send old
// links to the campaign library instead.
export default function LegacyAgentPage() {
  redirect("/dashboard/narrator");
}
