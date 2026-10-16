import { Module } from "@nestjs/common";
import { IdentityController } from "./identity.controller";
import { IdentityService } from "./identity.service";
import { PhoneAuthController } from "./phone-auth.controller";
import { PhoneAuthService } from "./phone-auth.service";
import { TextBeeSmsService } from "./textbee-sms.service";
import { TenantsModule } from "../tenants/tenants.module";

@Module({
  imports: [TenantsModule],
  controllers: [IdentityController, PhoneAuthController],
  providers: [IdentityService, PhoneAuthService, TextBeeSmsService]
})
export class IdentityModule {}
