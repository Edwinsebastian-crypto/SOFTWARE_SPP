/* =========================================================================
   export.js — File exports of the Reports panel (no external libraries: the CSP only allows our own scripts).

     SPP.exporter.xlsx(sheets)          -> Blob (.xlsx, one worksheet per dataset, bold header, frozen row, filters)
     SPP.exporter.csv(dataset)          -> string (UTF-8, quoted, RFC 4180)
     SPP.exporter.zip(files)            -> Blob (.zip, "stored" without compression)
     SPP.exporter.download(name, blob)  -> saves the file in the browser
     SPP.exporter.fileName(base, ext)   -> "spp-<base>-2026-10-29.<ext>"

   A "dataset" is   { id, title, columns: [{ key, label }], rows: [{ [key]: value }] }.
   ========================================================================= */
/* global module */ // this file also runs under Node when tests/export.test.js requires it
(function () {
    'use strict';
    const SPP = window.SPP || (window.SPP = {});

    // ------------------------------------------------------------------ helpers
    const encoder = new TextEncoder();
    const bytes = (text) => encoder.encode(text);

    /** Characters not allowed in XML 1.0 (controls except tab, LF and CR, plus the two non-characters). */
    const forbiddenXmlChar = (ch) => {
        const c = ch.charCodeAt(0);
        return c <= 8 || c === 11 || c === 12 || (c >= 14 && c <= 31) || c === 0xFFFE || c === 0xFFFF;
    };

    /** Removes the characters that are not allowed in XML 1.0 and escapes the reserved ones. */
    const xml = (value) => String(value)
        .split('').filter((ch) => !forbiddenXmlChar(ch)).join('')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const slug = (text) => String(text || 'report').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report';

    function today() {
        const d = new Date();
        const two = (n) => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
    }

    function fileName(base, ext) {
        return 'spp-' + slug(base) + '-' + today() + '.' + ext;
    }

    /** Header + rows of a dataset as a matrix of raw values. */
    function matrix(dataset) {
        const columns = dataset.columns || [];
        return {
            header: columns.map((c) => c.label),
            rows: (dataset.rows || []).map((row) => columns.map((c) => (row[c.key] === undefined ? null : row[c.key])))
        };
    }

    // ------------------------------------------------------------------ CSV
    function csvCell(value) {
        if (value === null || value === undefined) return '';
        let text = typeof value === 'number' ? String(value) : String(value);
        // spreadsheet formula injection: a text cell must never start as a formula
        if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text) && !/^-?\d+([.,]\d+)?$/.test(text)) text = "'" + text;
        return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    function csv(dataset) {
        const { header, rows } = matrix(dataset);
        return [header].concat(rows).map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }

    // ------------------------------------------------------------------ ZIP ("stored", no compression)
    let crcTable = null;
    function crc32(data) {
        if (!crcTable) {
            crcTable = new Uint32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
                crcTable[n] = c >>> 0;
            }
        }
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    /** @param {{name: string, data: string|Uint8Array}[]} files */
    function zip(files) {
        const now = new Date();
        const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
        const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
        const parts = [];
        const central = [];
        let offset = 0;
        files.forEach((file) => {
            const name = bytes(file.name);
            const data = typeof file.data === 'string' ? bytes(file.data) : file.data;
            const crc = crc32(data);
            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
            local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true); local.setUint32(14, crc, true);
            local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
            parts.push(new Uint8Array(local.buffer), name, data);

            const entry = new DataView(new ArrayBuffer(46));
            entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true);
            entry.setUint16(10, 0, true); entry.setUint16(12, dosTime, true); entry.setUint16(14, dosDate, true); entry.setUint32(16, crc, true);
            entry.setUint32(20, data.length, true); entry.setUint32(24, data.length, true); entry.setUint16(28, name.length, true);
            entry.setUint16(30, 0, true); entry.setUint16(32, 0, true); entry.setUint16(34, 0, true); entry.setUint16(36, 0, true);
            entry.setUint32(38, 0, true); entry.setUint32(42, offset, true);
            central.push(new Uint8Array(entry.buffer), name);
            offset += 30 + name.length + data.length;
        });
        const centralSize = central.reduce((total, part) => total + part.length, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
        end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
        return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
    }

    // ------------------------------------------------------------------ XLSX
    function columnLetter(index) {
        let letter = '';
        for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
        return letter;
    }

    /** Worksheet names: max. 31 characters, no  \ / ? * [ ] :  and unique. */
    function sheetNames(sheets) {
        const used = new Set();
        return sheets.map((sheet, index) => {
            let base = String(sheet.title || 'Sheet ' + (index + 1)).replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet ' + (index + 1);
            let name = base;
            for (let n = 2; used.has(name.toLowerCase()); n++) name = base.slice(0, 31 - String(n).length - 1) + ' ' + n;
            used.add(name.toLowerCase());
            return name;
        });
    }

    function sheetXml(dataset) {
        const { header, rows } = matrix(dataset);
        const widths = header.map((label) => String(label).length);
        const rowXml = [];
        const cell = (value, column, row, style) => {
            const ref = columnLetter(column) + row;
            const s = style ? ' s="' + style + '"' : '';
            if (value === null || value === undefined || value === '') return '';
            if (typeof value === 'number' && Number.isFinite(value)) {
                widths[column] = Math.max(widths[column], String(value).length);
                return '<c r="' + ref + '"' + s + '><v>' + value + '</v></c>';
            }
            const text = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
            widths[column] = Math.max(widths[column], Math.min(60, text.length));
            return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + xml(text) + '</t></is></c>';
        };
        rowXml.push('<row r="1" ht="22" customHeight="1">' + header.map((label, c) => cell(label, c, 1, 1) || '<c r="' + columnLetter(c) + '1" s="1"/>').join('') + '</row>');
        rows.forEach((line, r) => {
            rowXml.push('<row r="' + (r + 2) + '">' + line.map((value, c) => cell(value, c, r + 2, 0)).join('') + '</row>');
        });
        const lastColumn = columnLetter(Math.max(0, header.length - 1));
        const lastRow = rows.length + 1;
        const cols = '<cols>' + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Math.min(60, Math.max(10, w + 2)) + '" customWidth="1"/>').join('') + '</cols>';
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
            '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
            '<sheetFormatPr defaultRowHeight="15"/>' + cols +
            '<sheetData>' + rowXml.join('') + '</sheetData>' +
            (header.length ? '<autoFilter ref="A1:' + lastColumn + lastRow + '"/>' : '') +
            '</worksheet>';
    }

    const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FF264A38"/><bgColor indexed="64"/></patternFill></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

    /** @param {object[]} datasets  one worksheet per dataset */
    function xlsx(datasets) {
        const list = datasets.length ? datasets : [{ title: 'Empty', columns: [{ key: 'a', label: 'No data' }], rows: [] }];
        const names = sheetNames(list);
        const files = [
            {
                name: '[Content_Types].xml',
                data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
                    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
                    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
                    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
                    list.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
                    '</Types>'
            },
            {
                name: '_rels/.rels',
                data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
            },
            {
                name: 'xl/workbook.xml',
                data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
                    '<sheets>' + names.map((n, i) => '<sheet name="' + xml(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>'
            },
            {
                name: 'xl/_rels/workbook.xml.rels',
                data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                    list.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
                    '<Relationship Id="rId' + (list.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
            },
            { name: 'xl/styles.xml', data: STYLES_XML }
        ].concat(list.map((dataset, i) => ({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(dataset) })));
        const blob = zip(files);
        return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    // ------------------------------------------------------------------ download
    function download(name, blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 1500);
    }

    SPP.exporter = { xlsx, csv, zip, download, fileName, matrix, slug, crc32, today };
    if (typeof module !== 'undefined' && module.exports) module.exports = SPP.exporter;
})();
