import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { QUEUE_NAMES } from "../../common/queue/queue.constants";
import { RequirementsService, REQUIREMENT_PREPROCESS_JOB } from "./requirements.service";

type RequirementPreprocessPayload = {
  batchId: string;
};

@Injectable()
export class RequirementPreprocessWorker implements OnModuleDestroy {
  private readonly logger = new Logger(RequirementPreprocessWorker.name);
  private readonly worker?: Worker;

  constructor(private readonly requirementsService: RequirementsService) {
    if (process.env.DISABLE_QUEUES === "true" || !process.env.REDIS_URL) {
      this.logger.log("Requirement preprocess worker is disabled.");
      return;
    }

    this.worker = new Worker(
      QUEUE_NAMES.requirementPreprocess,
      async (job) => this.handle(job as Job<RequirementPreprocessPayload>),
      {
        connection: {
          url: process.env.REDIS_URL
        }
      }
    );
  }

  private async handle(job: Job<RequirementPreprocessPayload>) {
    if (job.name !== REQUIREMENT_PREPROCESS_JOB) {
      return;
    }

    await this.requirementsService.processPreprocessJob(job.data.batchId);
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
