import { Controller, Headers, HttpCode, Post, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { PriceListService } from "./price-list.service";

/**
 * Called every 15 minutes by Supabase (pg_cron + pg_net, see db/price_list_auto_sync.sql)
 * so stock follows Tally without anyone pressing "Update from Tally". There is no signed-in
 * user here; a shared secret in the x-cron-secret header stands in for one.
 */
@Controller("/api/v1/inventory/price-list")
export class PriceListCronController {
  constructor(private readonly priceList: PriceListService) {}

  @Post("/scheduled-sync")
  @HttpCode(200)
  async scheduledSync(@Headers("x-cron-secret") secret: string | undefined) {
    const expected = (process.env.PRICE_LIST_CRON_SECRET || "").trim();
    if (!expected) throw new ServiceUnavailableException("Scheduled price list sync is not set up.");
    const given = Buffer.from(secret ?? "");
    const wanted = Buffer.from(expected);
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
      throw new UnauthorizedException("Not allowed.");
    }
    return { data: await this.priceList.syncScheduledTenant() };
  }
}
