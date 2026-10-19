import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Writes downloaded bytes (server CSV exports, invoice PDFs) to the app
 * documents folder and opens the system share sheet — the same pattern the
 * payments ledger PDF export already uses.
 */
export async function shareDownloadedFile(filename: string, bytes: Uint8Array, mimeType: string): Promise<void> {
  const file = new FileSystem.File(FileSystem.Paths.document, filename);
  const stream = file.writableStream();
  const writer = stream.getWriter();
  await writer.write(bytes);
  await writer.close();
  const fileUri = (file as unknown as { uri: string }).uri;
  await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: filename });
}
