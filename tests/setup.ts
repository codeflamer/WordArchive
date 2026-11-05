import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  // Choosing the Review tab changes the address, so each test starts from the plain one.
  if (typeof window !== "undefined") window.history.replaceState(null, "", "/");
});
