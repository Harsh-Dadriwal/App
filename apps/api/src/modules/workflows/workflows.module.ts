import { Module } from "@nestjs/common";
import { EventsModule } from "../../common/events/events.module";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";

@Module({
  imports: [EventsModule, TenancyModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService]
})
export class WorkflowsModule {}
