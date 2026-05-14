import { Module } from "@nestjs/common";
import { QueueModule } from "../../common/queue/queue.module";
import { SupabaseModule } from "../../common/supabase/supabase.module";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { MaintenanceController } from "./maintenance.controller";
import { MaintenanceService } from "./maintenance.service";
import { TaskMonitorWorker } from "./task-monitor.worker";

@Module({
  imports: [QueueModule, SupabaseModule, TenancyModule, NotificationsModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService, TaskMonitorWorker]
})
export class MaintenanceModule {}
