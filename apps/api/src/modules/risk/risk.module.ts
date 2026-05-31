import { Module } from "@nestjs/common";
import { EventsModule } from "../../common/events/events.module";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { CreditController } from "./controllers/credit.controller";
import { RiskController } from "./controllers/risk.controller";
import { CreditService } from "./credit.service";
import { ScoringService } from "./scoring.service";
import { DelinquencyWorker } from "../../jobs/delinquency.worker";

@Module({
  imports: [EventsModule, TenancyModule],
  controllers: [CreditController, RiskController],
  providers: [CreditService, ScoringService, DelinquencyWorker],
  exports: [CreditService, ScoringService]
})
export class RiskModule {}
