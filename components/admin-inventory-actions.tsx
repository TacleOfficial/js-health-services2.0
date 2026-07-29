"use client";

import Link from "next/link";
import { useState } from "react";
import { Archive, MoreHorizontal, Pencil } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { Button } from "@/components/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setAdminProductArchived } from "@/app/admin/actions";

export function AdminInventoryActions({ productId, productTitle, archived, disabled }: { productId: string; productTitle: string; archived: boolean; disabled: boolean }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" disabled={disabled} aria-label={`Actions for ${productTitle}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link href={`/admin/products/${productId}`}><Pencil /> Edit product</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive={!archived} onSelect={() => setConfirmOpen(true)}><Archive /> {archived ? "Restore product" : "Archive product"}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="dialog-overlay" />
      <AlertDialog.Content className="admin-confirm-dialog">
        <AlertDialog.Title>{archived ? "Restore" : "Archive"} {productTitle}?</AlertDialog.Title>
        <AlertDialog.Description>{archived ? "The product and its variants will return as drafts for review." : "The product and all variants will leave the active catalog. Existing orders remain unchanged."}</AlertDialog.Description>
        <form action={setAdminProductArchived} className="admin-confirm-actions">
          <input type="hidden" name="product_id" value={productId} />
          <input type="hidden" name="archived" value={String(!archived)} />
          <AlertDialog.Cancel asChild><Button type="button" variant="outline">Cancel</Button></AlertDialog.Cancel>
          <Button className={!archived ? "admin-destructive-button" : undefined}>{archived ? "Restore product" : "Archive product"}</Button>
        </form>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
