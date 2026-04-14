import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { isValidDocumentSignature } from "@/lib/file-signatures";

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function pdfBuffer() {
  return Buffer.from("%PDF-1.7\n%%EOF", "utf8");
}

function pngBuffer() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
}

function jpegBuffer() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
}

function oleBuffer() {
  return Buffer.concat([OLE_MAGIC, Buffer.from("legacy-office", "utf8")]);
}

async function ooxmlBuffer(rootPath: "word" | "xl" | "ppt") {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file(`${rootPath}/document.xml`, "<xml/>");
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("isValidDocumentSignature", () => {
  it("accepts PDF, PNG, JPEG and legacy Office signatures", async () => {
    await expect(isValidDocumentSignature(pdfBuffer(), "application/pdf")).resolves.toBe(true);
    await expect(isValidDocumentSignature(pngBuffer(), "image/png")).resolves.toBe(true);
    await expect(isValidDocumentSignature(jpegBuffer(), "image/jpeg")).resolves.toBe(true);
    await expect(isValidDocumentSignature(oleBuffer(), "application/msword")).resolves.toBe(true);
    await expect(isValidDocumentSignature(oleBuffer(), "application/vnd.ms-excel")).resolves.toBe(true);
    await expect(isValidDocumentSignature(oleBuffer(), "application/vnd.ms-powerpoint")).resolves.toBe(true);
  });

  it("accepts OOXML containers with the expected internal structure", async () => {
    await expect(
      isValidDocumentSignature(
        await ooxmlBuffer("word"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).resolves.toBe(true);

    await expect(
      isValidDocumentSignature(
        await ooxmlBuffer("xl"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    ).resolves.toBe(true);

    await expect(
      isValidDocumentSignature(
        await ooxmlBuffer("ppt"),
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      )
    ).resolves.toBe(true);
  });

  it("rejects mismatched signatures and malformed OOXML archives", async () => {
    await expect(isValidDocumentSignature(pdfBuffer(), "image/png")).resolves.toBe(false);
    await expect(
      isValidDocumentSignature(
        Buffer.from("not a zip", "utf8"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).resolves.toBe(false);

    const zip = new JSZip();
    zip.file("notes.txt", "no office payload");
    await expect(
      isValidDocumentSignature(
        await zip.generateAsync({ type: "nodebuffer" }),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    ).resolves.toBe(false);
  });
});
