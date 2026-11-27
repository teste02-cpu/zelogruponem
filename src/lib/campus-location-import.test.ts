import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  campusLocationKey,
  parseCampusLocationFile,
  parseCampusLocationRows,
  UNKNOWN_CAMPUS_LOCATION,
} from "./campus-location-import";

function fileWithBytes(name: string, bytes: Uint8Array): File {
  const data = bytes.slice();
  const file = new File([data], name);
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => data.buffer,
  });
  return file;
}

function utf8File(name: string, content: string): File {
  return fileWithBytes(name, new TextEncoder().encode(content));
}

function xlsxFile(): File {
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4"><si><t>Nome</t></si><si><t>Localização</t></si><si><t>Auditório</t></si><si><t>2º ANDAR</t></si></sst>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row></sheetData></worksheet>`,
  };
  const workbook = zipSync(
    Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)])),
  );
  return fileWithBytes("ambientes.xlsx", workbook);
}

describe("campus location imports", () => {
  it("parses CSV headers, keeps distinct environments, and marks missing locations", async () => {
    const csv = [
      '\uFEFF"Nome";"Tipo";"Localização";"Observações"',
      '"SALA 03";"Sala de aula";"BLOCO A 1º ANDAR";""',
      '"SALA 03";"Sala de aula";"BLOCO B 2º ANDAR";""',
      '"Sala 05";"Sala de aula";"";""',
      '"SALA 03";"Sala de aula";"BLOCO A 1º ANDAR";"duplicado"',
    ].join("\r\n");
    const result = await parseCampusLocationFile(utf8File("ambientes.csv", csv));

    expect(result.locations).toEqual([
      { block: "BLOCO A 1º ANDAR", room: "SALA 03" },
      { block: "BLOCO B 2º ANDAR", room: "SALA 03" },
      { block: UNKNOWN_CAMPUS_LOCATION, room: "Sala 05" },
    ]);
    expect(result.duplicates).toBe(1);
  });

  it("reads XLSX data and the first worksheet", async () => {
    const result = await parseCampusLocationFile(xlsxFile());

    expect(result.locations).toEqual([{ block: "2º ANDAR", room: "Auditório" }]);
  });

  it("reports missing columns and names instead of importing partial data", () => {
    expect(() => parseCampusLocationRows([["Ambiente"], ["Auditório"]])).toThrow(
      'O arquivo precisa ter as colunas "Nome" e "Localização".',
    );
    expect(() =>
      parseCampusLocationRows([
        ["Nome", "Localização"],
        ["", "Bloco A"],
      ]),
    ).toThrow("Corrija os ambientes antes de importar: linha 2: informe o nome do ambiente.");
  });

  it("compares duplicate keys without changing saved labels", () => {
    expect(campusLocationKey(" Bloco A ", " Sala 01 ")).toBe(
      campusLocationKey("bloco a", "sala 01"),
    );
  });
});
