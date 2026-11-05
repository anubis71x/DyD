import { redirect } from "next/navigation";

// Was the Stripe Checkout success page; top-ups now happen in the Add funds dialog.
export default function Page() {
  redirect("/dashboard");
}
