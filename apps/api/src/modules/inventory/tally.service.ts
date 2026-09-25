import { BadGatewayException, Injectable, ServiceUnavailableException } from "@nestjs/common";

export type TallyProduct = {
  id: string;
  name: string;
  group: string | null;
  unit: string | null;
  closingBalance: string | null;
  closingRate: string | null;
  hsnCode: string | null;
  gstApplicable: string | null;
};

function xmlEscape(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;"
  }[character] ?? character));
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function firstTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) || null : null;
}

/** Minimal parser for the fixed fields requested from Tally. Avoids accepting arbitrary XML as data. */
export function parseTallyStockItems(xml: string): TallyProduct[] {
  const blocks = xml.match(/<STOCKITEM(?:\s[^>]*)?>[\s\S]*?<\/STOCKITEM>/gi) ?? [];
  return blocks.map((block) => {
    const name = firstTag(block, "NAME") ?? firstTag(block, "MASTERID") ?? "Unnamed stock item";
    const masterId = firstTag(block, "MASTERID");
    return {
      id: masterId ?? name,
      name,
      group: firstTag(block, "PARENT"),
      unit: firstTag(block, "BASEUNITS"),
      closingBalance: firstTag(block, "CLOSINGBALANCE"),
      closingRate: firstTag(block, "CLOSINGRATE"),
      hsnCode: firstTag(block, "HSNCODE"),
      gstApplicable: firstTag(block, "GSTAPPLICABLE")
    };
  });
}

@Injectable()
export class TallyService {
  private get baseUrl() {
    return (process.env.TALLY_BASE_URL || "").trim().replace(/\/$/, "");
  }

  status() {
    return {
      configured: Boolean(this.baseUrl),
      company: process.env.TALLY_COMPANY?.trim() || null,
      message: this.baseUrl
        ? "Tally connector is configured. Use Refresh to read the live stock-item list."
        : "Set TALLY_BASE_URL to the TallyPrime HTTP Server address (for example http://127.0.0.1:9000)."
    };
  }

  private requestXml() {
    const company = process.env.TALLY_COMPANY?.trim();
    return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>EXPORT</TALLYREQUEST><TYPE>COLLECTION</TYPE><ID>AppStockItems</ID></HEADER><BODY><DESC><STATICVARIABLES>${company ? `<SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY>` : ""}<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="AppStockItems"><TYPE>StockItem</TYPE><FETCH>Name,MasterID,Parent,BaseUnits,ClosingBalance,ClosingRate,HSNCode,GSTApplicable</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
  }

  async listProducts(query = "", limit = 100) {
    if (!this.baseUrl) {
      throw new ServiceUnavailableException(this.status().message);
    }

    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", Accept: "text/xml" },
        body: this.requestXml(),
        signal: AbortSignal.timeout(12_000)
      });
    } catch {
      throw new BadGatewayException("Could not reach Tally. Confirm that TallyPrime is running, HTTP Server is enabled, and TALLY_BASE_URL is reachable from this API server.");
    }

    const xml = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(`Tally returned HTTP ${response.status}.`);
    }
    if (/<LINEERROR>|<ERRORS>[1-9]/i.test(xml)) {
      throw new BadGatewayException(firstTag(xml, "LINEERROR") ?? "Tally could not export stock items. Check the selected company and connector settings.");
    }

    const term = query.trim().toLowerCase();
    const products = parseTallyStockItems(xml)
      .filter((product) => !term || [product.name, product.group, product.hsnCode].some((value) => value?.toLowerCase().includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { products: products.slice(0, Math.min(Math.max(limit, 1), 250)), total: products.length };
  }
}
