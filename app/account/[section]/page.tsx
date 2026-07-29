import { notFound } from "next/navigation";
import { AccountSection, accountNav } from "@/components/account-dashboard";
import { getAccountSnapshot } from "@/lib/account";

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!accountNav.some(([path]) => path === section)) notFound();
  return <AccountSection section={section} snapshot={await getAccountSnapshot()} />;
}
