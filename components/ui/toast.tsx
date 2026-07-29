"use client";

import * as React from "react";
import { Toast as ToastPrimitive } from "radix-ui";
import { Check, X } from "lucide-react";

type ToastMessage = {
  id: number;
  title: string;
  description?: string;
};

type ToastContextValue = {
  toast: (message: Omit<ToastMessage, "id">) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ToastMessage[]>([]);
  const nextId = React.useRef(0);

  const toast = React.useCallback((next: Omit<ToastMessage, "id">) => {
    const message = { ...next, id: ++nextId.current };
    setMessages(current => [...current, message].slice(-5));
  }, []);

  return <ToastContext.Provider value={{ toast }}>
    <ToastPrimitive.Provider swipeDirection="right" duration={4200}>
      {children}
      {messages.map((message, index) => <ToastPrimitive.Root
        key={message.id}
        className="toast-root"
        style={{
          "--toast-index": messages.length - 1 - index,
          "--toast-count": messages.length,
        } as React.CSSProperties}
        defaultOpen
        onOpenChange={open => {
        if (!open) setMessages(current => current.filter(item => item.id !== message.id));
      }}>
        <span className="toast-status" aria-hidden="true"><Check /></span>
        <div className="toast-copy">
          <ToastPrimitive.Title className="toast-title">{message.title}</ToastPrimitive.Title>
          {message.description && <ToastPrimitive.Description className="toast-description">{message.description}</ToastPrimitive.Description>}
        </div>
        <ToastPrimitive.Close className="toast-close" aria-label="Dismiss notification"><X /></ToastPrimitive.Close>
      </ToastPrimitive.Root>)}
      <ToastPrimitive.Viewport className="toast-viewport" />
    </ToastPrimitive.Provider>
  </ToastContext.Provider>;
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
