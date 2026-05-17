import { Module } from "@nestjs/common";
import { EventsModule } from "../../common/events/events.module";
import { QueueModule } from "../../common/queue/queue.module";
import { SupabaseModule } from "../../common/supabase/supabase.module";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { ImagePreprocessorService } from "./image-preprocessor.service";
import { RequirementExtractWorker } from "./requirement-extract.worker";
import { RequirementMatchWorker } from "./requirement-match.worker";
import { RequirementOcrService } from "./requirement-ocr.service";
import { RequirementPreprocessWorker } from "./requirement-preprocess.worker";
import { RequirementsController } from "./requirements.controller";
import { RequirementsService } from "./requirements.service";
import { TesseractOcrWorker } from "./tesseract-ocr.worker";

@Module({
  imports: [QueueModule, SupabaseModule, TenancyModule, EventsModule],
  controllers: [RequirementsController],
  providers: [
    ImagePreprocessorService,
    RequirementOcrService,
    RequirementsService,
    RequirementPreprocessWorker,
    RequirementExtractWorker,
    RequirementMatchWorker,
    TesseractOcrWorker
  ]
})
export class RequirementsModule {}
