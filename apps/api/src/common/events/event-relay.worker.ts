import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { QUEUE_NAMES } from "../queue/queue.constants";
import { QueueService } from "../queue/queue.service";
import { EventOutboxService } from "./event-outbox.service";

type EventRelayPayload = {
  outboxId: string;
};

@Injectable()
export class EventRelayWorker implements OnModuleDestroy {
  private readonly logger = new Logger(EventRelayWorker.name);
  private readonly worker?: Worker;

  constructor(
    private readonly eventOutbox: EventOutboxService,
    private readonly queueService: QueueService
  ) {
    if (process.env.DISABLE_QUEUES === "true" || !process.env.REDIS_URL) {
      this.logger.log("Event relay worker is disabled.");
      return;
    }

    this.worker = new Worker(
      QUEUE_NAMES.eventRelay,
      async (job) => this.handle(job as Job<EventRelayPayload>),
      {
        connection: {
          url: process.env.REDIS_URL
        }
      }
    );
  }

  private async handle(job: Job<EventRelayPayload>) {
    if (job.name !== "relay-domain-event") {
      return;
    }

    const outboxRow = await this.eventOutbox.getPendingEvent(job.data.outboxId);

    if (!outboxRow) {
      this.logger.warn(`Outbox event ${job.data.outboxId} was not found.`);
      return;
    }

    if (outboxRow.status === "dispatched") {
      return;
    }

    try {
      await this.queueService.enqueue(
        QUEUE_NAMES.workflowEvents,
        outboxRow.event_type,
        {
          eventId: outboxRow.id,
          schemaVersion: outboxRow.schema_version,
          occurredAt: outboxRow.occurred_at,
          payload: outboxRow.payload
        },
        {
          jobId: outboxRow.id,
          removeOnComplete: true
        }
      );

      await this.eventOutbox.markDispatched(outboxRow.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to relay outbox event ${outboxRow.id}: ${message}`);
      await this.eventOutbox.markFailed(outboxRow, message);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
