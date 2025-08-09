// === Konfigurasjon ===
const supabaseUrl = "https://sjgmpljxitppkqkzdfvf.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqZ21wbGp4aXRwcGtxa3pkZnZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0MTY3NTYsImV4cCI6MjA2Nzk5Mjc1Nn0.SsO3nJ4IfV9BNGD4WNgA5MrrRTv58xAc2xtWWJWP2HU";
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Hent valgte bildefiler fra alle kjente inputs (null-safe)
const IMAGE_INPUT_IDS = ["imageInput", "imageFromLibrary", "imageFromCamera"];
function getSelectedImageFiles() {
  const out = [];
  for (const id of IMAGE_INPUT_IDS) {
    const el = document.getElementById(id);
    if (el?.files?.length) out.push(...Array.from(el.files));
  }
  return out;
}


// === Funksjon for å laste opp bilder til Supabase ===
async function uploadImagesToSupabase(files) {
  const uploadedUrls = [];

  for (const file of files) {
    const filePath = `bilder/${Date.now()}_${file.name}`;

    // Komprimer bildet
    const img = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const MAX_WIDTH = 1024;
    const scale = Math.min(MAX_WIDTH / img.width, 1);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const resizedImageBlob = await new Promise(resolve => {
      canvas.toBlob(resolve, "image/jpeg", 0.8);
    });

    // Last opp til Supabase
    const { data, error } = await supabase.storage
      .from("bilder") // Må være riktig bucket
      .upload(filePath, resizedImageBlob, {
        contentType: "image/jpeg",
        upsert: true
      });

    if (error) {
      console.error("Feil ved bildeopplasting:", error);
    } else {
      // Hent offentlig URL
      const { data: publicUrlData } = supabase.storage
        .from("bilder")
        .getPublicUrl(filePath);

      uploadedUrls.push(publicUrlData.publicUrl);
    }
  }

  return uploadedUrls; // ✅ Viktig
}




