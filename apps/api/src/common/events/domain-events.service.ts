import { Injectable } from "@nestjs/common";
import { QUEUE_NAMES } from "../queue/queue.constants";
import { QueueService } from "../queue/queue.service";
import { EventOutboxService } from "./event-outbox.service";

@Injectable()
export class DomainEventsService {
  constructor(
    private readonly queueService: QueueService,
    private readonly eventOutbox: EventOutboxService
  ) {}

  async publish(eventType: string, payload: Record<string, unknown>) {
    const result = await this.eventOutbox.enqueue(eventType, payload);

    if (result.mode === "direct") {
      return this.queueService.enqueue(
        QUEUE_NAMES.workflowEvents,
        eventType,
        {
          eventId: result.envelope.eventId,
          schemaVersion: result.envelope.schemaVersion,
          occurredAt: result.envelope.occurredAt,
          payload: result.envelope.payload
        },
        {
          jobId: result.envelope.eventId,
          removeOnComplete: true
        }
      );
    }

    return this.queueService.enqueue(
      QUEUE_NAMES.eventRelay,
      "relay-domain-event",
      {
        outboxId: result.outboxId
      },
      {
        jobId: result.outboxId,
        removeOnComplete: true
      }
    );
  }
}
