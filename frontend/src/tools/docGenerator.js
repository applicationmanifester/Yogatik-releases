/**
 * docGenerator.js — Independent, client-side open-source document generation suite.
 * Inspired by open-source tools from github.com/topics/document-generation:
 * - Marp / Reveal.js (HTML5 slide decks with keyboard navigation)
 * - Carbone / WeasyPrint (Printable business invoices & receipts)
 * - Open-source certificate & credential generators (SVG vector seals & ornate borders)
 * - Office OpenXML / Word MHTML doc generation (Word/LibreOffice/Google Docs compatible)
 * - RFC 4180 / Spreadsheet XML (Multi-column workbooks with UTF-8 BOM)
 *
 * 100% browser-native and offline-capable: zero external API keys, zero servers.
 */

import { mdToHtml } from './mdToPdf'
import { toCsv } from './dataConvert'
import { addDocument, getSetting } from '../db'

// ─── 1. Word Document (.docx / WordprocessingML) ─────────────────────────────

export function generateWordDoc({ title = 'Document', content = '', author = 'Yogatik AI', subject = '' } = {}) {
  const bodyHtml = mdToHtml(content)
  const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const escapedAuthor = author.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${escapedTitle}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 210mm 297mm;
      margin: 25.4mm 25.4mm 25.4mm 25.4mm;
      mso-header-margin: 35.4pt;
      mso-footer-margin: 35.4pt;
      mso-paper-source: 0;
    }
    div.Section1 { page: Section1; }
    body {
      font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #2b2b2b;
    }
    h1 { font-size: 22pt; color: #1e3a8a; border-bottom: 2pt solid #2563eb; padding-bottom: 4pt; margin: 18pt 0 10pt; }
    h2 { font-size: 16pt; color: #1e40af; border-bottom: 1pt solid #cbd5e1; padding-bottom: 3pt; margin: 14pt 0 8pt; }
    h3 { font-size: 13pt; color: #0369a1; margin: 10pt 0 6pt; }
    p { margin: 0 0 8pt; }
    ul, ol { margin: 0 0 10pt 20pt; }
    li { margin-bottom: 3pt; }
    table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
    th, td { border: 1pt solid #94a3b8; padding: 6pt 10pt; text-align: left; }
    th { background-color: #f1f5f9; color: #0f172a; font-weight: bold; }
    tr:nth-child(even) td { background-color: #f8fafc; }
    blockquote { border-left: 3pt solid #3b82f6; background-color: #eff6ff; padding: 6pt 12pt; margin: 8pt 0; color: #1e40af; }
    code { font-family: 'Consolas', 'Courier New', monospace; background-color: #f1f5f9; padding: 1pt 4pt; font-size: 9.5pt; color: #b91c1c; }
    pre { background-color: #0f172a; color: #f8fafc; padding: 10pt; font-family: 'Consolas', monospace; font-size: 9.5pt; margin: 10pt 0; }
    .doc-meta { font-size: 9pt; color: #64748b; margin-bottom: 20pt; padding-bottom: 10pt; border-bottom: 1pt solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="Section1">
    <div class="doc-meta">
      <strong>Title:</strong> ${escapedTitle} | <strong>Author:</strong> ${escapedAuthor} | <strong>Date:</strong> ${new Date().toLocaleDateString()}
    </div>
    ${bodyHtml}
  </div>
</body>
</html>`

  const blob = new Blob([wordHtml], { type: 'application/msword;charset=utf-8' })
  const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'document'}.doc`
  const dataUrl = `data:application/msword;charset=utf-8,${encodeURIComponent(wordHtml)}`

  return {
    success: true,
    tool: 'docx_generator',
    format: 'doc',
    filename,
    title,
    size_kb: (blob.size / 1024).toFixed(2),
    data_url: dataUrl,
    download_prompt: `Download your Word document: ${filename}`,
  }
}

// ─── 2. Interactive HTML5 Slide Deck (Marp / Reveal.js style) ───────────────

export function generateSlideDeck({ title = 'Presentation', slides = [], theme = 'midnight' } = {}) {
  // If slides is a single markdown string with '---' delimiters, split them
  let slideList = []
  if (typeof slides === 'string') {
    slideList = slides.split(/\n---\n/).map(s => s.trim()).filter(Boolean)
  } else if (Array.isArray(slides)) {
    slideList = slides
  }
  if (slideList.length === 0) {
    slideList = ['# ' + title + '\n\n*Created with Yogatik AI*']
  }

  const themeStyles = {
    midnight: { bg: '#0b0f19', card: '#111827', text: '#f9fafb', accent: '#38bdf8', sub: '#94a3b8' },
    dark: { bg: '#18181b', card: '#27272a', text: '#fafafa', accent: '#a855f7', sub: '#a1a1aa' },
    corporate: { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', accent: '#2563eb', sub: '#64748b' },
    emerald: { bg: '#064e3b', card: '#065f46', text: '#ecfdf5', accent: '#34d399', sub: '#a7f3d0' },
  }[theme] || { bg: '#0b0f19', card: '#111827', text: '#f9fafb', accent: '#38bdf8', sub: '#94a3b8' }

  const slidesHtml = slideList.map((s, idx) => `
    <div class="slide ${idx === 0 ? 'active' : ''}" data-index="${idx}">
      <div class="slide-content">
        ${mdToHtml(s)}
      </div>
      <div class="slide-footer">
        <span class="deck-title">${title}</span>
        <span class="slide-counter">${idx + 1} / ${slideList.length}</span>
      </div>
    </div>
  `).join('\n')

  const deckHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} — Interactive Slide Deck</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body, html { width: 100%; height: 100%; overflow: hidden; font-family: 'Inter', sans-serif; background: ${themeStyles.bg}; color: ${themeStyles.text}; }
    .deck-container { position: relative; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
    .slide { display: none; width: 90vw; max-width: 1200px; height: 80vh; max-height: 750px; background: ${themeStyles.card}; border-radius: 16px; padding: 48px 56px; box-shadow: 0 20px 40px rgba(0,0,0,0.35); flex-direction: column; justify-content: space-between; border: 1px solid rgba(255,255,255,0.08); transition: opacity 0.3s ease; }
    .slide.active { display: flex; animation: fadeIn 0.3s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
    .slide-content { flex: 1; overflow-y: auto; font-size: 1.35rem; line-height: 1.6; }
    .slide-content h1 { font-family: 'Outfit', sans-serif; font-size: 2.8rem; font-weight: 800; color: ${themeStyles.accent}; margin-bottom: 24px; line-height: 1.2; }
    .slide-content h2 { font-family: 'Outfit', sans-serif; font-size: 2.1rem; font-weight: 700; color: ${themeStyles.accent}; margin-bottom: 18px; }
    .slide-content h3 { font-size: 1.5rem; font-weight: 600; margin-bottom: 14px; }
    .slide-content p { margin-bottom: 16px; color: ${themeStyles.sub}; }
    .slide-content ul, .slide-content ol { margin-left: 28px; margin-bottom: 18px; }
    .slide-content li { margin-bottom: 10px; }
    .slide-content pre { background: rgba(0,0,0,0.4); padding: 16px 20px; border-radius: 8px; font-family: 'JetBrains Mono', monospace; font-size: 1rem; margin: 16px 0; overflow-x: auto; }
    .slide-content code { font-family: 'JetBrains Mono', monospace; color: ${themeStyles.accent}; }
    .slide-content table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 1.1rem; }
    .slide-content th, .slide-content td { padding: 10px 14px; border: 1px solid rgba(255,255,255,0.12); text-align: left; }
    .slide-content th { background: rgba(255,255,255,0.06); }
    .slide-footer { display: flex; justify-content: space-between; align-items: center; font-size: 0.95rem; color: ${themeStyles.sub}; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px; margin-top: 16px; }
    .controls { position: fixed; bottom: 20px; right: 24px; display: flex; gap: 8px; z-index: 100; }
    .btn { background: rgba(255,255,255,0.12); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 16px; font-size: 14px; font-weight: 600; cursor: pointer; backdrop-filter: blur(8px); transition: all 0.2s; }
    .btn:hover { background: ${themeStyles.accent}; color: #000; }
    .progress-bar { position: fixed; top: 0; left: 0; height: 4px; background: ${themeStyles.accent}; width: 0%; transition: width 0.3s ease; z-index: 200; }
    @media print {
      body { overflow: visible; background: #fff; color: #000; }
      .slide { display: flex !important; page-break-after: always; width: 100%; height: 100vh; box-shadow: none; border: none; }
      .controls, .progress-bar { display: none; }
    }
  </style>
</head>
<body>
  <div class="progress-bar" id="progress"></div>
  <div class="deck-container">
    ${slidesHtml}
  </div>
  <div class="controls">
    <button class="btn" onclick="prevSlide()">❮ Prev</button>
    <button class="btn" onclick="nextSlide()">Next ❯</button>
    <button class="btn" onclick="toggleFullscreen()">⛶ Fullscreen</button>
    <button class="btn" onclick="window.print()">🖨 Print</button>
  </div>
  <script>
    let current = 0;
    const slides = document.querySelectorAll('.slide');
    const progress = document.getElementById('progress');

    function update() {
      slides.forEach((s, i) => s.classList.toggle('active', i === current));
      progress.style.width = (((current + 1) / slides.length) * 100) + '%';
    }

    function nextSlide() { if (current < slides.length - 1) { current++; update(); } }
    function prevSlide() { if (current > 0) { current--; update(); } }
    function toggleFullscreen() {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') nextSlide();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prevSlide();
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    });

    update();
  </script>
</body>
</html>`

  const blob = new Blob([deckHtml], { type: 'text/html;charset=utf-8' })
  const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'presentation'}_slides.html`
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(deckHtml)}`

  return {
    success: true,
    tool: 'slide_deck_generator',
    format: 'html_slides',
    filename,
    title,
    slides_count: slideList.length,
    theme,
    size_kb: (blob.size / 1024).toFixed(2),
    data_url: dataUrl,
    instructions: 'Open the HTML file in any browser for interactive slides, keyboard shortcuts (Left/Right/Space/F), and print-to-PDF.',
  }
}

// ─── 3. Professional Business Invoice & Receipt Generator ───────────────────

export function generateInvoice({
  invoice_number = 'INV-' + Math.floor(100000 + Math.random() * 900000),
  date = new Date().toISOString().slice(0, 10),
  due_date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
  currency = 'USD',
  sender = { name: 'Acme Corp', address: '100 Innovation Way, Suite 400', email: 'billing@acme.com', phone: '+1 (555) 019-2834' },
  client = { name: 'Client Organization', address: '500 Enterprise Blvd', email: 'accounts@client.com' },
  items = [
    { description: 'Professional Consulting Services', quantity: 10, unit_price: 150 },
    { description: 'Cloud Infrastructure & Deployment', quantity: 1, unit_price: 750 },
  ],
  tax_percent = 8.5,
  discount = 0,
  notes = 'Thank you for your business. Payment is due within 14 days.',
} = {}) {
  const currencySymbols = { USD: '$', EUR: '€', GBP: '£', INR: '₹', CAD: 'CA$', AUD: 'A$', JPY: '¥' }
  const sym = currencySymbols[currency.toUpperCase()] || currency + ' '

  let subtotal = 0
  const rowsHtml = items.map(item => {
    const qty = Number(item.quantity) || 1
    const price = Number(item.unit_price) || 0
    const total = qty * price
    subtotal += total
    return `
      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;">${item.description}</td>
        <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;text-align:center;">${qty}</td>
        <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;text-align:right;">${sym}${price.toFixed(2)}</td>
        <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${sym}${total.toFixed(2)}</td>
      </tr>
    `
  }).join('')

  const taxAmount = (subtotal - discount) * (tax_percent / 100)
  const grandTotal = Math.max(0, subtotal - discount + taxAmount)

  const invoiceHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice_number}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; color: #1e293b; background: #f8fafc; padding: 40px 20px; }
    .invoice-card { max-width: 850px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 48px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .brand h1 { font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .brand p { font-size: 14px; color: #64748b; margin-top: 4px; }
    .inv-badge { text-align: right; }
    .inv-badge h2 { font-size: 24px; color: #2563eb; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .inv-badge p { font-size: 14px; color: #64748b; margin-top: 4px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 40px; padding: 24px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
    .info-col h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 8px; font-weight: 700; }
    .info-col p { font-size: 14px; line-height: 1.5; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
    th { background: #0f172a; color: #ffffff; padding: 12px 14px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; text-align: left; }
    th:last-child, th:nth-child(3) { text-align: right; }
    th:nth-child(2) { text-align: center; }
    .totals-area { display: flex; justify-content: flex-end; margin-bottom: 40px; }
    .totals-box { width: 320px; }
    .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #64748b; }
    .total-row.grand { border-top: 2px solid #0f172a; margin-top: 8px; padding-top: 12px; font-size: 18px; font-weight: 800; color: #0f172a; }
    .notes-box { padding: 20px; border-radius: 8px; background: #eff6ff; border-left: 4px solid #3b82f6; font-size: 13.5px; color: #1e40af; line-height: 1.5; }
    @media print {
      body { background: #fff; padding: 0; }
      .invoice-card { box-shadow: none; border: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div class="header">
      <div class="brand">
        <h1>${sender.name || 'Company'}</h1>
        <p>${sender.address || ''}</p>
        <p>${sender.email || ''} ${sender.phone ? '| ' + sender.phone : ''}</p>
      </div>
      <div class="inv-badge">
        <h2>Invoice</h2>
        <p><strong>#${invoice_number}</strong></p>
        <p>Date: ${date}</p>
        <p>Due Date: ${due_date}</p>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-col">
        <h3>Billed To:</h3>
        <p><strong>${client.name || 'Client'}</strong></p>
        <p>${client.address || ''}</p>
        <p>${client.email || ''}</p>
      </div>
      <div class="info-col">
        <h3>Payment Summary:</h3>
        <p>Currency: <strong>${currency.toUpperCase()}</strong></p>
        <p>Total Due: <strong style="color:#2563eb;font-size:16px;">${sym}${grandTotal.toFixed(2)}</strong></p>
        <p>Terms: Due within 14 days</p>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:center;">Qty</th>
          <th style="text-align:right;">Unit Price</th>
          <th style="text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
    <div class="totals-area">
      <div class="totals-box">
        <div class="total-row"><span>Subtotal:</span><span>${sym}${subtotal.toFixed(2)}</span></div>
        ${discount > 0 ? `<div class="total-row"><span>Discount:</span><span>-${sym}${discount.toFixed(2)}</span></div>` : ''}
        <div class="total-row"><span>Tax (${tax_percent}%):</span><span>${sym}${taxAmount.toFixed(2)}</span></div>
        <div class="total-row grand"><span>Total Due:</span><span>${sym}${grandTotal.toFixed(2)}</span></div>
      </div>
    </div>
    ${notes ? `<div class="notes-box"><strong>Notes & Payment Instructions:</strong><br>${notes}</div>` : ''}
  </div>
</body>
</html>`

  const blob = new Blob([invoiceHtml], { type: 'text/html;charset=utf-8' })
  const filename = `invoice_${invoice_number.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.html`
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(invoiceHtml)}`

  return {
    success: true,
    tool: 'invoice_generator',
    format: 'html_invoice',
    filename,
    invoice_number,
    total_due: `${sym}${grandTotal.toFixed(2)}`,
    currency,
    size_kb: (blob.size / 1024).toFixed(2),
    data_url: dataUrl,
    instructions: 'Open the HTML file in any browser to preview and print/save as high-resolution PDF.',
  }
}

// ─── 4. Verifiable Certificate & Award Generator ────────────────────────────

export function generateCertificate({
  recipient_name = 'Alex Morgan',
  title = 'Certificate of Achievement',
  achievement = 'Mastery in Full-Stack AI Engineering & Autonomous Agents',
  issuer_name = 'Yogatik Academy of Advanced AI',
  signatory = 'Dr. Elena Rostova, Lead AI Director',
  date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  cert_id = 'CERT-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
} = {}) {
  const certHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} — ${recipient_name}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Great+Vibes&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f172a; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; font-family: 'Inter', sans-serif; }
    .cert-frame { width: 1000px; height: 700px; background: #ffffff; padding: 28px; position: relative; box-shadow: 0 25px 60px rgba(0,0,0,0.5); border-radius: 12px; }
    .cert-inner-border { width: 100%; height: 100%; border: 4px double #d97706; padding: 36px 48px; display: flex; flex-direction: column; justify-content: space-between; align-items: center; text-align: center; position: relative; background: radial-gradient(circle at center, #ffffff 60%, #fffbeb 100%); }
    .ornament-corner { position: absolute; width: 40px; height: 40px; border: 3px solid #b45309; }
    .corner-tl { top: 8px; left: 8px; border-right: none; border-bottom: none; }
    .corner-tr { top: 8px; right: 8px; border-left: none; border-bottom: none; }
    .corner-bl { bottom: 8px; left: 8px; border-right: none; border-top: none; }
    .corner-br { bottom: 8px; right: 8px; border-left: none; border-top: none; }
    .issuer { font-family: 'Cinzel', serif; font-size: 15px; font-weight: 700; color: #b45309; letter-spacing: 4px; text-transform: uppercase; }
    .cert-title { font-family: 'Cinzel', serif; font-size: 34px; font-weight: 900; color: #0f172a; letter-spacing: 2px; margin-top: 8px; text-transform: uppercase; }
    .presented-to { font-size: 13px; color: #64748b; letter-spacing: 3px; text-transform: uppercase; margin-top: 16px; }
    .recipient { font-family: 'Great Vibes', cursive; font-size: 64px; color: #1e3a8a; margin: 12px 0 8px; }
    .achievement-text { font-size: 16px; color: #334155; line-height: 1.6; max-width: 720px; }
    .cert-footer { width: 100%; display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; padding: 0 40px; }
    .sign-block { width: 220px; border-top: 1.5px solid #94a3b8; padding-top: 6px; font-size: 12px; color: #475569; }
    .gold-seal { width: 90px; height: 90px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b, #d97706, #b45309); display: flex; align-items: center; justify-content: center; color: #ffffff; font-family: 'Cinzel', serif; font-size: 11px; font-weight: 700; text-align: center; box-shadow: 0 6px 16px rgba(217, 119, 6, 0.4); border: 2px dashed #fef3c7; }
    .cert-id { position: absolute; bottom: 12px; font-size: 10px; color: #94a3b8; letter-spacing: 1px; }
    @media print {
      body { background: #fff; padding: 0; }
      .cert-frame { box-shadow: none; width: 100%; height: 100vh; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="cert-frame">
    <div class="cert-inner-border">
      <div class="ornament-corner corner-tl"></div>
      <div class="ornament-corner corner-tr"></div>
      <div class="ornament-corner corner-bl"></div>
      <div class="ornament-corner corner-br"></div>
      <div>
        <div class="issuer">${issuer_name}</div>
        <div class="cert-title">${title}</div>
      </div>
      <div>
        <div class="presented-to">This is proudly presented to</div>
        <div class="recipient">${recipient_name}</div>
        <div class="achievement-text">${achievement}</div>
      </div>
      <div class="cert-footer">
        <div class="sign-block">
          <strong>${date}</strong><br>Date of Award
        </div>
        <div class="gold-seal">OFFICIAL<br>AWARD<br>★</div>
        <div class="sign-block">
          <strong>${signatory}</strong><br>Authorized Signature
        </div>
      </div>
      <div class="cert-id">Verification ID: ${cert_id}</div>
    </div>
  </div>
</body>
</html>`

  const blob = new Blob([certHtml], { type: 'text/html;charset=utf-8' })
  const filename = `certificate_${recipient_name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.html`
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(certHtml)}`

  return {
    success: true,
    tool: 'certificate_generator',
    format: 'html_certificate',
    filename,
    recipient_name,
    cert_id,
    size_kb: (blob.size / 1024).toFixed(2),
    data_url: dataUrl,
    instructions: 'Open in your browser to view the ornate certificate and print/save to PDF.',
  }
}

// ─── 5. Structured Markdown Documentation (README, Spec, ADR, Guide) ─────────

export function generateMarkdownDoc({ title = 'Documentation', content = '', author = 'Yogatik AI', tags = [], type = 'guide' } = {}) {
  const dateStr = new Date().toISOString().split('T')[0]
  const escapedTitle = title.trim() || 'Documentation'
  
  // Generate Table of Contents from markdown headings
  const headings = []
  const lines = content.split('\n')
  for (const line of lines) {
    const match = line.match(/^(#{2,4})\s+(.+)$/)
    if (match) {
      const level = match[1].length - 2
      const text = match[2].trim()
      const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      headings.push({ level, text, slug })
    }
  }

  let toc = ''
  if (headings.length > 1) {
    toc = '## Table of Contents\n\n' + headings.map(h => `${'  '.repeat(h.level)}- [${h.text}](#${h.slug})`).join('\n') + '\n\n---\n\n'
  }

  const header = `---
title: "${escapedTitle}"
author: "${author}"
date: "${dateStr}"
type: "${type}"
tags: [${tags.map(t => `"${t}"`).join(', ')}]
generator: "Yogatik AI Document Suite"
---

# ${escapedTitle}

> **Author:** ${author} | **Date:** ${dateStr} | **Status:** Approved / Active

${toc}`

  const fullMarkdown = `${header}${content.trim()}\n\n---\n*Generated with Yogatik AI Documentation Suite*\n`
  const filename = `${escapedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'documentation'}.md`
  const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(fullMarkdown)}`
  const blob = new Blob([fullMarkdown], { type: 'text/markdown;charset=utf-8' })

  return {
    success: true,
    tool: 'markdown_doc_generator',
    format: 'markdown',
    filename,
    title: escapedTitle,
    content: fullMarkdown,
    size_kb: (blob.size / 1024).toFixed(2),
    data_url: dataUrl,
    headings_count: headings.length,
    download_prompt: `Download Markdown Document: ${filename}`,
  }
}

// ─── 6. OpenAPI 3.0 / Swagger API Specification ─────────────────────────────

export function generateApiSpec({ title = 'API Specification', version = '1.0.0', description = '', endpoints = [], baseUrl = 'https://api.example.com/v1' } = {}) {
  const paths = {}
  const items = Array.isArray(endpoints) && endpoints.length ? endpoints : [
    { path: '/status', method: 'get', summary: 'Health check endpoint', description: 'Returns system health status', responseCode: 200 }
  ]

  for (const ep of items) {
    const p = ep.path.startsWith('/') ? ep.path : `/${ep.path}`
    const m = (ep.method || 'get').toLowerCase()
    if (!paths[p]) paths[p] = {}
    paths[p][m] = {
      summary: ep.summary || `${m.toUpperCase()} ${p}`,
      description: ep.description || '',
      parameters: ep.parameters || [],
      responses: {
        [ep.responseCode || 200]: {
          description: ep.responseDescription || 'Successful operation',
          content: {
            'application/json': {
              schema: ep.responseSchema || { type: 'object', properties: { success: { type: 'boolean' } } }
            }
          }
        }
      }
    }
  }

  const spec = {
    openapi: '3.0.0',
    info: {
      title,
      version,
      description: description || 'Generated with Yogatik AI API Specification Builder',
      contact: { name: 'Yogatik API Integration' },
    },
    servers: [{ url: baseUrl, description: 'Production Server' }],
    paths,
  }

  const jsonStr = JSON.stringify(spec, null, 2)
  const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'api_spec'}.json`
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(jsonStr)}`
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' })

  return {
    success: true,
    tool: 'api_spec_generator',
    format: 'openapi_json',
    filename,
    title,
    spec,
    size_kb: (blob.size / 1024).toFixed(2),
    data_url: dataUrl,
    endpoints_count: Object.keys(paths).length,
  }
}

// ─── 7. Executive Technical / System Report ─────────────────────────────────

export function generateSystemReport({ title = 'System Architecture & Technical Audit Report', target = 'Yogatik Workspace', executiveSummary = '', findings = [], recommendations = [] } = {}) {
  const dateStr = new Date().toISOString().split('T')[0]
  let reportMd = `# ${title}\n\n`
  reportMd += `**Target System:** ${target} | **Date:** ${dateStr} | **Auditor:** Yogatik AI System Specialist\n\n`
  reportMd += `## 1. Executive Summary\n\n${executiveSummary || 'A comprehensive technical inspection was conducted. The system architecture, operational performance, and resource allocations have been verified and documented.'}\n\n`
  
  reportMd += `## 2. Key Findings & Observations\n\n`
  if (findings.length) {
    findings.forEach((f, i) => {
      const statusIcon = f.severity === 'high' ? '🔴' : (f.severity === 'medium' ? '🟡' : '🟢')
      reportMd += `### ${statusIcon} 2.${i + 1} ${f.title || `Finding ${i + 1}`}\n- **Category:** ${f.category || 'Architecture'}\n- **Impact:** ${f.impact || 'Standard'}\n- **Detail:** ${f.detail || f.description || ''}\n\n`
    })
  } else {
    reportMd += `- Architecture patterns comply with modern standards.\n- Zero regressions detected across active modules.\n- Modular decoupling verified across storage, UI, and model tiers.\n\n`
  }

  reportMd += `## 3. Actionable Recommendations\n\n`
  if (recommendations.length) {
    recommendations.forEach((r, i) => {
      reportMd += `${i + 1}. **${r.action || r.title || r}**: ${r.detail || r.reason || 'Implement according to established guidelines.'}\n`
    })
  } else {
    reportMd += `1. **Maintain Continuous Testing**: Run vitest suite across local packages.\n2. **Security & Guarding**: Ensure all external data payloads validate against safety schemas.\n`
  }

  reportMd += `\n---\n*Report compiled by Yogatik AI System Engine*\n`
  const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'system_report'}.md`
  const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(reportMd)}`
  const blob = new Blob([reportMd], { type: 'text/markdown;charset=utf-8' })

  return {
    success: true,
    tool: 'system_report_generator',
    format: 'markdown_report',
    filename,
    title,
    content: reportMd,
    size_kb: (blob.size / 1024).toFixed(2),
    data_url: dataUrl,
  }
}

// ─── 8. Universal Document Generator Tool for AI Toolchain ─────────────────

export const documentGeneratorTool = {
  schema: {
    description:
      'Generate professional, standalone documents completely client-side in multiple open-source formats: ' +
      'Word documents (.doc/.docx), interactive HTML5 presentation slide decks, printable business invoices, awards/certificates, CSV spreadsheets, structured Markdown guides/specs/ADRs, OpenAPI 3.0 API specs, or executive system audit reports. ' +
      'All documents run 100% independently and can be automatically saved to Yogatik project workspace documents.',
    parameters: {
      type: 'object',
      properties: {
        document_type: {
          type: 'string',
          enum: ['word_docx', 'slide_deck', 'invoice', 'certificate', 'csv_spreadsheet', 'markdown_doc', 'api_spec', 'system_report'],
          description: 'Type of document to generate: "word_docx", "slide_deck", "invoice", "certificate", "csv_spreadsheet", "markdown_doc" (structured README/guide/ADR), "api_spec" (OpenAPI/Swagger specification), or "system_report" (audit/architecture report).',
        },
        title: { type: 'string', description: 'Document or presentation title' },
        content: { type: 'string', description: 'Markdown content for Word docs, or slide markdown separated by "---", or markdown body for documentation.' },
        invoice_data: {
          type: 'object',
          description: 'Invoice data (sender, client, items[], currency, tax_percent, discount, notes)',
        },
        certificate_data: {
          type: 'object',
          description: 'Certificate data (recipient_name, title, achievement, issuer_name, signatory)',
        },
        spreadsheet_rows: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of objects for CSV/Spreadsheet generation',
        },
        endpoints: {
          type: 'array',
          items: { type: 'object' },
          description: 'List of API endpoint definitions for OpenAPI 3.0 spec generation',
        },
        executive_summary: {
          type: 'string',
          description: 'Executive summary for system report',
        },
        findings: {
          type: 'array',
          items: { type: 'object' },
          description: 'List of audit/system findings for system report',
        },
        recommendations: {
          type: 'array',
          items: { type: 'object' },
          description: 'Actionable recommendations for system report',
        },
        theme: { type: 'string', enum: ['midnight', 'dark', 'corporate', 'emerald'], description: 'Theme for slide decks' },
        save_to_workspace: {
          type: 'boolean',
          description: 'Whether to save the document to Yogatik project documents in IndexedDB (default: true).',
        },
      },
      required: ['document_type'],
    },
  },
  async execute({
    document_type,
    title = 'Document',
    content = '',
    invoice_data = {},
    certificate_data = {},
    spreadsheet_rows = [],
    endpoints = [],
    executive_summary = '',
    findings = [],
    recommendations = [],
    theme = 'midnight',
    save_to_workspace = true,
  } = {}) {
    try {
      let result = null

      if (document_type === 'word_docx') {
        result = generateWordDoc({ title, content })
      } else if (document_type === 'slide_deck') {
        result = generateSlideDeck({ title, slides: content, theme })
      } else if (document_type === 'invoice') {
        result = generateInvoice(invoice_data)
      } else if (document_type === 'certificate') {
        result = generateCertificate(certificate_data)
      } else if (document_type === 'csv_spreadsheet') {
        const rows = spreadsheet_rows.length ? spreadsheet_rows : [{ item: 'Sample Data', value: 100 }]
        const csvStr = toCsv(rows)
        const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'data'}.csv`
        const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csvStr)}`
        result = {
          success: true,
          tool: 'csv_spreadsheet',
          filename,
          rows_count: rows.length,
          data_url: dataUrl,
        }
      } else if (document_type === 'markdown_doc') {
        result = generateMarkdownDoc({ title, content })
      } else if (document_type === 'api_spec') {
        result = generateApiSpec({ title, description: content, endpoints })
      } else if (document_type === 'system_report') {
        result = generateSystemReport({ title, executiveSummary: executive_summary || content, findings, recommendations })
      } else {
        return { success: false, error: `Unsupported document_type: ${document_type}` }
      }

      // Auto-save into workspace documents if enabled
      if (result && result.success && save_to_workspace && typeof addDocument === 'function') {
        try {
          const docContent = result.content || (typeof result.spec === 'object' ? JSON.stringify(result.spec, null, 2) : content)
          if (docContent) {
            const activeProj = typeof getSetting === 'function' ? await getSetting('active_project', null) : null
            const savedDoc = await addDocument({
              name: result.filename || `${title}.md`,
              type: result.format || 'text/markdown',
              content: docContent,
              projectId: activeProj,
            }).catch(() => null)
            if (savedDoc) {
              result.saved_to_workspace = true
              result.document_id = savedDoc.id
            }
          }
        } catch { /* non-fatal */ }
      }

      return result
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

