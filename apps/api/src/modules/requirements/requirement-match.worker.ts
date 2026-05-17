import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { QUEUE_NAMES } from "../../common/queue/queue.constants";
import { RequirementsService, REQUIREMENT_MATCH_JOB } from "./requirements.service";

type RequirementMatchPayload = {
  batchId: string;
};

@Injectable()
export class RequirementMatchWorker implements OnModuleDestroy {
  private readonly logger = new Logger(RequirementMatchWorker.name);
  private readonly worker?: Worker;

  constructor(private readonly requirementsService: RequirementsService) {
    if (process.env.DISABLE_QUEUES === "true" || !process.env.REDIS_URL) {
      this.logger.log("Requirement match worker is disabled.");
      return;
    }

    this.worker = new Worker(
      QUEUE_NAMES.requirementMatch,
      async (job) => this.handle(job as Job<RequirementMatchPayload>),
      {
        connection: {
          url: process.env.REDIS_URL
        }
      }
    );
  }

  private async handle(job: Job<RequirementMatchPayload>) {
    if (job.name !== REQUIREMENT_MATCH_JOB) {
      return;
    }

    await this.requirementsService.processMatchJob(job.data.batchId);
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
