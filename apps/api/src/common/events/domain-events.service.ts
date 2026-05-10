import { Injectable } from "@nestjs/common";
import { QUEUE_NAMES } from "../queue/queue.constants";
import { QueueService } from "../queue/queue.service";

@Injectable()
export class DomainEventsService {
  constructor(private readonly queueService: QueueService) {}

  async publish(eventType: string, payload: Record<string, unknown>) {
    return this.queueService.enqueue(
      QUEUE_NAMES.workflowEvents,
      eventType,
      {
        schemaVersion: 1,
        occurredAt: new Date().toISOString(),
        payload
      },
      {
        removeOnComplete: true
      }
    );
  }
}
