import html2pdf from "html2pdf.js";
import type { Quote, QuoteContract } from "./types";

type ContractPDFData = {
  contract: QuoteContract;
  quote?: Quote | null;
};

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

const textWithLineBreaks = (value: unknown): string =>
  escapeHtml(value).replace(/\r?\n/g, "<br>");

const dateBr = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("pt-BR") : "";

const fileSafe = (value: unknown) =>
  String(value || "contrato").replace(/[^\w.-]+/g, "_");

export const generateContractHTML = ({
  contract,
  quote,
}: ContractPDFData): string => {
  const quoteNumber = quote?.number || "ORC";
  const issuedAt = contract.issuedAt || new Date().toISOString();

  return `
    <style>
      * {
        box-sizing: border-box;
      }

      .contract-pdf-root {
        width: 210mm;
        background: #fff;
        color: #1f2933;
        font-family: Georgia, 'Times New Roman', serif;
      }

      .contract-container {
        min-height: 297mm;
        padding: 18mm;
      }

      .contract-header {
        display: grid;
        grid-template-columns: 72px 1fr 72px;
        align-items: center;
        gap: 12px;
        text-align: center;
        margin-bottom: 18px;
        padding-bottom: 12px;
        border-bottom: 2px solid #1f2933;
      }

      .contract-logo {
        width: 64px;
        height: 64px;
        object-fit: contain;
      }

      .contract-title-block {
        min-width: 0;
      }

      .contract-header h1 {
        margin: 0 0 8px;
        font-size: 18px;
        text-transform: uppercase;
        letter-spacing: 0;
      }

      .contract-header p {
        margin: 2px 0;
        font-size: 10px;
        color: #52606d;
      }

      .contract-section {
        margin: 0 0 14px;
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .contract-section h2 {
        margin: 0 0 6px;
        font-size: 12px;
        text-transform: uppercase;
      }

      .contract-section p {
        margin: 0;
        font-size: 11px;
        line-height: 1.55;
        text-align: justify;
        white-space: normal;
      }

      .contract-footer {
        margin-top: 20px;
        padding-top: 8px;
        border-top: 1px solid #d9e2ec;
        color: #829ab1;
        font-size: 8px;
        text-align: center;
      }

      .pdf-page-break-before {
        page-break-before: always;
        break-before: page;
        padding-top: 16mm;
      }
    </style>
    <div class="contract-pdf-root">
      <div class="contract-container">
        <header class="contract-header">
          <img class="contract-logo" src="/img/logo.png" alt="Max Buffet">
          <div class="contract-title-block">
            <h1>Contrato de Prestação de Serviços de Buffet</h1>
            <p>Orçamento ${escapeHtml(quoteNumber)}</p>
            <p>Emitido em ${escapeHtml(dateBr(issuedAt))}</p>
          </div>
          <div></div>
        </header>

        ${contract.sections
          .map(
            (section) => `
              <section class="contract-section">
                <h2>${escapeHtml(section.title)}</h2>
                <p>${textWithLineBreaks(section.text)}</p>
              </section>
            `,
          )
          .join("")}

        <footer class="contract-footer">
          Contrato gerado pelo sistema Max Buffet. ID: ${escapeHtml(contract.id)}
        </footer>
      </div>
    </div>
  `;
};

const applyContractPageBreaks = (root: HTMLElement): void => {
  const pageHeight = root.clientWidth * (297 / 210);
  const bottomSafetyGap = 24;
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>(".contract-section, .contract-footer"),
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

export const generateContractPDF = async (
  data: ContractPDFData,
): Promise<void> => {
  if (!data.contract?.sections?.length) {
    throw new Error("Contrato sem cláusulas para gerar PDF.");
  }

  const element = document.createElement("div");
  element.innerHTML = generateContractHTML(data);
  element.style.position = "fixed";
  element.style.left = "0";
  element.style.top = "0";
  element.style.width = "210mm";
  element.style.backgroundColor = "#fff";
  element.style.pointerEvents = "none";
  element.style.zIndex = "2147483647";
  document.body.appendChild(element);

  try {
    const images = element.querySelectorAll("img");
    await Promise.all(
      Array.from(images).map(
        (img) =>
          new Promise<void>((resolve) => {
            if (!(img instanceof HTMLImageElement) || img.complete) {
              resolve();
              return;
            }

            const timeout = window.setTimeout(resolve, 5000);
            img.onload = () => {
              window.clearTimeout(timeout);
              resolve();
            };
            img.onerror = () => {
              window.clearTimeout(timeout);
              resolve();
            };
          }),
      ),
    );

    const pdfRoot = element.querySelector(".contract-pdf-root");
    const sourceElement = pdfRoot instanceof HTMLElement ? pdfRoot : element;
    applyContractPageBreaks(sourceElement);

    const filename = `Contrato_${fileSafe(data.quote?.number || data.contract.id)}.pdf`;
    const opt: any = {
      margin: 0,
      filename,
      image: { type: "png", quality: 0.98 },
      pagebreak: {
        mode: ["css", "legacy"],
        avoid: [".contract-section"],
      },
      html2canvas: {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      },
      jsPDF: { format: "a4", orientation: "portrait" },
    };

    await html2pdf().set(opt).from(sourceElement).save();
  } finally {
    element.remove();
  }
};

export const useContractPDF = () => ({
  generateContractPDF,
  generateContractHTML,
});
