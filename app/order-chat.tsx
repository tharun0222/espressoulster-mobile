"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { onLiveUpdate } from "./use-live-updates";
import "./order-chat.css";

type Message = { id: number; role: "customer" | "staff"; message: string; createdAt: string };
type ChatRequest = (path: string, method?: string, data?: unknown, signal?: AbortSignal) => Promise<{ messages: Message[]; hasOlder: boolean }>;
const messageTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

export default function OrderChat({ orderId, orderNumber, staff = false, readOnly = false, request, onClose, onRead }: {
  orderId: string;
  orderNumber?: string | null;
  staff?: boolean;
  readOnly?: boolean;
  request: ChatRequest;
  onClose: () => void;
  onRead?: (orderId:string, messageId:number) => Promise<void>;
}) {
  const path = (staff ? "admin/" : "") + "orders/" + encodeURIComponent(orderId) + "/chat";
  const dialog = useRef<HTMLDialogElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const pollRefresh = useRef<() => void>(() => {});
  const submission = useRef<{ message: string; requestId: string } | null>(null);
  const readCallback = useRef(onRead);
  readCallback.current = onRead;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [animateFrom, setAnimateFrom] = useState<number | null>(null);
  const end = messages.at(-1)?.id;
  const oldest = messages[0]?.id;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let running = false, queued = false;
    let lastId: number | null = null;
    let firstLoad = true;
    let newestCustomer = 0;
    let acknowledged = 0;
    async function refresh() {
      if (controller.signal.aborted) return;
      if (running) { queued = true; return; }
      clearTimeout(timer);
      running = true;
      try {
        if (document.visibilityState === "visible") {
          const result = await request(firstLoad ? path : path + "?after=" + lastId, "GET", undefined, controller.signal);
          if (controller.signal.aborted) return;
          setConnected(true);
          const newest = result.messages.at(-1)?.id ?? lastId ?? 0;
          if (newest !== lastId) {
            if (!firstLoad) setAnimateFrom(lastId);
            setMessages(previous => [...previous, ...result.messages]);
            if (firstLoad) setHasOlder(result.hasOlder);
            lastId = newest;
          }
          firstLoad = false;
          newestCustomer = Math.max(newestCustomer,...result.messages.filter(message=>message.role==='customer').map(message=>message.id));
          if(staff && newestCustomer > acknowledged && readCallback.current){
            try{await readCallback.current(orderId,newestCustomer);acknowledged=newestCustomer;}catch{/* Retry acknowledgement on the next successful poll. */}
          }
        }
      } catch {
        if (!controller.signal.aborted) setConnected(false);
      } finally {
        running = false;
        if (!controller.signal.aborted) {
          setLoading(false);
          if (queued) { queued = false; void refresh(); }
          else timer = setTimeout(refresh, 2000);
        }
      }
    }

    pollRefresh.current = () => { void refresh(); };
    const stopLiveUpdates = onLiveUpdate(["chat"], pollRefresh.current);
    document.addEventListener("visibilitychange", pollRefresh.current);
    void refresh();
    return () => {
      controller.abort();
      stopLiveUpdates();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", pollRefresh.current);
    };
  }, [path, request]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [end]);

  async function loadOlder() {
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    setError("");
    try {
      const result = await request(path + "?before=" + oldest);
      setMessages(previous => [...result.messages, ...previous]);
      setHasOlder(result.hasOlder);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setError("");
    if (submission.current?.message !== message) {
      submission.current = { message, requestId: crypto.randomUUID() };
    }
    try {
      await request(path, "POST", submission.current);
      submission.current = null;
      setDraft("");
      pollRefresh.current();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <dialog className="order-chat" ref={dialog} aria-labelledby="order-chat-title" onCancel={event => { event.preventDefault(); onClose(); }}>
      <header className="order-chat-header">
        <MessageCircle size={20} aria-hidden="true" />
        <div><h2 id="order-chat-title">{staff ? "Customer chat" : "Chat with the café"}</h2><p>{orderNumber || orderId}</p></div>
        <button type="button" aria-label="Close chat" onClick={onClose}><X size={22} /></button>
      </header>
      <div className="order-chat-log" ref={log}>
        {loading && <p role="status">Loading messages…</p>}
        {!loading && !connected && <p role="status">Reconnecting to chat…</p>}
        {!loading && connected && messages.length === 0 && <p>No messages yet.</p>}
        {hasOlder && <button type="button" className="order-chat-older" onClick={() => void loadOlder()} disabled={loadingOlder}>Load older messages</button>}
        <div role="log" aria-label="Order messages">
          {messages.map(message => (
            <article key={message.id} className="order-chat-message"
              data-own={message.role === (staff ? "staff" : "customer")}
              data-new={animateFrom !== null && message.id > animateFrom}>
              <small>{message.role === (staff ? "staff" : "customer") ? "You" : staff ? "Customer" : "Café"} · {messageTime.format(new Date(message.createdAt.replace(" ", "T") + "Z"))}</small>
              <p>{message.message}</p>
            </article>
          ))}
        </div>
      </div>
      {error && <p className="order-chat-error" role="alert">{error}</p>}
      {!readOnly && <form className="order-chat-composer" onSubmit={send}>
        <textarea aria-label="Message" placeholder="Write a message…" rows={1} maxLength={500} value={draft}
          onChange={event => setDraft(event.target.value)} disabled={sending} />
        <button type="submit" aria-label="Send message" disabled={sending || !draft.trim()}><Send size={19} /></button>
      </form>}
    </dialog>
  );
}
