import Link from "next/link";
import Image from "next/image";
import { FlaskConical, LockKeyhole, ShoppingBag } from "lucide-react";
import { AccountHeaderMenu } from "@/components/account-header-menu";
import { loadPublishedDesignerContent } from "@/lib/designer-data";

type AccountMenuIdentity = { name: string; email: string };

export async function CommerceShell({ children, admin = false, accountMenu }: { children: React.ReactNode; admin?: boolean; accountMenu?: AccountMenuIdentity }) {
  const { globals } = await loadPublishedDesignerContent("/");
  return (
    <>
      <div className="notice">{admin ? "PRIVATE ADMIN STAGING" : "PRIVATE COMMERCE STAGING · NO LIVE PAYMENTS"}</div>
      <header className="header">
        <div className="container header-inner">
          <Link className="wordmark" href={globals.logoHref} aria-label={globals.logoAlt || "Storefront home"}>
            {globals.logoImage
              ? <Image src={globals.logoImage} alt={globals.logoAlt || ""} width={180} height={48} className="designer-nav-logo" />
              : <>{globals.logoText}<span>{globals.logoSubtext}</span></>}
          </Link>
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
