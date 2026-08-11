import { describe, expect, it } from "vitest";
import { pageMetadata, pageMetadataAtPath } from "@/lib/seo";

describe("SEO metadata", () => {
  it("keeps the Korean home canonical on the home page only", () => {
    expect(pageMetadata("home", "ko").alternates).toMatchObject({
      canonical: "/",
    });
  });

  it("gives guide articles their own canonical and Open Graph URL", () => {
    const metadata = pageMetadataAtPath("guides", "ko", "/guides/app");
    expect(metadata.alternates).toEqual({ canonical: "/guides/app" });
    expect(metadata.openGraph).toMatchObject({ url: "/guides/app" });
  });
});
