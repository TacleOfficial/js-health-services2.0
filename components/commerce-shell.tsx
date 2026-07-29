import Link from "next/link";
import { FlaskConical, LockKeyhole, ShoppingBag } from "lucide-react";
import { AccountHeaderMenu } from "@/components/account-header-menu";

type AccountMenuIdentity = { name: string; email: string };

export function CommerceShell({ children, admin = false, accountMenu }: { children: React.ReactNode; admin?: boolean; accountMenu?: AccountMenuIdentity }) {
  return (
    <>
      <div className="notice">{admin ? "PRIVATE ADMIN STAGING" : "PRIVATE COMMERCE STAGING · NO LIVE PAYMENTS"}</div>
      <header className="header">
        <div className="container header-inner">
          <Link className="wordmark" href="/">VELLE<span>RESEARCH SYSTEMS</span></Link>
          <nav className="desktop-nav" aria-label={admin ? "Administrator" : "Commerce"}>
            {admin ? (
              <>
                <Link href="/admin">Review queue</Link>
                <Link href="/admin?view=orders">Orders</Link>
                <Link href="/admin?view=inventory">Inventory</Link>
              </>
            ) : (
              <>
                <Link href="/shop">Shop</Link>
                <Link href="/checkout">Checkout</Link>
                <Link href="/support">Support</Link>
              </>
            )}
          </nav>
          <div className="header-actions">
            {admin ? <LockKeyhole aria-hidden="true" /> : accountMenu ? <AccountHeaderMenu {...accountMenu} /> : <FlaskConical aria-hidden="true" />}
            <Link className="icon-link" href={admin ? "/" : "/cart"} aria-label={admin ? "Return to storefront" : "Open cart"}>
              <ShoppingBag />
            </Link>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