async function generatePDF(dato, områder, fagarbeidere, sjekkpunkter, signatureImage, imageUrls = [], submissionTime, brukerNavn) {
  const { jsPDF } = window.jspdf || window.jspdf.jsPDF;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  await loadCustomFont(doc); // Last inn Roboto kun én gang
  doc.setFont("Roboto"); // Sett Roboto som font



async function loadCustomFont(doc) {
  if (!doc._customFontLoaded) {
    const response = await fetch("Roboto/static/Roboto-Regular.ttf");
    const buffer = await response.arrayBuffer();

    // Trygg konvertering av ArrayBuffer → Base64
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    const base64Font = btoa(binary);

    doc.addFileToVFS("Roboto-Regular.ttf", base64Font);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");

    doc._customFontLoaded = true; // ✅ Flag for å unngå repetering
  }
}




  const habBlue = "#0077C8";
  const habGray = "#f4f4f4";

   // === Globale posisjoner ===
  let startX = 10;
  let startY = 30; // ← DEFINER DENNE ÉN GANG HER
  let boxWidth = 190;
  let Y = startY + 8;

  // === HEADER med logo ===
  try {
    const logoUrl = "Hab_Transparant.png"; // Bruk riktig filsti
    const img = await fetch(logoUrl).then(res => res.blob());
    const imgData = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(img);
    });

    doc.setFillColor(habBlue);
    doc.rect(0, 0, 210, 25, "F");
    doc.addImage(imgData, "PNG", 14, 4, 40, 17); // HAB-logo øverst til venstre
  } catch (err) {
    console.warn("Logo kunne ikke lastes:", err);
    doc.setFillColor(habBlue);
    doc.rect(0, 0, 210, 25, "F");
    doc.setTextColor("#fff");
    doc.setFontSize(18);
    doc.text("HAB Construction AS", 14, 16);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor("#fff");
  doc.text("Daglig sjekkliste – Varme arbeider", 130, 16);

  // === Grunninfo ===
 const linjer = [
    `Dato: ${dato}`,
    `Arbeidstid: 07:00 - 18:30`,
    `Innsender: ${brukerNavn || "Ikke oppgitt"}`,
    `Områder: ${områder.length ? områder.join(", ") : "Ingen valgt"}`,
    `Tidspunkt for innsending: ${submissionTime}`
  ];

  
  let boxHeight = linjer.length * 7 + 12;

  doc.setFillColor(habGray);
  doc.roundedRect(startX, startY, boxWidth, boxHeight, 3, 3, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor("#000");
  linjer.forEach(linje => {
    doc.text(linje, 15, Y);
    Y += 7;
  });

// === Fagarbeidere med kurs ===
let fagarbeiderStartY = startY + boxHeight + 25; // ← tidligere var kanskje +5 eller +10

doc.setFillColor(habGray);
doc.roundedRect(startX, fagarbeiderStartY, boxWidth, 80, 3, 3, "F"); // høyde = 80 (eller juster etter behov)

// Tittel
doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.setTextColor(habBlue);
doc.text("Fagarbeidere med kurs", startX + 5, fagarbeiderStartY + 10);

// Fagarbeider-navn (kolonnevis)
doc.setFont("helvetica", "normal");
doc.setFontSize(10);
doc.setTextColor("#000");

let col1X = startX + 5;
let col2X = startX + 100;
let rowY = fagarbeiderStartY + 20;

for (let i = 0; i < fagarbeidere.length; i++) {
  const x = i < fagarbeidere.length / 2 ? col1X : col2X;
  const y = rowY + (i % Math.ceil(fagarbeidere.length / 2)) * 6.5;
  doc.text(fagarbeidere[i], x, y);
}


// === SIDE 2: Sjekkpunkter ===
doc.addPage();
doc.setFont("helvetica", "bold");
doc.setFontSize(16);
doc.setTextColor(habBlue);
doc.text("Sjekkpunkter som er markert som utført", 14, 20);

// Bakgrunnsboks
doc.setFillColor(habGray);
doc.roundedRect(10, 30, 190, 250, 3, 3, "F");

// Bruk en font som håndterer tegnene riktig
doc.setFont("courier", "normal");
doc.setFontSize(10);
doc.setTextColor("#000");

let y2 = 40;
const maxWidth = 170;
const lineHeight = 5;

sjekkpunkter.forEach((p, i) => {
  const icon = p.checked ? "X" : "[ ]"; // Disse fungerer nå med Courier
  const punktText = `${i + 1}. ${icon} ${p.text}`;
  const wrapped = doc.splitTextToSize(punktText, maxWidth);

  doc.text(wrapped, 14, y2);
  y2 += (wrapped.length * lineHeight) + 3;

  if (y2 > 260) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(habBlue);
    doc.text("Sjekkpunkter (forts.)", 14, 20);

    doc.setFont("courier", "normal");
    doc.setFontSize(10);
    doc.setTextColor("#000");

    y2 = 35;
  }
});

// === SIDE 3: Bilder ===
  if (imageUrls && imageUrls.length > 0) {
    doc.addPage();
    doc.setFontSize(14);
    doc.text("Innsendte bilder: (Trykk på lenkene for å åpne bildene):", 14, 20);

    let y = 30;
    imageUrls.forEach((url, index) => {
      doc.setTextColor(0, 102, 204); // Blå
      doc.textWithLink(`Innsendt Bilde ${index + 1}`, 14, y, { url });
      y += 10;
    });
  }








  // === SIDE 4: Signatur ===
  doc.addPage();
  doc.setFontSize(14);
  doc.setTextColor(habBlue);
  doc.text("Signatur", 14, 30);
  doc.addImage(signatureImage, "PNG", 14, 40, 80, 40);

  return doc.output("blob");
}








// Global variabel for bilder
let uploadedImages = [];
let skiftToday = []; // Global variabel


