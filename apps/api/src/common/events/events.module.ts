import { Module } from "@nestjs/common";
import { QueueModule } from "../queue/queue.module";
import { DomainEventsService } from "./domain-events.service";

@Module({
  imports: [QueueModule],
  providers: [DomainEventsService],
  exports: [DomainEventsService]
})
export class EventsModule {}
