import type { Response } from "express";

interface PresenceSubscriber {
  res: Response;
  userId: number;
}

const subscribers = new Set<PresenceSubscriber>();

export function addPresenceSubscriber(res: Response, userId: number): () => void {
  const subscriber = { res, userId };
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

export function notifyPresenceUpdated(changedUserId?: number): void {
  const payload = JSON.stringify({
    type: "presence_updated",
    userId: changedUserId ?? null,
    at: Date.now(),
  });

  for (const subscriber of Array.from(subscribers)) {
    try {
      subscriber.res.write(`event: presence\ndata: ${payload}\n\n`);
    } catch {
      subscribers.delete(subscriber);
    }
  }
}
