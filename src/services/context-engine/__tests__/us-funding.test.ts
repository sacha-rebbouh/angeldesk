import { afterEach, describe, expect, it, vi } from "vitest";
import { usFundingConnector } from "../connectors/us-funding";

describe("usFundingConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("conserve la devise USD détectée lors du mapping SimilarDeal", async () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel><item>
        <title><![CDATA[Acme raises $12 million in seed funding]]></title>
        <link>https://example.com/acme</link>
        <description><![CDATA[AI software company backed by Sequoia.]]></description>
        <pubDate>Mon, 20 Jul 2026 10:00:00 GMT</pubDate>
      </item></channel></rss>`;

    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(
      new Response(xml, { status: 200, headers: { "Content-Type": "application/rss+xml" } })
    )));

    const deals = await usFundingConnector.searchSimilarDeals?.({});

    expect(deals).toHaveLength(1);
    expect(deals?.[0]).toMatchObject({
      companyName: "Acme",
      fundingAmount: 12_000_000,
      currency: "USD",
    });
  });
});
