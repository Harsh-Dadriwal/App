import { Module } from "@nestjs/common";
import { EventsModule } from "../../common/events/events.module";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CreditController } from "./controllers/credit.controller";
import { RiskController } from "./controllers/risk.controller";
import { CreditService } from "./credit.service";
import { ScoringService } from "./scoring.service";
import { CreditEngineService } from "./credit-engine.service";
import { DelinquencyWorker } from "../../jobs/delinquency.worker";

@Module({
  imports: [EventsModule, TenancyModule, NotificationsModule],
  controllers: [CreditController, RiskController],
  providers: [CreditService, ScoringService, CreditEngineService, DelinquencyWorker],
  exports: [CreditService, ScoringService, CreditEngineService]
})
export class RiskModule {}
