import { readSheet } from "read-excel-file/universal";

export const UNKNOWN_CAMPUS_LOCATION = "Localização não informada";

export type ImportedCampusLocation = { block: string; room: string };

export function campusLocationKey(block: string, room: string | null): string {
  return `${block.trim().toLocaleLowerCase("pt-BR")}\u0000${(room ?? "").trim().toLocaleLowerCase("pt-BR")}`;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function parseCsv(text: string): unknown[][] {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/, 1)[0] ?? "";
  const delimiters = [";", ",", "\t"];
  let delimiter = ";";
  let maxCount = -1;
  for (const candidate of delimiters) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < firstLine.length; i++) {
      const char = firstLine[i];
      if (char === '"' && firstLine[i + 1] === '"' && quoted) i++;
      else if (char === '"') quoted = !quoted;
      else if (char === candidate && !quoted) count++;
    }
    if (count > maxCount) {
      delimiter = candidate;
      maxCount = count;
    }
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell.length === 0) {
        quoted = !quoted;
      } else {
        throw new Error("O CSV contém aspas fora de posição.");
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("O CSV contém uma célula com aspas sem fechamento.");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function parseCampusLocationRows(rows: unknown[][]): {
  locations: ImportedCampusLocation[];
  duplicates: number;
} {
  const header = rows[0];
  if (!header) throw new Error("O arquivo está vazio.");
  const nameColumn = header.findIndex((value) => normalizeHeader(value) === "nome");
  const locationColumn = header.findIndex((value) => normalizeHeader(value) === "localizacao");
  if (nameColumn < 0 || locationColumn < 0) {
    throw new Error('O arquivo precisa ter as colunas "Nome" e "Localização".');
  }

  const locations: ImportedCampusLocation[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];
  let duplicates = 0;
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index] ?? [];
    if (!row.some((value) => String(value ?? "").trim())) continue;

    const room = String(row[nameColumn] ?? "").trim();
    if (!room) {
      errors.push(`linha ${index + 1}: informe o nome do ambiente`);
      continue;
    }
    const block = String(row[locationColumn] ?? "").trim() || UNKNOWN_CAMPUS_LOCATION;
    const key = campusLocationKey(block, room);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    locations.push({ block, room });
  }

  if (errors.length) {
    const details = errors.slice(0, 5).join("; ");
    const remainder = errors.length > 5 ? `; e mais ${errors.length - 5} erro(s)` : "";
    throw new Error(`Corrija os ambientes antes de importar: ${details}${remainder}.`);
  }
  if (locations.length === 0) throw new Error("O arquivo não contém ambientes para importar.");
  return { locations, duplicates };
}

export async function parseCampusLocationFile(file: File): Promise<{
  locations: ImportedCampusLocation[];
  duplicates: number;
}> {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase("en-US");
  if (extension !== "csv" && extension !== "xlsx") {
    throw new Error("Selecione um arquivo CSV ou XLSX.");
  }

  if (extension === "csv") {
    const content = new TextDecoder().decode(await file.arrayBuffer());
    return parseCampusLocationRows(parseCsv(content.replace(/^\uFEFF/, "")));
  }

  let rows: unknown[][];
  try {
    rows = await readSheet(await file.arrayBuffer());
  } catch {
    throw new Error("Não foi possível ler o XLSX. Verifique se o arquivo está íntegro.");
  }
  return parseCampusLocationRows(rows);
}
