import { Module } from "@nestjs/common";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ServiceRequestsController } from "./service-requests.controller";
import { ServiceRequestsService } from "./service-requests.service";

@Module({
  imports: [TenancyModule, NotificationsModule],
  controllers: [ServiceRequestsController],
  providers: [ServiceRequestsService]
})
export class ServiceRequestsModule {}
