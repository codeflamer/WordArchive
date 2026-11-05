export type SaveResult = "shared" | "downloaded" | "cancelled" | "needs-tap";

// On iPhone the share sheet's "Save to Files" is the reliable way to save from a Home Screen app.
// The phone only opens it straight after a tap, so if preparing the file took too long, it asks for one more tap.
export async function saveFile(name: string, text: string): Promise<SaveResult> {
  const file = new File([text], name, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return "shared";
    } catch (error) {
      const reason = (error as Error).name;
      if (reason === "AbortError") return "cancelled";
      if (reason === "NotAllowedError") return "needs-tap";
      throw error;
    }
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 60000);
  return "downloaded";
}
