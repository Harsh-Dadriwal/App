import { Module } from "@nestjs/common";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { ProjectMediaController } from "./project-media.controller";
import { ProjectMediaService } from "./project-media.service";

@Module({
  imports: [TenancyModule],
  controllers: [ProjectMediaController],
  providers: [ProjectMediaService]
})
export class ProjectMediaModule {}
