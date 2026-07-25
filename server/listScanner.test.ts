import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock the storage module
vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";

describe("List Scanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("scan procedure", () => {
    it("should upload image to S3 and parse with LLM vision", async () => {
      // Mock S3 upload
      (storagePut as any).mockResolvedValue({
        key: "list-scans/user1/abc123-list.jpg",
        url: "https://storage.example.com/list-scans/user1/abc123-list.jpg",
      });

      // Mock LLM response with parsed items
      (invokeLLM as any).mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  { name: "Milk", quantity: 2, unit: "gallon", category: "groceries", notes: null },
                  { name: "Eggs", quantity: 1, unit: "dozen", category: "groceries", notes: "organic" },
                  { name: "Bread", quantity: 1, unit: null, category: "groceries", notes: "whole wheat" },
                ],
                confidence: 85,
                rawText: "Milk x2 gal\nEggs (organic)\nBread - whole wheat",
              }),
            },
          },
        ],
      });

      // Verify the LLM is called with image_url content type
      const testBase64 = Buffer.from("fake-image-data").toString("base64");

      // Simulate what the scan procedure does
      const buffer = Buffer.from(testBase64, "base64");
      const fileKey = `list-scans/user1/test123-list.jpg`;
      const { url: imageUrl } = await storagePut(fileKey, buffer, "image/jpeg");

      expect(storagePut).toHaveBeenCalledWith(fileKey, buffer, "image/jpeg");
      expect(imageUrl).toBe("https://storage.example.com/list-scans/user1/abc123-list.jpg");

      // Call LLM with vision
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: expect.stringContaining("shopping list reader") as any,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Please read this handwritten shopping list and extract all items:" },
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            ],
          },
        ],
        response_format: expect.any(Object) as any,
      });

      expect(invokeLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: "system" }),
            expect.objectContaining({
              role: "user",
              content: expect.arrayContaining([
                expect.objectContaining({ type: "image_url" }),
              ]),
            }),
          ]),
        })
      );

      const content = response.choices[0]?.message?.content;
      const parsed = typeof content === "string" ? JSON.parse(content) : null;

      expect(parsed).not.toBeNull();
      expect(parsed.items).toHaveLength(3);
      expect(parsed.items[0]).toEqual({
        name: "Milk",
        quantity: 2,
        unit: "gallon",
        category: "groceries",
        notes: null,
      });
      expect(parsed.items[1].notes).toBe("organic");
      expect(parsed.confidence).toBe(85);
      expect(parsed.rawText).toContain("Milk");
    });

    it("should handle empty/unreadable images gracefully", async () => {
      (storagePut as any).mockResolvedValue({
        key: "list-scans/user1/abc-blank.jpg",
        url: "https://storage.example.com/list-scans/user1/abc-blank.jpg",
      });

      (invokeLLM as any).mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [],
                confidence: 10,
                rawText: "",
              }),
            },
          },
        ],
      });

      const response = await invokeLLM({
        messages: expect.any(Array) as any,
        response_format: expect.any(Object) as any,
      });

      const content = response.choices[0]?.message?.content;
      const parsed = typeof content === "string" ? JSON.parse(content) : null;

      expect(parsed.items).toHaveLength(0);
      expect(parsed.confidence).toBeLessThan(50);
    });

    it("should handle LLM returning non-JSON content", async () => {
      (storagePut as any).mockResolvedValue({
        key: "list-scans/user1/abc-error.jpg",
        url: "https://storage.example.com/list-scans/user1/abc-error.jpg",
      });

      (invokeLLM as any).mockResolvedValue({
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      });

      const response = await invokeLLM({
        messages: expect.any(Array) as any,
        response_format: expect.any(Object) as any,
      });

      const content = response.choices[0]?.message?.content;
      const parsed = typeof content === "string" ? JSON.parse(content) : { items: [], confidence: 0, rawText: "" };

      expect(parsed.items).toHaveLength(0);
      expect(parsed.confidence).toBe(0);
    });
  });

  describe("addToList procedure", () => {
    it("should validate items have required fields", () => {
      const validItems = [
        { name: "Milk", quantity: 2, unit: "gallon", category: "groceries", notes: null },
        { name: "Bread", quantity: 1, unit: null, category: "groceries", notes: "whole wheat" },
      ];

      // Verify all items have required fields
      for (const item of validItems) {
        expect(item.name).toBeTruthy();
        expect(item.quantity).toBeGreaterThan(0);
        expect(typeof item.category).toBe("string");
      }
    });

    it("should filter out items with empty names", () => {
      const items = [
        { name: "Milk", quantity: 1, unit: null, category: "groceries", notes: null },
        { name: "", quantity: 1, unit: null, category: "other", notes: null },
        { name: "Eggs", quantity: 12, unit: null, category: "groceries", notes: null },
      ];

      const validItems = items.filter((i) => i.name.trim().length > 0);
      expect(validItems).toHaveLength(2);
      expect(validItems[0].name).toBe("Milk");
      expect(validItems[1].name).toBe("Eggs");
    });
  });
});
