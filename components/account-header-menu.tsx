"use client";

import { useTransition } from "react";
import Link from "next/link";
import { CircleUserRound, FlaskConical, Gift, Heart, LogOut, Package } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/account/actions";

const links = [
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/saved", label: "Saved products", icon: Heart },
  { href: "/account/rewards", label: "Rewards", icon: Gift },
  { href: "/account/profile", label: "Profile", icon: CircleUserRound },
];

export function AccountHeaderMenu({ name, email }: { name: string; email: string }) {
  const [pending, startTransition] = useTransition();
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className="icon-link account-menu-trigger" aria-label="Open account menu" title="Account menu">
        <FlaskConical aria-hidden="true" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="account-header-menu">
      <DropdownMenuLabel className="account-menu-identity">
        <span className="account-menu-avatar"><FlaskConical aria-hidden="true" /></span>
        <span><strong>{name}</strong><small>{email}</small></span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {links.map(({ href, label, icon: Icon }) => <DropdownMenuItem key={href} asChild>
          <Link href={href}><Icon aria-hidden="true" /><span>{label}</span></Link>
        </DropdownMenuItem>)}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem destructive disabled={pending} onSelect={() => startTransition(() => signOut("global"))}>
        <LogOut aria-hidden="true" /><span>{pending ? "Logging out…" : "Log out"}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

