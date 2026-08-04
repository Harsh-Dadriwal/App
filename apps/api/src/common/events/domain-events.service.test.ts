import assert from "node:assert/strict";
import test from "node:test";
import { DomainEventsService } from "./domain-events.service";
import { QUEUE_NAMES } from "../queue/queue.constants";

test("publish falls back to direct workflow event enqueue when outbox schema is unavailable", async () => {
  const calls: Array<{ queueName: string; jobName: string; payload: Record<string, unknown>; options?: Record<string, unknown> }> = [];
  const service = new DomainEventsService(
    {
      enqueue: async (
        queueName: string,
        jobName: string,
        payload: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => {
        calls.push({ queueName, jobName, payload, options });
        return { ok: true };
      }
    } as any,
    {
      enqueue: async () => ({
        mode: "direct" as const,
        envelope: {
          eventId: "evt-1",
          eventType: "wallet.entry.posted",
          schemaVersion: 1,
          occurredAt: "2026-07-26T00:00:00.000Z",
          payload: { tenantId: "tenant-1" }
        }
      })
    } as any
  );

  await service.publish("wallet.entry.posted", { tenantId: "tenant-1" });

  assert.deepEqual(calls, [
    {
      queueName: QUEUE_NAMES.workflowEvents,
      jobName: "wallet.entry.posted",
      payload: {
        eventId: "evt-1",
        schemaVersion: 1,
        occurredAt: "2026-07-26T00:00:00.000Z",
        payload: { tenantId: "tenant-1" }
      },
      options: {
        jobId: "evt-1",
        removeOnComplete: true
      }
    }
  ]);
});

test("publish enqueues relay jobs when the event is persisted in the outbox", async () => {
  const calls: Array<{ queueName: string; jobName: string; payload: Record<string, unknown>; options?: Record<string, unknown> }> = [];
  const service = new DomainEventsService(
    {
      enqueue: async (
        queueName: string,
        jobName: string,
        payload: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => {
        calls.push({ queueName, jobName, payload, options });
        return { ok: true };
      }
    } as any,
    {
      enqueue: async () => ({
        mode: "outbox" as const,
        outboxId: "evt-2",
        envelope: {
          eventId: "evt-2",
          eventType: "requirement.procurement.generated",
          schemaVersion: 1,
          occurredAt: "2026-07-26T00:00:00.000Z",
          payload: { requirementBatchId: "batch-1" }
        }
      })
    } as any
  );

  await service.publish("requirement.procurement.generated", { requirementBatchId: "batch-1" });

  assert.deepEqual(calls, [
    {
      queueName: QUEUE_NAMES.eventRelay,
      jobName: "relay-domain-event",
      payload: {
        outboxId: "evt-2"
      },
      options: {
        jobId: "evt-2",
        removeOnComplete: true
      }
    }
  ]);
});
