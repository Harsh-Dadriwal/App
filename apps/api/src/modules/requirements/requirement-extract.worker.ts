import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { QUEUE_NAMES } from "../../common/queue/queue.constants";
import { RequirementsService, REQUIREMENT_EXTRACT_JOB } from "./requirements.service";

type RequirementExtractPayload = {
  batchId: string;
};

@Injectable()
export class RequirementExtractWorker implements OnModuleDestroy {
  private readonly logger = new Logger(RequirementExtractWorker.name);
  private readonly worker?: Worker;

  constructor(private readonly requirementsService: RequirementsService) {
    if (process.env.DISABLE_QUEUES === "true" || !process.env.REDIS_URL) {
      this.logger.log("Requirement extract worker is disabled.");
      return;
    }

    this.worker = new Worker(
      QUEUE_NAMES.requirementExtract,
      async (job) => this.handle(job as Job<RequirementExtractPayload>),
      {
        connection: {
          url: process.env.REDIS_URL
        }
      }
    );
  }

  private async handle(job: Job<RequirementExtractPayload>) {
    if (job.name !== REQUIREMENT_EXTRACT_JOB) {
      return;
    }

    await this.requirementsService.processExtractJob(job.data.batchId);
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
