// ------------------------------------------------------------
// pdfExport.js — Modern Multipage + Railway-Theme + Fußzeile
// ------------------------------------------------------------
// Features:
//  • Mehrseitiger Export (A4 landscape) mit sauberem Seitenumbruch
//  • Schmale Gleisspalte, Stunden-/30min-/10min-Raster
//  • Block-Beschriftung: "Garnitur + Zugnummer" (Variante B)
//  • Railway-Style Farbthemen (ÖBB/SBB/DB) + Pastell-Aufhellung
//  • Fußzeile auf jeder Seite: "Verschub- und Anlagenbelegungsplaner - AbstellAPP"
//  • Globale Funktion (window.generateModernPdf) + robuste Logs/Fehlerbehandlung
// ------------------------------------------------------------

// ====== Konfiguration ======
const RAILWAY_THEME = "oebb";     // "oebb" | "sbb" | "db"
const FOOTER_ALIGN  = "left";     // "left" | "center" | "right"
const FOOTER_TEXT   = "Verschub- und Anlagenbelegungsplaner - AbstellAPP";

// ====== Hilfsfunktionen ======
function parseTrainName(raw){
  raw = (raw || '').replace(/\(.*?\)/g, '').trim();
  const parts = raw.split(/\s+/);
  const number = parts[0] || '';
  const type   = parts[1] || '';
  return { number, type };
}

function extractTrackNumber(name){
  const m = (name || '').match(/^\d+/);
  return m ? m[0] : (name || '');
}

function railwayColorForTrain(trainName, baseHex){
  const name = (trainName || '').toLowerCase();
  const themes = {
    oebb: {
      rj:   "#800000", // Railjet
      cj:   "#2e86de", // Cityjet
      kiss: "#8000ff", // Stadler KISS
      ic:   "#ff8000", // Wiesel/IC
      vt:   "#008000", // Diesel/VT
      wz:   "#008000", // Wendezug
      et:   "#2e86de", // Elektrotriebwagen
      default: baseHex
    },
    sbb: {
      rj:   "#d00000",
      ic:   "#d00000",
      ir:   "#005bbb",
      kiss: "#6a4cff",
      et:   "#0077cc",
      vt:   "#009c3b",
      wz:   "#999999",
      default: baseHex
    },
    db: {
      rj:   "#cc0000",
      ic:   "#cc0000",
      ir:   "#cc0000",
      s:    "#009c3b",
      re:   "#005bbb",
      rb:   "#005bbb",
      kiss: "#6a4cff",
      wz:   "#999999",
      vt:   "#ff9500",
      default: baseHex
    }
  };
  const t = themes[RAILWAY_THEME] || themes.oebb;
  if (name.includes('rj')) return t.rj;
  if (name.includes('cityjet') || name.includes('cj(')) return t.cj;
  if (name.includes('kiss')) return t.kiss;
  if (name.includes(' ic ') || name.startsWith('ic') || name.includes(' ic')) return t.ic;
  if (name.includes(' vt') || name.startsWith('vt') || name.includes('diesel')) return t.vt;
  if (name.includes(' et') || name.startsWith('et')) return t.et;
  if (name.includes(' wz') || name.startsWith('wz')) return t.wz;
  return t.default;
}

function toPastel(hex, factor){
  const { r, g, b } = hexToRgb(hex);
  const blend = c => Math.round(c + (255 - c) * factor);
  return { r: blend(r), g: blend(g), b: blend(b) };
}

