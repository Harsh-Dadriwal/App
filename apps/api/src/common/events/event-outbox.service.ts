import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { SupabaseAdminService } from "../supabase/supabase-admin.service";
import type {
  DomainEventEnvelope,
  EnqueueDomainEventResult,
  EventOutboxRow
} from "./domain-event.types";

const OUTBOX_TABLE = "platform_event_outbox";
const DEFAULT_SCHEMA_VERSION = 1;

function isMissingOutboxSchemaError(message: string) {
  return /relation .*platform_event_outbox/i.test(message) || /column .*platform_event_outbox/i.test(message);
}

@Injectable()
export class EventOutboxService {
  private readonly logger = new Logger(EventOutboxService.name);
  private missingSchemaWarningLogged = false;

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  createEnvelope(eventType: string, payload: Record<string, unknown>): DomainEventEnvelope {
    return {
      eventId: randomUUID(),
      eventType,
      schemaVersion: DEFAULT_SCHEMA_VERSION,
      occurredAt: new Date().toISOString(),
      payload
    };
  }

  async enqueue(eventType: string, payload: Record<string, unknown>): Promise<EnqueueDomainEventResult> {
    const envelope = this.createEnvelope(eventType, payload);
    const outboxRow: EventOutboxRow = {
      id: envelope.eventId,
      event_type: envelope.eventType,
      schema_version: envelope.schemaVersion,
      payload: envelope.payload,
      status: "pending",
      occurred_at: envelope.occurredAt,
      available_at: envelope.occurredAt,
      dispatched_at: null,
      attempt_count: 0,
      last_error: null
    };

    const result = await this.supabaseAdmin.getClient().from(OUTBOX_TABLE).insert(outboxRow);

    if (!result.error) {
      return {
        mode: "outbox",
        envelope,
        outboxId: outboxRow.id
      };
    }

    if (isMissingOutboxSchemaError(result.error.message)) {
      if (!this.missingSchemaWarningLogged) {
        this.logger.warn(
          "platform_event_outbox table is missing. Falling back to direct queue publishing until the migration is applied."
        );
        this.missingSchemaWarningLogged = true;
      }

      return {
        mode: "direct",
        envelope
      };
    }

    throw new Error(result.error.message);
  }

  async getPendingEvent(outboxId: string) {
    const result = await this.supabaseAdmin
      .getClient()
      .from(OUTBOX_TABLE)
      .select("id, event_type, schema_version, payload, status, occurred_at, available_at, dispatched_at, attempt_count, last_error")
      .eq("id", outboxId)
      .maybeSingle();

    if (result.error) {
      throw new Error(result.error.message);
    }

    return (result.data ?? null) as EventOutboxRow | null;
  }

  async markDispatched(outboxId: string) {
    const result = await this.supabaseAdmin
      .getClient()
      .from(OUTBOX_TABLE)
      .update({
        status: "dispatched",
        dispatched_at: new Date().toISOString(),
        last_error: null
      })
      .eq("id", outboxId);

    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  async markFailed(row: EventOutboxRow, errorMessage: string) {
    const result = await this.supabaseAdmin
      .getClient()
      .from(OUTBOX_TABLE)
      .update({
        status: "failed",
        attempt_count: Number(row.attempt_count ?? 0) + 1,
        last_error: errorMessage.slice(0, 2000),
        available_at: new Date(Date.now() + 60_000).toISOString()
      })
      .eq("id", row.id);

    if (result.error) {
      throw new Error(result.error.message);
    }
  }
}
