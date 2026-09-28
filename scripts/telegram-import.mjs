// Récupère les documents (PDF/Word/PowerPoint) postés dans un groupe Telegram
// et les publie dans telegram-imports/ pour que l'application "La Syncope"
// puisse les importer automatiquement. Lancé toutes les ~10 minutes par
// .github/workflows/telegram-import.yml (aucune dépendance externe : fetch
// et fs sont natifs à Node 20).

import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const ROOT = "telegram-imports";
const FILES_DIR = path.join(ROOT, "files");
const INDEX_PATH = path.join(ROOT, "index.json");
const STATE_PATH = path.join(ROOT, "state.json");
const ALLOWED_EXT = [".pdf", ".doc", ".docx", ".ppt", ".pptx"];

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    return fallback;
  }
}

async function main() {
  if (!TOKEN || !CHAT_ID) {
    console.log("TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID non configuré dans les secrets du dépôt — rien à faire pour l'instant.");
    return;
  }

  fs.mkdirSync(FILES_DIR, { recursive: true });
  const index = loadJson(INDEX_PATH, []);
  const state = loadJson(STATE_PATH, { lastUpdateId: 0 });
  const knownIds = new Set(index.map((e) => e.id));

  const api = "https://api.telegram.org/bot" + TOKEN;
  const updatesUrl =
    api + "/getUpdates?offset=" + (state.lastUpdateId + 1) + "&timeout=0&allowed_updates=" + encodeURIComponent(JSON.stringify(["message"]));
  const res = await fetch(updatesUrl);
  const data = await res.json();
  if (!data.ok) {
    console.error("Erreur Telegram getUpdates:", data.description || data);
    process.exitCode = 1;
    return;
  }

  let maxUpdateId = state.lastUpdateId;
  let added = 0;

  for (const update of data.result) {
    if (update.update_id > maxUpdateId) maxUpdateId = update.update_id;
    const msg = update.message;
    if (!msg || !msg.document) continue;
    if (String(msg.chat.id) !== String(CHAT_ID)) continue;

    const doc = msg.document;
    const fileName = doc.file_name || doc.file_unique_id + ".bin";
    const ext = path.extname(fileName).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      console.log("Ignoré (extension non autorisée) :", fileName);
      continue;
    }

    const entryId = "tg_" + update.update_id + "_" + doc.file_unique_id;
    if (knownIds.has(entryId)) continue;

    const gfRes = await fetch(api + "/getFile?file_id=" + encodeURIComponent(doc.file_id));
    const gfData = await gfRes.json();
    if (!gfData.ok) {
      console.error("Erreur getFile pour", fileName, gfData.description);
      continue;
    }

    const fileUrl = "https://api.telegram.org/file/bot" + TOKEN + "/" + gfData.result.file_path;
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      console.error("Téléchargement impossible pour", fileName);
      continue;
    }
    const buf = Buffer.from(await fileRes.arrayBuffer());
    const safeName = fileName.replace(/[^A-Za-z0-9._-]+/g, "_");
    const storedName = entryId + "-" + safeName;
    fs.writeFileSync(path.join(FILES_DIR, storedName), buf);

    index.push({
      id: entryId,
      fileName: fileName,
      path: ROOT + "/files/" + storedName,
      mimeType: doc.mime_type || "",
      size: doc.file_size || buf.length,
      date: msg.date ? msg.date * 1000 : Date.now(),
      caption: msg.caption || "",
    });
    knownIds.add(entryId);
    added++;
    console.log("Ajouté :", fileName);
  }

  state.lastUpdateId = maxUpdateId;
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  console.log(added + " nouveau(x) document(s) importé(s).");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
