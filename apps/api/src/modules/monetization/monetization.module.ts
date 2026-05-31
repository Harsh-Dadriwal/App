import { Module } from "@nestjs/common";
import { EventsModule } from "../../common/events/events.module";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { EscrowController } from "./controllers/escrow.controller";
import { FeesController } from "./controllers/fees.controller";
import { SubscriptionController } from "./controllers/subscription.controller";
import { EscrowService } from "./escrow.service";
import { FeeService } from "./fee.service";
import { SubscriptionService } from "./subscription.service";

@Module({
  imports: [EventsModule, TenancyModule],
  controllers: [EscrowController, FeesController, SubscriptionController],
  providers: [EscrowService, FeeService, SubscriptionService],
  exports: [EscrowService, FeeService, SubscriptionService]
})
export class MonetizationModule {}