function hexToRgb(hex){
  const h = (hex || '#3a86ff').replace('#','');
  const n = parseInt(h, 16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}

// ====== Hauptfunktion ======
async function generateModernPdf(){
  try{
    console.log('[pdfExport] generateModernPdf() START');
    if (!(window.jspdf && window.jspdf.jsPDF)) {
      alert('jsPDF ist nicht geladen.');
      return;
    }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    // Geometrie
    const margin = 40;
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const innerW = pageW - margin * 2;
    const innerH = pageH - margin * 2;

    // Layoutparameter
    const leftCol = 90;        // schmale Gleisspalte
    const rowH    = 50;        // Höhe pro Gleiszeile
    const topOff  = 60;        // Platz für Titel + Zeitachse
    const RAW_SCALE = 2;       // Minuten->px (deine JSON/Web-Logik)
    const MINUTES  = 1440;
    const scaleX   = (innerW - leftCol) / (MINUTES * RAW_SCALE);

    // Wie viele Tracks pro Seite?
    const tracksPerPage = Math.max(1, Math.floor((innerH - topOff) / rowH));

    // Kopf + Raster je Seite
    function drawPageFrame(pageIndex, totalPages){
      // Titelzeile
      pdf.setFont('helvetica','bold');
      pdf.setFontSize(16);
      pdf.setTextColor(0);
      pdf.text('Abstellplan 00:00–24:00', margin, margin + 15);

      pdf.setFont('helvetica','normal');
      pdf.setFontSize(10);
      pdf.text(`Seite ${pageIndex + 1} / ${totalPages}`, pageW - margin - 60, margin + 15);

      // Trennlinie
      pdf.setDrawColor(180);
      pdf.setLineWidth(0.5);
      pdf.line(margin, margin + 25, pageW - margin, margin + 25);

      // Zeit-Raster: volle Stunde
      for (let h = 0; h <= 24; h++){
        const x = margin + leftCol + (h * 60 * RAW_SCALE * scaleX);
        pdf.setDrawColor(180); pdf.setLineWidth(0.4);
        pdf.line(x, margin + topOff, x, pageH - margin);
        pdf.setFontSize(8); pdf.setTextColor(0);
        pdf.text(`${String(h).padStart(2,'0')}:00`, x - 8, margin + topOff - 6);
      }
      // 30 Minuten
      for (let m = 30; m < 1440; m += 60) {
        const x = margin + leftCol + (m * RAW_SCALE * scaleX);
        pdf.setDrawColor(220); pdf.setLineWidth(0.2);
        pdf.line(x, margin + topOff, x, pageH - margin);
      }
      // 10 Minuten
      for (let m = 10; m < 1440; m += 10) {
        const x = margin + leftCol + (m * RAW_SCALE * scaleX);
        pdf.setDrawColor(240); pdf.setLineWidth(0.1);
        pdf.line(x, margin + topOff, x, pageH - margin);
      }
    }

    // Fußzeile pro Seite
    function drawFooter(){
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(90);
      const y = pageH - margin + 18;
      if (FOOTER_ALIGN === 'center'){
        const w = pdf.getTextWidth(FOOTER_TEXT);
        pdf.text(FOOTER_TEXT, pageW/2 - w/2, y);
      } else if (FOOTER_ALIGN === 'right'){
        const w = pdf.getTextWidth(FOOTER_TEXT);
        pdf.text(FOOTER_TEXT, pageW - margin - w, y);
      } else {
        pdf.text(FOOTER_TEXT, margin, y); // left
      }
    }

    // Seiten berechnen & zeichnen
    const totalPages = Math.ceil((jsonData?.tracks?.length || 0) / tracksPerPage);
    for (let p = 0; p < totalPages; p++){
      if (p > 0) pdf.addPage();
      drawPageFrame(p, totalPages);

      const startIndex = p * tracksPerPage;
      const endIndex   = Math.min(startIndex + tracksPerPage, jsonData.tracks.length);

      for (let i = startIndex; i < endIndex; i++){
        const track = jsonData.tracks[i];
        const rowIdx = i - startIndex;
        const baseY  = margin + topOff + rowIdx * rowH;

        // Gleislabel kompakt
        const trackNr = extractTrackNumber(track.name);
        pdf.setFont('helvetica','bold'); pdf.setFontSize(11); pdf.setTextColor(0);
        pdf.text(trackNr, margin + 5, baseY + 15);
        pdf.setFont('helvetica','normal'); pdf.setFontSize(8);
        pdf.text(`${track.length ?? ''} m`, margin + 5, baseY + 28);

        // Grundlinie
        pdf.setDrawColor(230); pdf.setLineWidth(0.3);
        pdf.line(margin + leftCol, baseY + rowH - 8, pageW - margin, baseY + rowH - 8);

        // Blöcke
        (jsonData.blocks || [])
          .filter(b => b.trackId === track.id)
          .forEach(b => {
            const train = (jsonData.trains || []).find(t => t.id === b.trainId);
            if (!train) return;

            const themedColor = railwayColorForTrain(train.name, train.color || '#3a86ff');
            const pastel = toPastel(themedColor, 0.55);

            const { number, type } = parseTrainName(train.name);
            const label = `${type} ${number}`.trim();

            const x = margin + leftCol + (b.startMin * RAW_SCALE * scaleX);
            const w = (b.endMin - b.startMin) * RAW_SCALE * scaleX;
            const top = baseY + 5;
            const height = rowH - 10;

            pdf.setFillColor(pastel.r, pastel.g, pastel.b);
            pdf.rect(x, top, w, height, 'F');

            pdf.setTextColor(0,0,0);
            pdf.setFontSize(w < 40 ? 7 : 9);
            pdf.text(label, x + 3, baseY + rowH / 2 + 3);
          });
      }

      // Fußzeile der Seite
      drawFooter();
    }

    console.log('[pdfExport] pdf.save(...)');
    pdf.save('Abstellplan_Modern.pdf');
    console.log('[pdfExport] DONE');
  } catch (err){
    console.error('[pdfExport] ERROR:', err);
    alert('PDF-Fehler: ' + (err && err.message ? err.message : err));
  }
}

// global sichtbar machen
window.generateModernPdf = generateModernPdf;
console.log('[pdfExport] geladen & generateModernPdf registriert.');
