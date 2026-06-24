import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/session";

export default async function RootPage() {
  const session = await getVerifiedSession();
  redirect(session ? "/dashboard" : "/login");
}
