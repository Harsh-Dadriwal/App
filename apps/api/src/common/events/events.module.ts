import { Module } from "@nestjs/common";
import { QueueModule } from "../queue/queue.module";
import { DomainEventsService } from "./domain-events.service";
import { EventOutboxService } from "./event-outbox.service";
import { EventRelayWorker } from "./event-relay.worker";
import { SupabaseModule } from "../supabase/supabase.module";

@Module({
  imports: [QueueModule, SupabaseModule],
  providers: [DomainEventsService, EventOutboxService, EventRelayWorker],
  exports: [DomainEventsService, EventOutboxService]
})
export class EventsModule {}
