import { Injectable } from "@nestjs/common";
import { Queue, type JobsOptions } from "bullmq";

@Injectable()
export class QueueService {
  private readonly queues = new Map<string, Queue>();

  private get disabled() {
    return process.env.DISABLE_QUEUES === "true" || !process.env.REDIS_URL;
  }

  private getQueue(name: string) {
    let queue = this.queues.get(name);

    if (!queue) {
      queue = new Queue(name, {
        connection: {
          url: process.env.REDIS_URL
        }
      });
      this.queues.set(name, queue);
    }

    return queue;
  }

  async enqueue(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    options?: JobsOptions
  ) {
    if (this.disabled) {
      return {
        skipped: true,
        queueName,
        jobName,
        payload
      };
    }

    const queue = this.getQueue(queueName);
    return queue.add(jobName, payload, options);
  }
}
