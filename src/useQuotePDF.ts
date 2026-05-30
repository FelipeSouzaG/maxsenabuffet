import html2pdf from "html2pdf.js";
import { BuffetType, Client, Quote } from "./types";

interface QuotePDFData {
  quote: Quote;
  client?: Client | null;
  buffetType?: BuffetType | null;
}

export const generateQuoteHTML = (data: QuotePDFData): string => {
  const { quote, client, buffetType } = data;

  const escapeHtml = (value: unknown): string =>
    String(value ?? "").replace(/[&<>"']/g, (char) => {
      const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[char] || char;
    });

  const textOrFallback = (value: unknown, fallback = "N/A"): string => {
    const text = String(value ?? "").trim();
    return text ? escapeHtml(text) : fallback;
  };

  const textWithLineBreaks = (value: unknown): string =>
    escapeHtml(value).replace(/\r?\n/g, "<br>");

  const onlyDigits = (value: unknown): string =>
    String(value ?? "").replace(/\D/g, "");

  const formatPhone = (value: unknown): string => {
    let digits = onlyDigits(value);
    if (digits.length > 11 && digits.startsWith("55")) {
      digits = digits.slice(2);
    }

    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return String(value ?? "");
  };

  const formatDocument = (value: unknown): string => {
    const digits = onlyDigits(value);
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    }
    if (digits.length === 14) {
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
    }
    return String(value ?? "");
  };

  const formatCep = (value: unknown): string => {
    const digits = onlyDigits(value);
    if (digits.length === 8) {
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}-${digits.slice(5)}`;
    }
    return String(value ?? "");
  };

  // Validar e limpar valores numericos
  const ensureNumber = (value: any): number => {
    if (typeof value === "number" && !isNaN(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    return 0;
  };

  // Parser para dados de buffet (subtypes e items)
  interface BuffetSubtype {
    id: string;
    name: string;
    items: string[];
  }

  interface BuffetTypeMeta {
    subtypes: BuffetSubtype[];
  }

  const BUFFET_META_PREFIX = "__MAX_BUFFET_META__";

  const parseBuffetMeta = (
    description: string | null | undefined,
  ): BuffetTypeMeta => {
    const raw = String(description || "");
    if (!raw.startsWith(BUFFET_META_PREFIX)) return { subtypes: [] };

    try {
      const parsed = JSON.parse(raw.slice(BUFFET_META_PREFIX.length)) as {
        subtypes?: BuffetSubtype[];
      };
      return {
        subtypes: Array.isArray(parsed.subtypes) ? parsed.subtypes : [],
      };
    } catch {
      return { subtypes: [] };
    }
  };

  const formatCurrency = (value: number): string => {
    const validValue = ensureNumber(value);
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(validValue);
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString + "T00:00:00");
    return date.toLocaleDateString("pt-BR");
  };

  const statusLabel: Record<string, string> = {
    DRAFT: "Rascunho",
    SENT: "Enviado / Aguardando Aprovação",
    APPROVED: "Aprovado / Evento",
  };

  const eventDate = quote.eventDate
    ? formatDate(quote.eventDate)
    : "A confirmar";
  const responseDueDate = quote.responseDueDate
    ? formatDate(quote.responseDueDate)
    : "N/A";
  const createdDate = new Date(quote.createdAt).toLocaleDateString("pt-BR");
  const sortedRules = [...(quote.rules || [])].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  const quoteNumber = textOrFallback(quote.number, "ORC-????");
  const statusText = textOrFallback(statusLabel[quote.status] || quote.status);

  return `
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        .quote-pdf-root {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: white;
          color: #222;
          padding: 0;
          width: 210mm;
        }
        
        .container {
          max-width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          padding: 15mm;
          background: white;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
          border-bottom: 3px solid #C41E3A;
          padding-bottom: 15px;
        }
        
        .company-info {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        
        .company-info img {
          height: 100px;
          width: auto;
          object-fit: contain;
        }
        
        .company-info h1 {
          font-size: 28px;
          color: #C41E3A;
          margin-bottom: 5px;
          display: none;
        }
        
        .company-info p {
          font-size: 12px;
          color: #666;
          display: none;
        }
        
        .quote-meta {
          text-align: right;
        }
        
        .quote-meta h2 {
          font-size: 16px;
          color: #0066cc;
          margin-bottom: 5px;
        }
        
        .quote-meta p {
          font-size: 11px;
          color: #666;
          margin-bottom: 3px;
        }
        
        .status-badge {
          display: inline-block;
          padding: 4px 8px;
          background-color: #e8f4f8;
          border: 1px solid #0066cc;
          border-radius: 3px;
          font-size: 11px;
          color: #0066cc;
          font-weight: bold;
          margin-top: 5px;
        }
        
        .content {
          margin-bottom: 20px;
        }
        
        .section {
          margin-bottom: 15px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        
        .section-title {
          font-size: 12px;
          font-weight: bold;
          color: #fff;
          background-color: #C41E3A;
          padding: 6px 8px;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .section-content {
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 3px;
          background-color: #fafafa;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          font-size: 11px;
        }
        
        .info-grid.full {
          grid-template-columns: 1fr;
        }
        
        .info-item {
          display: flex;
          flex-direction: column;
        }
        
        .info-item label {
          font-weight: bold;
          color: #C41E3A;
          font-size: 10px;
          text-transform: uppercase;
          margin-bottom: 2px;
        }
        
        .info-item value {
          color: #555;
          line-height: 1.4;
        }
        
        .table-section {
          margin-bottom: 15px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          margin-bottom: 10px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        
        table thead {
          background-color: #C41E3A;
          color: white;
        }
        
        table th {
          padding: 6px 8px;
          text-align: left;
          font-weight: bold;
          font-size: 10px;
          text-transform: uppercase;
          border: 1px solid #ddd;
        }
        
        table td {
          padding: 8px;
          border: 1px solid #ddd;
          background-color: white;
        }
        
        table tbody tr:nth-child(even) td {
          background-color: #f9f9f9;
        }

        tr {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        
        .table-right {
          text-align: right;
        }
        
        .summary-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          margin-bottom: 15px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        
        .summary-table td {
          padding: 6px 8px;
          border: 1px solid #ddd;
        }
        
        .summary-table .label {
          font-weight: bold;
          background-color: #f0f0f0;
          width: 50%;
        }
        
        .summary-table .value {
          text-align: right;
          background-color: white;
        }
        
        .summary-table .total {
          font-weight: bold;
          background-color: #0066cc !important;
          color: white !important;
          font-size: 12px;
        }
        
        .notes-section {
          background-color: #fffacd;
          border-left: 4px solid #ffc107;
          padding: 8px;
          margin-bottom: 15px;
          font-size: 10px;
          line-height: 1.5;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        
        .notes-section strong {
          display: block;
          margin-bottom: 4px;
          font-size: 11px;
        }
        
        .footer {
          font-size: 9px;
          color: #999;
          text-align: center;
          margin-top: 20px;
          padding-top: 10px;
          border-top: 1px solid #ddd;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        
        .page-break {
          page-break-after: always;
        }

        .pdf-page-break-before {
          break-before: page;
          page-break-before: always;
          padding-top: 10mm;
        }
        
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
          
          .container {
            box-shadow: none;
            max-width: 100%;
            margin: 0;
            padding: 15mm;
          }
        }
      </style>
    <div class="quote-pdf-root" data-quote-number="${quoteNumber}">
      <div class="container">
        <!-- Header -->
        <div class="header">
          <div class="company-info">
            <img src="/img/logo.png" alt="Max Buffet" />
            <h1>Max Buffet</h1>
            <p>Serviços de Buffet Personalizado</p>
          </div>
          <div class="quote-meta">
            <h2>ORÇAMENTO</h2>
            <p><strong>${quoteNumber}</strong></p>
            <p>Criado em: ${createdDate}</p>
            <div class="status-badge">${statusText}</div>
          </div>
        </div>
        
        <!-- Content -->
        <div class="content">
          <!-- Cliente -->
          <div class="section">
            <div class="section-title">📋 Dados do Cliente</div>
            <div class="section-content">
              <div class="info-grid">
                <div class="info-item">
                  <label>Nome</label>
                  <value>${textOrFallback(client?.name)}</value>
                </div>
                <div class="info-item">
                  <label>Telefone</label>
                  <value>${textOrFallback(formatPhone(client?.phone))}</value>
                </div>
                <div class="info-item">
                  <label>Email</label>
                  <value>${textOrFallback(client?.email)}</value>
                </div>
                <div class="info-item">
                  <label>Documento</label>
                  <value>${textOrFallback(formatDocument(client?.document))}</value>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Tipo de Buffet -->
          <div class="section">
            <div class="section-title">🍽️ Tipo de Buffet</div>
            <div class="section-content">
              <div class="info-grid full">
                <div class="info-item">
                  <label>Serviço</label>
                  <value><strong>${textOrFallback(buffetType?.name)}</strong></value>
                </div>
              </div>
              ${
                buffetType?.description
                  ? (() => {
                      const meta = parseBuffetMeta(buffetType.description);
                      if (meta.subtypes.length === 0) return "";

                      return `
              <div class="info-item" style="margin-top: 12px;">
                <label>Detalhes do Serviço</label>
                <div style="margin-top: 8px; padding: 8px; background-color: #f5f5f5; border-left: 3px solid #C41E3A; font-size: 10px;">
                  ${meta.subtypes
                    .map(
                      (subtype) =>
                        `<div style="margin-bottom: 10px;">
                    <strong>${textOrFallback(subtype.name)}:</strong>
                    <div style="margin-left: 12px; margin-top: 4px;">
                      ${subtype.items
                        .map(
                          (item) =>
                            `<div style="margin-bottom: 3px;">• ${textOrFallback(item, "")}</div>`,
                        )
                        .join("")}
                    </div>
                  </div>`,
                    )
                    .join("")}
                </div>
              </div>
                      `;
                    })()
                  : ""
              }
            </div>
          </div>
          
          <!-- Local do Evento -->
          <div class="section">
            <div class="section-title">📍 Local do Evento</div>
            <div class="section-content">
              <div class="info-grid">
                <div class="info-item">
                  <label>Endereço</label>
                  <value>${textOrFallback(quote.eventLocationStreet)}, ${textOrFallback(quote.eventLocationNumber, "")} ${quote.eventLocationComplement ? "- " + textOrFallback(quote.eventLocationComplement, "") : ""}</value>
                </div>
                <div class="info-item">
                  <label>Bairro / Cidade</label>
                  <value>${textOrFallback(quote.eventLocationDistrict)}, ${textOrFallback(quote.eventLocationCity)}/${textOrFallback(quote.eventLocationState, "")}</value>
                </div>
                <div class="info-item">
                  <label>CEP</label>
                  <value>${textOrFallback(formatCep(quote.eventLocationCep))}</value>
                </div>
                <div class="info-item">
                  <label>Data do Evento</label>
                  <value><strong>${eventDate}</strong></value>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Detalhes Financeiros -->
          <div class="section">
            <div class="section-title">💰 Detalhes Financeiros</div>
            <div class="section-content">
              <table class="summary-table">
                <tr>
                  <td class="label">Quantidade de Pessoas:</td>
                  <td class="value">${ensureNumber(quote.peopleCount)} pessoas</td>
                </tr>
                <tr>
                  <td class="label">Preço por Pessoa:</td>
                  <td class="value">${formatCurrency(ensureNumber(quote.unitPrice))}</td>
                </tr>
                <tr>
                  <td class="label total">VALOR TOTAL:</td>
                  <td class="value total">${formatCurrency(ensureNumber(quote.totalValue))}</td>
                </tr>
                ${
                  quote.paymentConditions
                    ? `
                <tr>
                  <td class="label">Condições de Pagamento:</td>
                  <td class="value">${textWithLineBreaks(quote.paymentConditions)}</td>
                </tr>
                `
                    : ""
                }
              </table>
            </div>
          </div>
          
          <!-- Data Limite de Resposta (se status SENT) -->
          ${
            quote.status === "SENT"
              ? `
          <div class="section">
            <div class="section-title">⏰ Informações de Prazo</div>
            <div class="section-content">
              <div class="info-grid full">
                <div class="info-item">
                  <label>Data Limite para Resposta</label>
                  <value><strong>${responseDueDate}</strong></value>
                </div>
              </div>
            </div>
          </div>
          `
              : ""
          }
          
          <!-- Observações/Regras -->
          ${
            sortedRules.length > 0
              ? (() => {
                  const hasRules = sortedRules.length > 0;
                  const hasNote = quote.notes && quote.notes.trim().length > 0;

                  return `
          <div class="notes-section">
            <strong>📝 OBSERVAÇÕES E REGRAS DO ORÇAMENTO:</strong>
            ${
              hasRules
                ? `<div style="margin-top: 8px; padding-left: 12px;">
${sortedRules
  .map(
    (rule) =>
      `<div style="margin-bottom: 4px; display: flex;"><span style="margin-right: 8px;">•</span><span>${textOrFallback(rule.text, "")}</span></div>`,
  )
  .join("")}
</div>`
                : ""
            }
            ${
              hasNote
                ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ffc107; font-size: 10px; line-height: 1.5;">
${textWithLineBreaks(quote.notes || "")}
</div>`
                : ""
            }
          </div>
          `;
                })()
              : quote.notes
                ? `
          <div class="notes-section">
            <strong>📝 OBSERVAÇÕES:</strong>
            <div style="margin-top: 8px; font-size: 10px; line-height: 1.5;">
${textWithLineBreaks(quote.notes)}
            </div>
          </div>
          `
                : ""
          }
        </div>
        
        <!-- Footer -->
        <div class="footer">
          <p>Este orçamento foi gerado automaticamente pelo sistema Max Buffet em ${new Date().toLocaleString("pt-BR")}</p>
          <p style="margin-top: 5px; font-size: 8px; color: #ccc;">ID: ${textOrFallback(quote.id, "")}</p>
        </div>
      </div>
    </div>
  `;
};

const applyPdfPageBreaks = (root: HTMLElement): void => {
  const pageHeight = root.clientWidth * (297 / 210);
  const bottomSafetyGap = 24;
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>(
      ".section, .notes-section, .table-section, .footer",
    ),
  );

  blocks.forEach((block) => block.classList.remove("pdf-page-break-before"));

  for (const block of blocks) {
    const blockHeight = block.offsetHeight;
    if (!blockHeight || blockHeight >= pageHeight - bottomSafetyGap) continue;

    const pageTop = Math.floor(block.offsetTop / pageHeight) * pageHeight;
    const blockBottomOnPage = block.offsetTop - pageTop + blockHeight;

    if (block.offsetTop > 0 && blockBottomOnPage > pageHeight - bottomSafetyGap) {
      block.classList.add("pdf-page-break-before");
    }
  }
};

export const generateQuotePDF = async (data: QuotePDFData): Promise<void> => {
  try {
    // Validar dados criticos
    if (!data.quote || !data.quote.number) {
      throw new Error("Dados do orçamento inválidos ou incompletos");
    }

    const element = document.createElement("div");
    element.innerHTML = generateQuoteHTML(data);
    element.style.position = "fixed";
    element.style.left = "0";
    element.style.top = "0";
    element.style.width = "210mm";
    element.style.backgroundColor = "#fff";
    element.style.pointerEvents = "none";
    element.style.zIndex = "2147483647";
    document.body.appendChild(element);

    try {
      // Aguardar carregamento da imagem
      const images = element.querySelectorAll("img");
      const imagePromises = Array.from(images).map(
        (img) =>
          new Promise<void>((resolve, reject) => {
            if (!(img instanceof HTMLImageElement) || img.complete) {
              // Se a imagem já estava carregada
              if (img instanceof HTMLImageElement && img.src && !img.complete) {
                if (img.naturalHeight === 0) {
                  console.warn(`Aviso: Imagem não carregou: ${img.src}`);
                }
              }
              resolve();
              return;
            }

            // Timeout para imagens que não carregam
            const timeout = setTimeout(() => {
              console.warn(`Timeout ao carregar imagem: ${img.src}`);
              resolve(); // Continua mesmo com timeout
            }, 5000);

            img.onload = () => {
              clearTimeout(timeout);
              resolve();
            };

            img.onerror = () => {
              clearTimeout(timeout);
              console.error(`Erro ao carregar imagem: ${img.src}`);
              resolve(); // Continua mesmo com erro para não bloquear PDF
            };
          }),
      );

      await Promise.all(imagePromises);

      const pdfRoot = element.querySelector(".quote-pdf-root");
      const sourceElement = pdfRoot instanceof HTMLElement ? pdfRoot : element;
      applyPdfPageBreaks(sourceElement);

      const filename = `${String(data.quote.number).replace(/[^\w.-]+/g, "_")}.pdf`;
      const opt: any = {
        margin: 0,
        filename,
        image: { type: "png", quality: 0.98 },
        pagebreak: {
          mode: ["css", "legacy"],
          avoid: [
            ".section",
            ".section-content",
            ".notes-section",
            ".table-section",
            ".summary-table",
            "tr",
          ],
        },
        html2canvas: {
          backgroundColor: "#ffffff",
          scale: 2,
          logging: true,
          useCORS: true,
          allowTaint: true,
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
        },
        jsPDF: { format: "a4", orientation: "portrait" },
      };

      console.log("Iniciando geração de PDF para:", filename);
      await html2pdf().set(opt).from(sourceElement).save();
      console.log("PDF gerado com sucesso:", filename);
    } finally {
      element.remove();
    }
  } catch (error) {
    console.error("Erro ao gerar PDF:", error);
    throw new Error(
      error instanceof Error
        ? error.message
        : "Falha ao gerar PDF do orçamento",
    );
  }
};

export const useQuotePDF = () => {
  return {
    generateQuotePDF,
    generateQuoteHTML,
  };
};
