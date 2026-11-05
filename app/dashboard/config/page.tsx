import { redirect } from "next/navigation";

// The old coin-package editor; coins were replaced by dollar billing.
export default function Page() {
  redirect("/dashboard/admin/billing");
}
