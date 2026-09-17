// Extraction runs in a child process, not in the worker: a hostile PDF or DOCX can allocate far
// beyond the V8 heap (pdf.js keeps decoded streams in typed arrays), so the only reliable cap is a
// separate process the parent can watch and kill. The parent sends the bytes over IPC and kills
// this process on timeout or when its RSS passes the limit.
//
// Posts back text or an error name, never an error message (messages can quote document content).
export type ExtractChildInput = { kind: "pdf" | "docx"; bytes: Uint8Array };
export type ExtractChildOutput = { ok: true; text: string } | { ok: false; errorName: string };

async function extract({ kind, bytes }: ExtractChildInput): Promise<string> {
  if (kind === "pdf") {
    // unpdf detaches the buffer it is given; this process owns its copy.
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    await pdf.cleanup();
    return text.join("\n\n");
  }
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return value;
}

function send(message: ExtractChildOutput): void {
  process.send?.(message);
}

process.once("message", (input) => {
  extract(input as ExtractChildInput).then(
    (text) => send({ ok: true, text }),
    (error: unknown) =>
      send({ ok: false, errorName: error instanceof Error ? error.name : "error" }),
  );
});
