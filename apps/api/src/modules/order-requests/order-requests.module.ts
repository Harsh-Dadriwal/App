import { Module } from "@nestjs/common";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { InventoryModule } from "../inventory/inventory.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrderRequestsController } from "./order-requests.controller";
import { OrderRequestsService } from "./order-requests.service";

@Module({
  imports: [TenancyModule, NotificationsModule, InventoryModule],
  controllers: [OrderRequestsController],
  providers: [OrderRequestsService],
  exports: [OrderRequestsService]
})
export class OrderRequestsModule {}
