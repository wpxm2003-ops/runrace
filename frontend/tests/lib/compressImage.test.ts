import { afterEach, describe, expect, it, vi } from "vitest";
import { compressImageForUpload } from "@/lib/compressImage";

function imageFile(size: number): File {
  return { name: "large.jpg", size, type: "image/jpeg" } as File;
}

describe("compressImageForUpload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an already-small image without decoding it", async () => {
    const file = imageFile(500_000);
    const createBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createBitmap);

    await expect(compressImageForUpload(file)).resolves.toBe(file);
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it("does not fall back to uploading a large original when decoding fails", async () => {
    const file = imageFile(15 * 1024 * 1024);
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("decode_failed")));
    vi.stubGlobal("Image", class {
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
      onload?: () => void;
      onerror?: () => void;
    });
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:test",
      revokeObjectURL: vi.fn(),
    });

    await expect(compressImageForUpload(file)).rejects.toThrow("image_load_failed");
  });
});
