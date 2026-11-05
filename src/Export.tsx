import { useState } from "react";
import { exportRows } from "./lib/api";
import { buildExport, describeCounts, EXPORT_TABLES, exportFileName, type ExportFile, type ExportTable, type ExportTables } from "./lib/exportData";
import { readOutbox } from "./lib/outbox";
import { saveFile } from "./lib/saveFile";

type Prepared = { name: string; text: string; file: ExportFile };

async function prepare(): Promise<Prepared> {
  const tables = Object.keys(EXPORT_TABLES) as ExportTable[];
  const rows = await Promise.all(tables.map((table) => exportRows(table)));
  const now = new Date();
  const file = buildExport(
    Object.fromEntries(tables.map((table, index) => [table, rows[index]])) as ExportTables,
    [...readOutbox("word"), ...readOutbox("quote")],
    now,
  );
  return { name: exportFileName(now), text: JSON.stringify(file, null, 2), file };
}

export function Export() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState<Prepared | null>(null);

  async function save(prepared: Prepared) {
    const result = await saveFile(prepared.name, prepared.text);
    setWaiting(result === "needs-tap" ? prepared : null);
    if (result === "needs-tap") setMessage(`Your file is ready, with ${describeCounts(prepared.file)}.`);
    else if (result === "cancelled") setMessage("The file wasn't saved. Tap Export my data to try again.");
    else setMessage(`Exported ${describeCounts(prepared.file)}.`);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      await action();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="export">
      {waiting ? (
        <button type="button" className="quiet" disabled={busy} onClick={() => void run(() => save(waiting))}>
          Save the file
        </button>
      ) : (
        <button type="button" className="quiet" disabled={busy} onClick={() => void run(async () => save(await prepare()))}>
          {busy ? "Exporting…" : "Export my data"}
        </button>
      )}
      {/* Announced like a status, without being mistaken for the save messages above. */}
      <p className="export-status" aria-live="polite">{message}</p>
      {failed && <p className="error" role="alert">Your data wasn't exported. Check your connection and try again.</p>}
    </div>
  );
}
