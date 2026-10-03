import { describe, expect, it } from "vitest";
import { outsideRequests } from "./offline";

describe("offline proof", () => {
  it("counts only requests that left this laptop", () => {
    const entries = [
      "http://127.0.0.1:8787/forecast", "http://localhost:8787/chat", "data:image/svg+xml,abc", "blob:http://x/1",
      "https://fonts.googleapis.com/css2?family=Inter", "https://api.example.com/track",
    ].map((name) => ({ name }));
    expect(outsideRequests(entries)).toEqual(["https://fonts.googleapis.com/css2?family=Inter", "https://api.example.com/track"]);
  });
});
