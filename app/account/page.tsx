import { AccountSection } from "@/components/account-dashboard";
import { getAccountSnapshot } from "@/lib/account";

export default async function Page() {
  return <AccountSection section="overview" snapshot={await getAccountSnapshot()} />;
}
