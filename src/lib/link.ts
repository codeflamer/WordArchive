// The address a daily iPhone reminder opens, going straight to today's review.
export const REVIEW_PATH = "/review";

export function opensReview(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === REVIEW_PATH;
}

export function reviewLink(origin: string): string {
  return `${origin}${REVIEW_PATH}`;
}
