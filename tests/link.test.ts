import { describe, expect, it } from "vitest";
import { opensReview, reviewLink } from "../src/lib/link";

describe("the review link", () => {
  it("builds the address from the app's own site", () => {
    expect(reviewLink("https://wordarchive.codeflamer.workers.dev")).toBe("https://wordarchive.codeflamer.workers.dev/review");
  });

  it("recognises the review address, with or without a trailing slash", () => {
    expect(opensReview("/review")).toBe(true);
    expect(opensReview("/review/")).toBe(true);
  });

  it("doesn't treat other addresses as the review", () => {
    expect(opensReview("/")).toBe(false);
    expect(opensReview("/reviews")).toBe(false);
    expect(opensReview("/review/extra")).toBe(false);
  });
});
