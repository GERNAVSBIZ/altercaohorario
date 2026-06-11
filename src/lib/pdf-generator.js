import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

/**
 * Generates a professional PDF containing request details.
 * @param {Object} data - The request data
 * @returns {Buffer} - PDF document buffer
 */
export async function generateRequestPdf(data) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 dimensions in points (72 points/inch)

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const navyColor = rgb(11 / 255, 60 / 255, 93 / 255); // #0b3c5d (SBIZ Primary)
  const orangeColor = rgb(239 / 255, 91 / 255, 37 / 255); // #ef5b25 (SBIZ Accent)
  const darkTextColor = rgb(45 / 255, 55 / 255, 72 / 255); // Slate 800
  const lightBgColor = rgb(247 / 255, 250 / 255, 252 / 255); // Slate 50
  const headerBgColor = rgb(240 / 255, 244 / 255, 248 / 255);

  let y = 800;

  // Header Border Accent
  page.drawRectangle({
    x: 40,
    y: 815,
    width: 515,
    height: 6,
    color: orangeColor,
  });

  // Main Header Container
  page.drawRectangle({
    x: 40,
    y: 720,
    width: 515,
    height: 95,
    color: headerBgColor,
  });

  // Header Text
  page.drawText("NAV BRASIL - DNIZ", {
    x: 55,
    y: 785,
    size: 14,
    font: helveticaBold,
    color: navyColor,
  });

  page.drawText("SOLICITAÇÃO DE PRORROGAÇÃO DE HORÁRIO", {
    x: 55,
    y: 765,
    size: 12,
    font: helveticaBold,
    color: darkTextColor,
  });

  const formattedDate = new Date(data.createdAt || Date.now()).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  page.drawText(`Registrado em: ${formattedDate}`, {
    x: 55,
    y: 745,
    size: 9,
    font: helveticaFont,
    color: darkTextColor,
  });

  const shortId = data.id ? data.id.slice(-6).toUpperCase() : "NOVO";
  page.drawText(`ID: #${shortId}`, {
    x: 450,
    y: 785,
    size: 12,
    font: helveticaBold,
    color: orangeColor,
  });

  const isPending = data.status === "pending_confirmation";
  const isRejected = data.approvalStatus === "not_authorized";

  let statusText = "CONFIRMADO";
  let statusColor = rgb(46 / 255, 117 / 255, 89 / 255); // Green

  if (isPending) {
    statusText = "PENDENTE";
    statusColor = orangeColor; // Orange
  } else if (isRejected) {
    statusText = "REPROVADO";
    statusColor = rgb(200 / 255, 30 / 255, 30 / 255); // Red
  }

  page.drawText(`Status: ${statusText}`, {
    x: 420,
    y: 745,
    size: 10,
    font: helveticaBold,
    color: statusColor,
  });

  y = 700;

  // Helper function to draw section titles
  const drawSectionHeader = (title) => {
    // Add extra spacing for subsequent sections to prevent overlapping the previous section's rows
    if (y < 700) {
      y -= 22;
    } else {
      y -= 10;
    }
    // Section background header
    page.drawRectangle({
      x: 40,
      y: y - 5,
      width: 515,
      height: 20,
      color: navyColor,
    });
    // Section text
    page.drawText(title, {
      x: 50,
      y: y,
      size: 10,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });
    y -= 15;
  };

  // Helper function to draw key-value pairs
  const drawRow = (leftLabel, leftVal, rightLabel, rightVal) => {
    y -= 16;
    // Alternate row backgrounds for better readability
    page.drawRectangle({
      x: 40,
      y: y - 3,
      width: 515,
      height: 16,
      color: lightBgColor,
    });

    page.drawText(leftLabel, {
      x: 50,
      y: y,
      size: 9,
      font: helveticaBold,
      color: navyColor,
    });

    page.drawText(String(leftVal || "-"), {
      x: 160,
      y: y,
      size: 9,
      font: helveticaFont,
      color: darkTextColor,
    });

    if (rightLabel) {
      page.drawText(rightLabel, {
        x: 320,
        y: y,
        size: 9,
        font: helveticaBold,
        color: navyColor,
      });

      page.drawText(String(rightVal || "-"), {
        x: 430,
        y: y,
        size: 9,
        font: helveticaFont,
        color: darkTextColor,
      });
    }
  };

  // 1. DADOS DA EMPRESA
  drawSectionHeader("1. DADOS DA EMPRESA SOLICITANTE");
  drawRow("Razão Social:", data.company.name, "CNPJ/CPF:", data.company.taxId);
  drawRow("E-mail:", data.company.email, "Telefone:", data.company.phone);
  drawRow("Endereço:", data.company.address);

  // 2. OPERADOR E SOLICITANTE
  drawSectionHeader("2. OPERADOR DA AERONAVE E SOLICITANTE");
  drawRow("Operador:", data.aircraft.operator, "Espécie do Serviço:", data.serviceType);
  drawRow("Solicitante:", data.requestor.name, "Função:", data.requestor.role);
  drawRow("E-mail Faturamento:", data.requestor.billingEmail);

  // 3. PERÍODO SOLICITADO
  drawSectionHeader("3. PERÍODO DA SOLICITAÇÃO");
  const formattedStart = new Date(data.period.start).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const formattedEnd = new Date(data.period.end).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  drawRow("Data/Hora Início:", formattedStart, "Data/Hora Fim:", formattedEnd);

  // 4. IDENTIFICAÇÃO DA AERONAVE E TRIPULAÇÃO
  drawSectionHeader("4. DADOS DO VOO E TRIPULAÇÃO");
  drawRow("Aeronave (Tipo/Qtd):", data.aircraft.typeQty, "Matrícula:", data.aircraft.registration);
  drawRow("Piloto em Comando:", data.pilot.name, "Código ANAC Piloto:", data.pilot.anacCode);

  // 5. OBSERVAÇÕES
  drawSectionHeader("5. OBSERVAÇÕES ADICIONAIS");
  y -= 10;
  
  const notesText = data.notes || "Sem observações adicionais.";
  
  // Wrap text helper for notes section
  const wrapText = (text, maxWidth, font, fontSize) => {
    const words = text.split(" ");
    const lines = [];
    let currentLine = "";

    words.forEach(word => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  };

  const wrappedNotes = wrapText(notesText, 495, helveticaFont, 9);
  wrappedNotes.forEach(line => {
    y -= 14;
    page.drawText(line, {
      x: 50,
      y: y,
      size: 9,
      font: helveticaOblique,
      color: darkTextColor,
    });
  });

  // Footer / Seals
  y = 120;
  
  page.drawLine({
    start: { x: 40, y: y + 20 },
    end: { x: 555, y: y + 20 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  page.drawText("VALIDAÇÃO E CONFIRMAÇÃO", {
    x: 50,
    y: y,
    size: 10,
    font: helveticaBold,
    color: navyColor,
  });

  const ipText = `IP do Confirmador: ${data.confirmationIp || "N/A"}`;
  const timestampText = `Data de Confirmação: ${data.confirmedAt ? new Date(data.confirmedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "N/A"}`;
  
  page.drawText(data.status === "pending_confirmation" 
    ? "Documento aguardando validação de e-mail de dupla confirmação."
    : "Documento assinado digitalmente através de validação de e-mail de dupla confirmação.", {
    x: 50,
    y: y - 15,
    size: 8,
    font: helveticaOblique,
    color: darkTextColor,
  });

  let validationDetails = `${ipText}   |   ${timestampText}`;
  if (data.status !== "pending_confirmation" && data.company?.email) {
    validationDetails += `   |   E-mail de Contato: ${data.company.email}`;
  }

  page.drawText(validationDetails, {
    x: 50,
    y: y - 30,
    size: 8,
    font: helveticaFont,
    color: darkTextColor,
  });

  page.drawText("NAV Brasil - DNIZ  |  NAVMANAGER", {
    x: 50,
    y: 50,
    size: 8,
    font: helveticaFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
