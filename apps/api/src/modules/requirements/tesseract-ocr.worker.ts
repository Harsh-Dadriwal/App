import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { QUEUE_NAMES } from "../../common/queue/queue.constants";
import { RequirementsService, REQUIREMENT_OCR_JOB } from "./requirements.service";

type RequirementOcrPayload = {
  batchId: string;
  sourceId: string;
};

@Injectable()
export class TesseractOcrWorker implements OnModuleDestroy {
  private readonly logger = new Logger(TesseractOcrWorker.name);
  private readonly worker?: Worker;

  constructor(private readonly requirementsService: RequirementsService) {
    if (process.env.DISABLE_QUEUES === "true" || !process.env.REDIS_URL) {
      this.logger.log("Tesseract OCR worker is disabled.");
      return;
    }

    this.worker = new Worker(
      QUEUE_NAMES.ocrExtraction,
      async (job) => this.handle(job as Job<RequirementOcrPayload>),
      {
        connection: {
          url: process.env.REDIS_URL
        }
      }
    );
  }

  private async handle(job: Job<RequirementOcrPayload>) {
    if (job.name !== REQUIREMENT_OCR_JOB) {
      return;
    }

    await this.requirementsService.processOcrJob(job.data.batchId, job.data.sourceId);
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
