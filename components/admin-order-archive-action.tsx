"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, MoreHorizontal } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { setAdminOrderArchived } from "@/app/admin/actions";
import { Button } from "@/components/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function AdminOrderArchiveAction({
  orderId,
  orderNumber,
  archived,
  menu = false,
}: {
  orderId: string;
  orderNumber: string;
  archived: boolean;
  menu?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const Icon = archived ? ArchiveRestore : Archive;

  return <AlertDialog.Root open={open} onOpenChange={setOpen}>
    {menu ? <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" aria-label={`Actions for ${orderNumber}`}>
          <MoreHorizontal /> Actions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem destructive={!archived} onSelect={() => setOpen(true)}>
          <Icon /> {archived ? "Restore order" : "Archive order"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu> : <AlertDialog.Trigger asChild>
      <Button type="button" variant="outline"><Icon /> {archived ? "Restore order" : "Archive order"}</Button>
    </AlertDialog.Trigger>}
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="dialog-overlay" />
      <AlertDialog.Content className="admin-confirm-dialog">
        <AlertDialog.Title>{archived ? "Restore" : "Archive"} {orderNumber}?</AlertDialog.Title>
        <AlertDialog.Description>
          {archived
            ? "This order and its payment submissions will return to the admin orders and review queues."
            : "This hides the order and its payment submissions from the admin orders and review queues. No order history will be deleted."}
        </AlertDialog.Description>
        <form action={setAdminOrderArchived} className="admin-confirm-actions">
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="archived" value={String(!archived)} />
          <AlertDialog.Cancel asChild><Button type="button" variant="outline">Cancel</Button></AlertDialog.Cancel>
          <Button className={!archived ? "admin-destructive-button" : undefined}>
            {archived ? "Restore order" : "Archive order"}
          </Button>
        </form>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
