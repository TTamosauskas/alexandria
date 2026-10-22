import { RATINGS_CONFIG } from "./ratings-config.js";

const apiBase = RATINGS_CONFIG.apiBaseUrl.replace(/\/+$/, "");
const archivePdf = /^https:\/\/archive\.org\/download\/[^?#]+\.pdf(?:\?[^#]*)?$/i;

export function isArchivePdf(raw) {
  if (typeof raw !== "string" || raw.length > 1800 || !archivePdf.test(raw)) return false;
  try {
    const parsed = new URL(raw);
    return parsed.hostname === "archive.org" && parsed.protocol === "https:";
  } catch { return false; }
}

// Documento de notificação em inglês, pronto para copiar e enviar pelo titular ou representante.
export function buildCopyrightNotice(data) {
  const needed = ["fullName","email","phone","address","rightsOwner","copyrightedWork",
    "explanation","signature","pdfUrl"];
  for (const key of needed) if (typeof data[key] !== "string" || !data[key].trim())
    throw new Error("Preencha todos os campos obrigatórios.");
  if (!isArchivePdf(data.pdfUrl)) throw new Error("O PDF precisa estar no Archive.org.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()))
    throw new Error("Informe um e-mail válido.");
  if (data.role !== "owner" && data.role !== "agent")
    throw new Error("Indique se é titular ou representante autorizado.");
  if (!data.goodFaith || !data.penalty)
    throw new Error("Confirme as duas declarações legais antes de gerar.");
  const subject = "Copyright infringement notice (DMCA) - " + data.copyrightedWork.trim();
  const capacity = data.role === "owner" ? "copyright owner" : "duly authorized representative";
  const text = [
    "To: info@archive.org",
    "Subject: " + subject,
    "",
    "Dear Internet Archive Copyright Agent,",
    "",
    "I am submitting a notice of alleged copyright infringement concerning the material listed below.",
    "",
    "1. Copyrighted work:",
    data.copyrightedWork.trim(),
    "Rights holder: " + data.rightsOwner.trim(),
    "",
    "2. Material to be located and reviewed:",
    "Catalog title: " + String(data.title || "Unknown"),
    "Exact PDF URL: " + data.pdfUrl,
    "Additional details about the alleged infringement:",
    data.explanation.trim(),
    "",
    "3. Contact information:",
    "Full name: " + data.fullName.trim(),
    "Postal address: " + data.address.trim(),
    "Telephone number: " + data.phone.trim(),
    "Email address: " + data.email.trim(),
    "Capacity: " + capacity,
    "",
    "4. Good-faith statement:",
    "I have a good-faith belief that the disputed use of this material is not authorized by",
    "the copyright owner, its agent, or the law.",
    "",
    "5. Accuracy and authorization statement:",
    "I state under penalty of perjury that the information in this notice is accurate and",
    "that I am the copyright owner or am authorized to act on behalf of the owner",
    "of an exclusive right that is allegedly infringed.",
    "",
    "Electronic signature: /s/ " + data.signature.trim(),
    "Date: " + new Date().toISOString().slice(0, 10),
    "",
    "Please review the identified material and advise if further information is needed.",
    "",
    "Regards,",
    data.fullName.trim(),
  ].join("\n");
  return { subject, text };
}

export function initCopyrightReport() {
  const library = document.querySelector("#library");
  const panel = document.querySelector("#copyright-panel");
  const form = document.querySelector("#copyright-form");
  const intro = document.querySelector("#copyright-book");
  const generated = document.querySelector("#copyright-generated");
  const output = document.querySelector("#copyright-message");
  const copyButton = document.querySelector("#copyright-copy");
  const markButton = document.querySelector("#copyright-mark");
  const sent = document.querySelector("#copyright-sent");
  const status = document.querySelector("#copyright-status");
  let currentBook = null;
  let generatedText = "";

  function close() {
    panel.hidden = true;
    library.hidden = location.hash === "#editor";
    form.reset();
    output.value = "";
    generatedText = "";
    generated.hidden = true;
    currentBook = null;
    status.textContent = "";
  }

  function open(book) {
    if (!isArchivePdf(book?.pdf_url)) return;
    currentBook = { title: String(book.title).slice(0, 300), pdfUrl: book.pdf_url };
    form.reset();
    output.value = "";
    generatedText = "";
    generated.hidden = true;
    sent.checked = false;
    markButton.disabled = true;
    status.textContent = "";
    intro.textContent = "Documento: " + currentBook.title + " · " + currentBook.pdfUrl;
    library.hidden = true;
    panel.hidden = false;
    window.scrollTo(0,0);
    form.elements.namedItem("fullName").focus();
  }

  document.querySelector("#copyright-back").addEventListener("click", close);
  window.addEventListener("hashchange", () => { if (!panel.hidden) close(); });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!currentBook || !form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form));
    try {
      const result = buildCopyrightNotice({
        ...values, title:currentBook.title, pdfUrl:currentBook.pdfUrl,
        goodFaith:form.elements.namedItem("goodFaith").checked,
        penalty:form.elements.namedItem("penalty").checked,
      });
      generatedText = result.text;
      output.value = result.text;
      generated.hidden = false;
      sent.checked = false;
      markButton.disabled = true;
      status.textContent = "Mensagem preparada. Copie, revise e envie por e-mail para info@archive.org.";
      output.scrollIntoView({block:"nearest",behavior:"smooth"});
    } catch(error) { status.textContent = error.message; }
  });

  copyButton.addEventListener("click", async () => {
    if (!generatedText) return;
    try {
      await navigator.clipboard.writeText(generatedText);
      status.textContent = "Mensagem copiada. Envie por e-mail para info@archive.org.";
    } catch {
      output.focus(); output.select();
      status.textContent = "Selecione e copie a mensagem (Ctrl+C) para enviá-la por e-mail.";
    }
  });
  sent.addEventListener("change", () => {
    markButton.disabled = !generatedText || !sent.checked;
  });
  markButton.addEventListener("click", async () => {
    if (!currentBook || !generatedText || !sent.checked) return;
    markButton.disabled = true;
    status.textContent = "Registrando link sinalizado…";
    try {
      const res = await fetch(apiBase + "/api/reported-links", {
        method:"POST", mode:"cors", cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({pdfUrl:currentBook.pdfUrl,title:currentBook.title}),
      });
      if (!res.ok) throw new Error("Não foi possível registrar o link.");
      status.textContent = "Link sinalizado em #editor. Isso não confirma infração ou remoção.";
    } catch(error) {
      status.textContent = error.message || "Não foi possível registrar.";
      markButton.disabled = false;
    }
  });

  return { open, close };
}
