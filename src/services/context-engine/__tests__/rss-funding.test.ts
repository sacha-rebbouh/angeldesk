import { afterEach, describe, expect, it, vi } from "vitest";
import { rssFundingConnector } from "../connectors/rss-funding";

describe("rssFundingConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("ne porte une devise que lorsque le texte RSS la précise", async () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel>
        <item>
          <title><![CDATA[DollarCo raises $8M in funding]]></title>
          <link>https://example.com/dollar</link>
          <description><![CDATA[Series A funding round.]]></description>
          <pubDate>Mon, 20 Jul 2026 10:00:00 GMT</pubDate>
        </item>
        <item>
          <title><![CDATA[NeutralCo raises 7 million in funding]]></title>
          <link>https://example.com/neutral</link>
          <description><![CDATA[Seed funding round with no currency stated.]]></description>
          <pubDate>Mon, 20 Jul 2026 09:00:00 GMT</pubDate>
        </item>
      </channel></rss>`;

    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(
      new Response(xml, { status: 200, headers: { "Content-Type": "application/rss+xml" } })
    )));

    const deals = await rssFundingConnector.searchSimilarDeals?.({});
    const dollarDeal = deals?.find((deal) => deal.companyName === "DollarCo");
    const neutralDeal = deals?.find((deal) => deal.companyName === "NeutralCo");

    expect(dollarDeal).toMatchObject({ fundingAmount: 8_000_000, currency: "USD" });
    expect(neutralDeal).toMatchObject({ fundingAmount: 7_000_000 });
    expect(neutralDeal?.currency).toBeUndefined();
  });
});