document.addEventListener("DOMContentLoaded", () => {
  const datoInput = document.getElementById("dato-input");
  const datoHøyre = document.getElementById("dagens-dato-høyre");
  const canvas = document.getElementById("signature");
  const ctx = canvas?.getContext("2d");
  const lagreBtn = document.getElementById("lagre");
  const avsluttBtn = document.getElementById("avslutt");

  // Sett dagens dato
  const iDag = new Date();
  if (datoInput) datoInput.value = iDag.toISOString().split("T")[0];
  if (datoHøyre) {
    datoHøyre.textContent = iDag.toLocaleDateString("no-NO", {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  // === Skift og fagarbeidere ===
const skiftData = {
  1: [
    "Stanislaw Stasiak", "Krzysztof Szpak", "Rafal Pater", "Zbigniew Dlubacz", 
    "Pawel Adamski", "Jaroslaw Michalec", "Konrad Mateusz Lazur", "Tomasz Pach", 
    "Marcin Pach", "Stanislaw Ganczarczyk", "Jacek Reszko"
  ],
  2: [
    "Karol Kubik", "Artur Krampikowski", "Marek Mikolajczyk", "Artur Bajcer", 
    "Mariusz Papiez", "Rafal Gebel", "Szymon Wajda", "Pawel Zlydaszyk"
  ],
  3: [
    "Wojciech Robert Fraczek", "Maciej Szustak", "Krzysztof Bialobrzeski", 
    "Sebastian Strzelec", "Piotr Michalczyk", "Jacek Tomasiak", "Lukasz Chochol", 
    "Mateusz Hajn", "Tomasz Skoczen", "Piotr Wierzejski", "Kamil Lewandowski", 
    "Tobiasz Zadworny"
  ]
};


  const startDate = new Date("2025-07-14");

  function oppdaterSkift(datoStr) {
    const arbeiderListe = document.getElementById("arbeiderListe");
    arbeiderListe.innerHTML = "";

    const dato = new Date(datoStr);
    const daysSinceStart = Math.floor((dato - startDate) / (1000 * 60 * 60 * 24));
    const weeksSinceStart = Math.floor(daysSinceStart / 7);
    const dayOfWeek = dato.getDay();
    const weekIndex = ((weeksSinceStart % 3) + 3) % 3;

const mandagMønster = [3, 1, 2];
const ukeMønster = [[3, 1], [1, 2], [2, 3]];


     skiftToday = [];
    if (dayOfWeek === 0) {
      skiftToday = [];
    } else if (dayOfWeek === 1) {
      skiftToday = [mandagMønster[weekIndex]];
    } else {
      skiftToday = ukeMønster[weekIndex];
    }

    if (skiftToday.length === 0) {
      arbeiderListe.innerHTML = "<h3>Ingen skift i dag (søndag)</h3>";
    } else {
      const container = document.createElement("div");
      container.className = "skift-container";
      skiftToday.forEach(skiftNummer => {
        const card = document.createElement("div");
card.className = `skift-block skift-${skiftNummer}`;

        const title = document.createElement("h4");
        title.textContent = `👷 Skift ${skiftNummer}`;
        card.appendChild(title);

        const list = document.createElement("ul");
        skiftData[skiftNummer].forEach(navn => {
          const li = document.createElement("li");
          li.textContent = navn;
          list.appendChild(li);
        });

        card.appendChild(list);
        container.appendChild(card);
      });
      arbeiderListe.appendChild(container);
    }
  }

  if (datoInput) {
    oppdaterSkift(datoInput.value);
    datoInput.addEventListener("change", () => oppdaterSkift(datoInput.value));
  }

  const checkAllBtn = document.getElementById("checkAll");



if (checkAllBtn) {
  let allChecked = false;
  checkAllBtn.addEventListener("click", () => {
    const allCheckboxes = document.querySelectorAll("section input[type='checkbox']");
    allCheckboxes.forEach(cb => cb.checked = !allChecked);
    allChecked = !allChecked;
    checkAllBtn.textContent = allChecked ? "✖ Fjern alle" : "✔ Huk av alle";
  });
}




  // === Signaturtegning ===
  if (canvas && ctx) {
    let isDrawing = false;
    const start = (x, y) => { isDrawing = true; ctx.beginPath(); ctx.moveTo(x, y); };
    const draw = (x, y) => { if (!isDrawing) return; ctx.lineTo(x, y); ctx.stroke(); };
    const stop = () => isDrawing = false;

    canvas.addEventListener("mousedown", e => start(e.offsetX, e.offsetY));
    canvas.addEventListener("mousemove", e => draw(e.offsetX, e.offsetY));
    canvas.addEventListener("mouseup", stop);
    canvas.addEventListener("mouseleave", stop);

    canvas.addEventListener("touchstart", e => {
      e.preventDefault();
      const t = e.touches[0];
      const r = canvas.getBoundingClientRect();
      start(t.clientX - r.left, t.clientY - r.top);
    });
    canvas.addEventListener("touchmove", e => {
      e.preventDefault();
      const t = e.touches[0];
      const r = canvas.getBoundingClientRect();
      draw(t.clientX - r.left, t.clientY - r.top);
    });
    canvas.addEventListener("touchend", stop);

    document.getElementById("clearSignature")?.addEventListener("click", () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
  }

  // === Bildeopplasting og forhåndsvisning ===
  const imageInput = document.querySelector("#imageInput");
  const imagePreview = document.querySelector("#imagePreview");

  if (imageInput && imagePreview) {
    imageInput.addEventListener("change", (event) => {
      const files = Array.from(event.target.files);
      uploadedImages = [];
      imagePreview.innerHTML = "";

      if (files.length === 0) {
        imagePreview.textContent = "Ingen bilder valgt";
        return;
      }

      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          uploadedImages.push(reader.result);
          const img = document.createElement("img");
          img.src = reader.result;
          img.style.width = "100px";
          img.style.height = "100px";
          img.style.objectFit = "cover";
          img.style.margin = "5px";
          img.style.borderRadius = "8px";
          imagePreview.appendChild(img);
        };
        reader.readAsDataURL(file);
      });
    });
  }

  // === Lagre-knapp ===
  lagreBtn?.addEventListener("click", async () => {
    const områder = Array.from(document.querySelectorAll(".område.selected")).map(el => el.textContent.trim());
    const checkboxes = Array.from(document.querySelectorAll("section input[type='checkbox']")).map(cb => ({
      checked: cb.checked
    }));

    try {
      const { error } = await supabase.from("Checklists").insert([{
        dato: datoInput.value,
        områder: områder,
        punkter: checkboxes,
        status: "påbegynt",
        signert: false
      }]);
      if (error) throw error;
      showToast("💾 Fremdrift lagret!");
    } catch (err) {
      console.error("Feil:", err);
      showToast("🚫 Kunne ikke lagre fremdriften.");
    }
  });

  
avsluttBtn?.addEventListener("click", async () => {
  const checkboxes = document.querySelectorAll("section input[type='checkbox']");
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  if (!allChecked) {
    showToast("⚠️ Alle sjekkpunkter må være avkrysset for å avslutte.");
    return;
  }

  const loaderOverlay = document.getElementById("loader-overlay");
  loaderOverlay.style.display = "flex";

  try {
    const brukerNavnEl = document.getElementById("brukerNavn");
    const brukerNavn = (brukerNavnEl?.value || "").trim();
    if (!brukerNavn) {
      showToast("⚠️ Skriv inn navnet ditt før innsending.");
      return;
    }

    const canvas = document.getElementById("signature");
    const datoInput = document.getElementById("dato-input");

    const områder = Array.from(document.querySelectorAll(".område.selected"))
      .map(el => el.textContent.trim());

    const sjekkpunkter = Array.from(checkboxes).map(cb => ({
      text: cb.parentElement.textContent.trim(),
      checked: cb.checked
    }));

    const fagarbeidere = skiftToday.length > 0
      ? skiftToday.flatMap(skiftNummer => skiftData[skiftNummer])
      : ["Ingen registrert"];

    const submissionTime = new Date().toLocaleString('no-NO', { dateStyle: 'short', timeStyle: 'short' });

    // 1) Last opp bilder (én gang)
    const files = getSelectedImageFiles();
    const imageUrls = files.length ? await uploadImagesToSupabase(files) : [];

    // 2) Lag PDF (med bilde-lenker)
    const pdfBlob = await generatePDF(
      datoInput.value,
      områder,
      fagarbeidere,
      sjekkpunkter,
      canvas.toDataURL(),
      imageUrls,
      submissionTime,
      brukerNavn
    );

    // 3) Last opp PDF
    const fileName = `sjekkliste_${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("sjekklister")
      .upload(fileName, pdfBlob, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    const { data: publicUrlData } = supabase.storage
      .from("sjekklister")
      .getPublicUrl(fileName);
    const pdfUrl = publicUrlData.publicUrl;

    // 4) Send e-post
    await emailjs.send("service_ciql98i", "template_ijnei7l", {
      username: brukerNavn,
      date: datoInput.value,
      areas: områder.join(", "),
      message: "Her er dagens sjekkliste.",
      fagarbeidere: fagarbeidere.join("\n"),
      pdf_link: pdfUrl,
      signatureImage: canvas.toDataURL(),
      image_links: imageUrls.join("\n"),
      submission_time: submissionTime
    });

    // 5) Vis fullført
    const fullfortScreen = document.getElementById("fullfort-screen");
    const mainContainer = document.querySelector(".container");
    if (fullfortScreen && mainContainer) {
      mainContainer.style.display = "none";
      fullfortScreen.style.display = "block";
    }
  } catch (err) {
    console.error("Feil ved avslutning:", err);
    showToast("🚫 Klarte ikke å avslutte sjekkliste.");
  } finally {
    loaderOverlay.style.display = "none";
  }
});


});

// === Områdevalg for kart ===
function toggleSelection(element) {
  element.classList.toggle("selected");
  updateSelectedAreas();
}

function updateSelectedAreas() {
  const selected = document.querySelectorAll(".område.selected");
  const visning = document.getElementById("valgte-områder-visning");
  visning.innerHTML = "<span style='font-weight:bold; color:#ffd;'>Valgt:</span>";
  selected.forEach(el => {
    const span = document.createElement("span");
    span.textContent = el.textContent.trim();
    visning.appendChild(span);
  });
}

function showToast(message, duration = 4000) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 100);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => container.removeChild(toast), 400);
  }, duration);
}
document.addEventListener("DOMContentLoaded", () => {
  initScrollTop();          // viser/skjuler "til toppen"-knappen
  initAreasBadge();         // teller valgte områder
  enhanceAreasKeyboard();   // enter/space på områder
  enhanceToastsA11y();      // aria-live for toasts
});
function initScrollTop() {
  const btn = document.getElementById("scrollTopBtn");
  if (!btn) return;
  const toggle = () => {
    const y = window.scrollY || document.documentElement.scrollTop;
    btn.style.display = y > 250 ? "block" : "none";
  };
  window.addEventListener("scroll", toggle, { passive: true });
  window.addEventListener("load", toggle);
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}
function initAreasBadge() {
  const badge = document.getElementById("områder-badge");
  const wrap = document.getElementById("image-wrapper");
  if (!badge || !wrap) return;

  const update = () => {
    const count = wrap.querySelectorAll(".område.selected").length;
    badge.textContent = count;
    badge.className = count ? "chip chip--warn" : "";
  };

  // når bruker klikker i kartet (din toggleSelection kjører først)
  wrap.addEventListener("click", () => setTimeout(update, 0));

  // hvis du har en “Huk av alle”-knapp
  const checkAllBtn = document.getElementById("checkAll");
  if (checkAllBtn) checkAllBtn.addEventListener("click", () => setTimeout(update, 0));

  // tilgjengelig globalt hvis du vil kalle manuelt
  window.updateAreasBadge = update;
  update();
}
function enhanceAreasKeyboard() {
  const areas = document.querySelectorAll(".område");
  if (!areas.length) return;

  areas.forEach(el => {
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.setAttribute("aria-pressed", el.classList.contains("selected") ? "true" : "false");

    el.addEventListener("click", () => {
      // oppdater aria-pressed når din toggleSelection har gjort jobben
      setTimeout(() => {
        el.setAttribute("aria-pressed", el.classList.contains("selected") ? "true" : "false");
        if (typeof window.updateAreasBadge === "function") window.updateAreasBadge();
      }, 0);
    });

    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        el.click();
      }
    });
  });
}
async function withLoading(taskFn, opts = {}) {
  const { message = "Laster...", button } = opts;
  const overlay = document.getElementById("loader-overlay");
  const loaderText = document.getElementById("loader-text");
  const topProgress = document.getElementById("top-progress");

  const startTop = () => {
    if (!topProgress) return;
    let w = 0;
    topProgress.style.width = "0%";
    const tick = () => {
      w = Math.min(90, w + 1.5 + Math.random() * 2.5);
      topProgress.style.width = w + "%";
      topProgress._raf = requestAnimationFrame(tick);
    };
    topProgress._raf = requestAnimationFrame(tick);
  };
  const finishTop = () => {
    if (!topProgress) return;
    cancelAnimationFrame(topProgress._raf);
    topProgress.style.width = "100%";
    setTimeout(() => { topProgress.style.width = "0%"; }, 350);
  };

  try {
    if (button) setButtonLoading(button, true);
    if (overlay) overlay.style.display = "flex";
    if (loaderText) loaderText.textContent = message;
    startTop();

    const res = await taskFn();
    return res;
  } finally {
    finishTop();
    if (overlay) overlay.style.display = "none";
    if (button) setButtonLoading(button, false);
  }
}

function setButtonLoading(btn, isLoading) {
  if (!btn) return;
  btn.classList.toggle("is-loading", !!isLoading);
  btn.disabled = !!isLoading;
}
// Bruk samme handler som du har i dag (hvis den heter noe annet, juster navnet)
const handleImageFiles = async (fileList) => {
  // Din eksisterende kode som forhåndsviser/komprimerer/laster opp
  // f.eks.: previewImages(fileList); await uploadImagesToSupabase(fileList)
};

// Koble begge inputtene til samme handler
["imageFromCamera", "imageFromLibrary"].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // iOS kan levere .HEIC – prøv å konvertere hvis createImageBitmap feiler hos deg
    await maybeConvertHeic(files).then((converted) => {
      // bruk 'converted' videre i eksisterende løp
      handleImageFiles(converted);
    });
  });
});

// Valgfritt: fallback-konvertering for HEIC/HEIF -> JPEG når nettleseren ikke kan lese HEIC
async function maybeConvertHeic(files) {
  const out = [];
  for (const f of files) {
    if (/heic|heif/i.test(f.name) || /image\/hei(c|f)/i.test(f.type)) {
      try {
        // Dynamisk importer heic2any fra CDN kun ved behov
        if (!window.heic2any) {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/heic2any/dist/heic2any.min.js";
          await new Promise(res => { s.onload = res; document.head.appendChild(s); });
        }
        const blob = await window.heic2any({ blob: f, toType: "image/jpeg", quality: 0.8 });
        out.push(new File([blob], f.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" }));
        continue;
      } catch(e) {
        console.warn("HEIC-konvertering feilet, prøver original:", e);
      }
    }
    out.push(f);
  }
  return out;
}
["imageInput", "imageFromLibrary", "imageFromCamera"].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return; // finnes ikke? hopp over
  el.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    try {
      const finalFiles = await maybeConvertHeic(files); // trygg på iPhone/HEIC
      // Kall din eksisterende flyt her:
      // 1) vis i forhåndsvisning
      await previewImagesSafe(finalFiles);
      // 2) last opp til Supabase
      const urls = await uploadImagesToSupabaseSafe(finalFiles);
      if (urls?.length) showToast?.("Bilder lastet opp ✅");
    } catch (err) {
      console.error(err);
      showToast?.("Kunne ikke laste opp bilde ❌");
    }
  });
});
async function getBitmap(file) {
  // 1) Prøv createImageBitmap (raskest der det støttes)
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file); } catch {}
  }
  // 2) Fallback: HTMLImage + objectURL
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    // lag canvas-bitmap-lignende objekt
    return { width: img.naturalWidth, height: img.naturalHeight, _el: img, _url: url };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function drawToCanvasFromBitmap(bmp, canvas) {
  const ctx = canvas.getContext("2d");
  if (bmp._el) {
    canvas.width = bmp.width; canvas.height = bmp.height;
    ctx.drawImage(bmp._el, 0, 0);
    URL.revokeObjectURL(bmp._url);
  } else {
    canvas.width = bmp.width; canvas.height = bmp.height;
    ctx.drawImage(bmp, 0, 0);
  }
}
async function previewImagesSafe(files) {
  const preview = document.getElementById("imagePreview");
  if (!preview) return;
  preview.innerHTML = ""; // rydd

  for (const file of files) {
    const bmp = await getBitmap(file);
    const thumb = document.createElement("canvas");
    // lag en liten thumbnail
    const maxSide = 140;
    const scale = maxSide / Math.max(bmp.width, bmp.height);
    thumb.width = Math.round(bmp.width * Math.min(1, scale));
    thumb.height = Math.round(bmp.height * Math.min(1, scale));
    const ctx = thumb.getContext("2d");
    if (bmp._el) ctx.drawImage(bmp._el, 0, 0, thumb.width, thumb.height);
    else        ctx.drawImage(bmp, 0, 0, thumb.width, thumb.height);
    preview.appendChild(thumb);
  }
}
function slugBaseName(name) {
  const base = (name || "bilde").replace(/\.[^./\\]+$/,"");
  return base.normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-zA-Z0-9._-]+/g,"_").replace(/_{2,}/g,"_").slice(0,80);
}

async function uploadImagesToSupabaseSafe(files) {
  const uploadedUrls = [];
  for (const file of files) {
    const bmp = await getBitmap(file);

    // Skaler ned til ca 1280 på lengste side
    const scale = 1280 / Math.max(bmp.width, bmp.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * Math.min(1, scale));
    canvas.height = Math.round(bmp.height * Math.min(1, scale));
    drawToCanvasFromBitmap(bmp, canvas);

    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.8));
    const filePath = `bilder/${Date.now()}_${(file.name||"bilde").replace(/\s+/g,"_")}.jpg`;

    const { data, error } = await supabase.storage
      .from("bilder")       // ← behold ditt bucket-navn
      .upload(filePath, blob, { contentType: "image/jpeg", upsert: true });

    if (error) { console.error(error); continue; }

    const { data: publicUrl } = supabase.storage
      .from("bilder")
      .getPublicUrl(filePath);

    uploadedUrls.push(publicUrl.publicUrl);
  }
  return uploadedUrls;
}
function enhanceToastsA11y() {
  const c = document.getElementById("toast-container");
  if (!c) return;
  c.setAttribute("role", "status");
  c.setAttribute("aria-live", "polite");
}

// Hvis du har en showToast(message, duration) fra før, pakk den:
if (typeof window.showToast === "function") {
  const __orig = window.showToast;
  window.showToast = function(msg, dur) {
    try {
      const c = document.getElementById("toast-container");
      if (c) { c.setAttribute("role","status"); c.setAttribute("aria-live","polite"); }
    } catch {}
    return __orig(msg, dur);
  };
}
