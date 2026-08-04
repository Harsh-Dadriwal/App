export type DomainEventEnvelope = {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type EventOutboxStatus = "pending" | "dispatched" | "failed";

export type EventOutboxRow = {
  id: string;
  event_type: string;
  schema_version: number;
  payload: Record<string, unknown>;
  status: EventOutboxStatus;
  occurred_at: string;
  available_at: string;
  dispatched_at: string | null;
  attempt_count: number;
  last_error: string | null;
  created_at?: string;
  updated_at?: string;
};

export type EnqueueDomainEventResult =
  | {
      mode: "outbox";
      envelope: DomainEventEnvelope;
      outboxId: string;
    }
  | {
      mode: "direct";
      envelope: DomainEventEnvelope;
    };
