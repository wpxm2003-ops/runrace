import { afterEach, describe, expect, it, vi } from "vitest";
import { compressImageForUpload, isAcceptableCompressedSize } from "@/lib/compressImage";

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

// 압축 수용 경계 — canvas 없는 node 환경에서도 판정식 자체를 핀으로 고정한다.
describe("isAcceptableCompressedSize", () => {
  it("600KB 이하면 원본 크기와 무관하게 허용", () => {
    expect(isAcceptableCompressedSize(600_000, 10 * 1024 * 1024)).toBe(true);
  });

  it("600KB 초과라도 원본보다 작고 5MB 이하면 허용(폴백 상한)", () => {
    expect(isAcceptableCompressedSize(5 * 1024 * 1024, 6 * 1024 * 1024)).toBe(true);
  });

  it("원본보다 커졌으면 거부", () => {
    expect(isAcceptableCompressedSize(700_000, 650_000)).toBe(false);
  });

  it("원본보다 작아도 5MB를 넘으면 거부", () => {
    expect(isAcceptableCompressedSize(5 * 1024 * 1024 + 1, 10 * 1024 * 1024)).toBe(false);
  });
});
