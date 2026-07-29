import { CommerceShell } from "@/components/commerce-shell";
import { AccountShell } from "@/components/account-dashboard";
import { getAccountSnapshot } from "@/lib/account";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const snapshot = await getAccountSnapshot();
  const name = [snapshot.profile?.first_name, snapshot.profile?.last_name].filter(Boolean).join(" ") || snapshot.user.email?.split("@")[0] || "Researcher";
  return <CommerceShell accountMenu={{ name, email: snapshot.user.email ?? "" }}><AccountShell snapshot={snapshot}>{children}</AccountShell></CommerceShell>;
}
