import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, addDoc, getDoc, getDocs, collection, query, where, orderBy, updateDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";
import { getVertexAI, getGenerativeModel } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-vertexai.js";

const firebaseConfig = {
  projectId: "diamond-tip-tattoo",
  appId: "1:596392701743:web:2105bd55e96cb8737cbbda",
  storageBucket: "diamond-tip-tattoo.firebasestorage.app",
  apiKey: "AIzaSyDYvhE2qfD1kDl5ba4MC9GwciFTy4Qe7pY",
  authDomain: "diamond-tip-tattoo.firebaseapp.com",
  messagingSenderId: "596392701743",
  measurementId: "G-SXX8SXNZHD"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const vertexAI = getVertexAI(app);
const geminiModel = getGenerativeModel(vertexAI, { model: "gemini-2.5-flash" });

// Global Variables
const SITE_ORIGIN = "https://diamond-tip-tattoo.web.app";
/** Super admins — portal CRM + Firestore admin rights */
const SUPER_ADMIN_EMAILS = [
  "stormychaseforrester@gmail.com",
  "hello@techaidaustralia.com.au"
];
let currentUser = null;
let isAdmin = false;
let selectedBookingFiles = [];
let dbBookings = [];
let dbFaqs = [];
let dbPortfolio = [];

// Public Interactive Booking Calendar & AI Tattoo Studio State
let pubCalendarDate = new Date();
let selectedPubDate = null;
let selectedPubTime = null;
let aiUploadedFile = null;
let aiGeneratedTattooUrl = null;
let aiGeneratedTattooPrompt = null;

// Static/Fallback Data
const defaultSpecialties = [
  { id: "fineline", title: "FINE LINE", description: "Delicate detail. Lasting elegance.", image: "assets/specialties/fineline.jpg" },
  { id: "blackgrey", title: "BLACK & GREY", description: "Depth. Contrast. Timeless impact.", image: "assets/specialties/blackgrey.jpg" },
  { id: "realism", title: "REALISM", description: "Photorealistic artistry. True to life.", image: "assets/specialties/realism.jpg" },
  { id: "custom", title: "CUSTOM DESIGN", description: "Your vision. Our craft.", image: "assets/specialties/custom.jpg" }
];

function resolveSpecialties(cmsItems) {
  // Always keep the four style cards; use curated tattoo covers when CMS still has placeholders.
  if (!Array.isArray(cmsItems) || cmsItems.length === 0) return defaultSpecialties;

  const byId = Object.fromEntries(
    cmsItems.map(item => [(item.id || item.title || "").toString().toLowerCase().replace(/[^a-z]/g, ""), item])
  );

  return defaultSpecialties.map(def => {
    const key = def.id;
    const cms = byId[key] || cmsItems.find(s => (s.title || "").toUpperCase().includes(def.title.split(" ")[0]));
    if (!cms) return def;
    const img = cms.image || cms.src || "";
    const hasCuratedImg = typeof img === "string" && (
      img.includes("assets/specialties/") ||
      img.includes("assets/portfolio/")
    );
    return {
      id: def.id,
      title: cms.title || def.title,
      description: cms.description || def.description,
      image: hasCuratedImg ? img : def.image
    };
  });
}

function renderSpecialtiesGrid(specialties) {
  const specialtiesGrid = document.getElementById("specialtiesGrid");
  if (!specialtiesGrid) return;

  specialtiesGrid.innerHTML = specialties.map(spec => `
    <div class="card spec-card">
      <div class="spec-image-wrap">
        <img src="${spec.image}" alt="${spec.title}" loading="lazy">
        <div class="spec-smoke" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
      </div>
      <div class="card-content">
        <h3>${spec.title}</h3>
        <p>${spec.description}</p>
        <a href="#portfolio" class="explore" data-portfolio-filter="${spec.id || ""}">EXPLORE &rarr;</a>
      </div>
    </div>
  `).join("");

  specialtiesGrid.querySelectorAll("[data-portfolio-filter]").forEach(link => {
    link.addEventListener("click", () => {
      const filter = link.getAttribute("data-portfolio-filter");
      if (!filter) return;
      activePortfolioFilter = filter;
      const filterBar = document.getElementById("portfolioFilters");
      if (filterBar) {
        filterBar.querySelectorAll("[data-filter]").forEach(b => {
          b.classList.toggle("active", b.getAttribute("data-filter") === filter);
        });
      }
      renderPortfolioGrid(dbPortfolio, activePortfolioFilter);
    });
  });
}

const defaultArtists = [
  {
    id: "steven",
    name: "Steven Benn",
    role: "31+ years · 80+ awards · realism & black & grey",
    image: "assets/artists/steven-benn.png",
    badge: "Owner",
    bio: "Studio master of Diamond Tip Tattoo. Custom portraits, realism and lasting black & grey for Illawarra clients.",
    tags: ["Realism", "Black & Grey", "Custom"]
  },
  {
    id: "scotty",
    name: "Scotty",
    role: "21+ years · blackwork, linework & custom",
    image: "assets/artists/scotty.png",
    badge: "Artist",
    bio: "Resident tattooist with clean linework, bold blackwork and a calm, professional studio approach.",
    tags: ["Blackwork", "Linework", "Custom"]
  }
];

function artistsAreCurated(items) {
  return Array.isArray(items) && items.some(a =>
    typeof (a.image || "") === "string" && (a.image || "").includes("assets/artists/")
  );
}

function renderArtistsGrid(artists) {
  const artistsGrid = document.getElementById("artistsGrid");
  if (!artistsGrid) return;
  const list = artists && artists.length ? artists : defaultArtists;
  artistsGrid.innerHTML = list.map((art) => {
    const first = (art.name || "Artist").split(" ")[0];
    const badge = art.badge || (art.id === "steven" || /owner/i.test(art.role || "") ? "Owner" : "Artist");
    const img = (art.image || "").includes("steven-benn.jpg")
      ? "assets/artists/steven-benn.png"
      : (art.image || "assets/artists/steven-benn.png");
    const pref = art.id === "steven" ? "Steven Benn" : (art.name || first);
    return `
    <article class="artist artist-compact" data-artist="${art.id || ""}">
      <figure class="artist-avatar">
        <img src="${img}" alt="${art.name || "Artist"}" width="160" height="160" loading="lazy" decoding="async">
      </figure>
      <div class="artist-info">
        <span class="artist-badge-inline">${badge}</span>
        <h3 class="artist-name">${art.name || ""}</h3>
        <p class="artist-title">${art.role || ""}</p>
        ${art.bio ? `<p class="artist-text">${art.bio}</p>` : ""}
        ${Array.isArray(art.tags) && art.tags.length ? `
          <ul class="artist-skills">${art.tags.map(t => `<li>${t}</li>`).join("")}</ul>
        ` : ""}
        <a href="#book" class="btn btn-solid artist-cta" data-artist-pref="${pref}" data-track="cta_book_${art.id || first.toLowerCase()}">Book with ${first}</a>
      </div>
    </article>`;
  }).join("");
}

// Curated tattoo portfolio from Steven Benn / Diamond Tip Tattoo work
const defaultPortfolio = [
  { src: "assets/portfolio/fineline/fineline_butterfly-florals.jpg", category: "fineline", alt: "Butterfly Florals" },
  { src: "assets/portfolio/fineline/fineline_geometric-hand.jpg", category: "fineline", alt: "Geometric Hand" },
  { src: "assets/portfolio/fineline/fineline_mandala-arm.jpg", category: "fineline", alt: "Mandala Arm" },
  { src: "assets/portfolio/fineline/fineline_ornamental-mandala.jpg", category: "fineline", alt: "Ornamental Mandala" },
  { src: "assets/portfolio/fineline/fineline_sunflower-script.jpg", category: "fineline", alt: "Sunflower Script" },
  { src: "assets/portfolio/fineline/fineline_tribal-waves.jpg", category: "fineline", alt: "Tribal Waves" },
  { src: "assets/portfolio/blackgrey/blackgrey_black-dragon.jpg", category: "blackgrey", alt: "Black Dragon" },
  { src: "assets/portfolio/blackgrey/blackgrey_blackwork-sleeve.jpg", category: "blackgrey", alt: "Blackwork Sleeve" },
  { src: "assets/portfolio/blackgrey/blackgrey_chest-blackwork.jpg", category: "blackgrey", alt: "Chest Blackwork" },
  { src: "assets/portfolio/blackgrey/blackgrey_clock-angel-sleeve.jpg", category: "blackgrey", alt: "Clock Angel Sleeve" },
  { src: "assets/portfolio/blackgrey/blackgrey_compass-lighthouse.jpg", category: "blackgrey", alt: "Compass Lighthouse" },
  { src: "assets/portfolio/blackgrey/blackgrey_dagger-lettering.jpg", category: "blackgrey", alt: "Dagger Lettering" },
  { src: "assets/portfolio/blackgrey/blackgrey_dragon-back.jpg", category: "blackgrey", alt: "Dragon Back" },
  { src: "assets/portfolio/blackgrey/blackgrey_hooded-figure.jpg", category: "blackgrey", alt: "Hooded Figure" },
  { src: "assets/portfolio/blackgrey/blackgrey_memorial-clock.jpg", category: "blackgrey", alt: "Memorial Clock" },
  { src: "assets/portfolio/blackgrey/blackgrey_never-forget-clock.jpg", category: "blackgrey", alt: "Never Forget Clock" },
  { src: "assets/portfolio/blackgrey/blackgrey_ocean-wave.jpg", category: "blackgrey", alt: "Ocean Wave" },
  { src: "assets/portfolio/blackgrey/blackgrey_ornamental-sleeve.jpg", category: "blackgrey", alt: "Ornamental Sleeve" },
  { src: "assets/portfolio/blackgrey/blackgrey_raven-feathers.jpg", category: "blackgrey", alt: "Raven Feathers" },
  { src: "assets/portfolio/blackgrey/blackgrey_rose-and-orb.jpg", category: "blackgrey", alt: "Rose And Orb" },
  { src: "assets/portfolio/blackgrey/blackgrey_scale-sleeve.jpg", category: "blackgrey", alt: "Scale Sleeve" },
  { src: "assets/portfolio/blackgrey/blackgrey_script-lettering.jpg", category: "blackgrey", alt: "Script Lettering" },
  { src: "assets/portfolio/blackgrey/blackgrey_skull-and-roses.jpg", category: "blackgrey", alt: "Skull And Roses" },
  { src: "assets/portfolio/blackgrey/blackgrey_skull-backpiece.jpg", category: "blackgrey", alt: "Skull Backpiece" },
  { src: "assets/portfolio/blackgrey/blackgrey_skull-script.jpg", category: "blackgrey", alt: "Skull Script" },
  { src: "assets/portfolio/blackgrey/blackgrey_spades-lettering.jpg", category: "blackgrey", alt: "Spades Lettering" },
  { src: "assets/portfolio/blackgrey/blackgrey_wing-feather.jpg", category: "blackgrey", alt: "Wing Feather" },
  { src: "assets/portfolio/realism/realism_bear-wolf-landscape.jpg", category: "realism", alt: "Bear Wolf Landscape" },
  { src: "assets/portfolio/realism/realism_clown-realism.jpg", category: "realism", alt: "Clown Realism" },
  { src: "assets/portfolio/realism/realism_cowboy-skull.jpg", category: "realism", alt: "Cowboy Skull" },
  { src: "assets/portfolio/realism/realism_crowned-woman.jpg", category: "realism", alt: "Crowned Woman" },
  { src: "assets/portfolio/realism/realism_eye-and-rose.jpg", category: "realism", alt: "Eye And Rose" },
  { src: "assets/portfolio/realism/realism_hyperreal-eye.jpg", category: "realism", alt: "Hyperreal Eye" },
  { src: "assets/portfolio/realism/realism_indigenous-portrait.jpg", category: "realism", alt: "Indigenous Portrait" },
  { src: "assets/portfolio/realism/realism_indigenous-woman.jpg", category: "realism", alt: "Indigenous Woman" },
  { src: "assets/portfolio/realism/realism_joker-clown-faces.jpg", category: "realism", alt: "Joker Clown Faces" },
  { src: "assets/portfolio/realism/realism_leopard-florals.jpg", category: "realism", alt: "Leopard Florals" },
  { src: "assets/portfolio/realism/realism_leopard-realism.jpg", category: "realism", alt: "Leopard Realism" },
  { src: "assets/portfolio/realism/realism_lynx-portrait.jpg", category: "realism", alt: "Lynx Portrait" },
  { src: "assets/portfolio/realism/realism_ornate-tiger.jpg", category: "realism", alt: "Ornate Tiger" },
  { src: "assets/portfolio/realism/realism_poseidon-portrait.jpg", category: "realism", alt: "Poseidon Portrait" },
  { src: "assets/portfolio/realism/realism_roaring-tiger.jpg", category: "realism", alt: "Roaring Tiger" },
  { src: "assets/portfolio/realism/realism_screaming-face.jpg", category: "realism", alt: "Screaming Face" },
  { src: "assets/portfolio/realism/realism_skull-sleeve.jpg", category: "realism", alt: "Skull Sleeve" },
  { src: "assets/portfolio/realism/realism_tiger-closeup.jpg", category: "realism", alt: "Tiger Closeup" },
  { src: "assets/portfolio/realism/realism_tiger-portrait.jpg", category: "realism", alt: "Tiger Portrait" },
  { src: "assets/portfolio/realism/realism_tiger-skull-back.jpg", category: "realism", alt: "Tiger Skull Back" },
  { src: "assets/portfolio/realism/realism_tiger-woman.jpg", category: "realism", alt: "Tiger Woman" },
  { src: "assets/portfolio/realism/realism_warrior-portrait.jpg", category: "realism", alt: "Warrior Portrait" },
  { src: "assets/portfolio/realism/realism_wolf-blue-eye.jpg", category: "realism", alt: "Wolf Blue Eye" },
  { src: "assets/portfolio/realism/realism_wolf-waterfall.jpg", category: "realism", alt: "Wolf Waterfall" },
  { src: "assets/portfolio/custom/custom_color-serpent.jpg", category: "custom", alt: "Color Serpent" },
  { src: "assets/portfolio/custom/custom_egyptian-backpiece.jpg", category: "custom", alt: "Egyptian Backpiece" },
  { src: "assets/portfolio/custom/custom_japanese-pagoda.jpg", category: "custom", alt: "Japanese Pagoda" },
  { src: "assets/portfolio/custom/custom_koi-watercolor.jpg", category: "custom", alt: "Koi Watercolor" },
  { src: "assets/portfolio/custom/custom_neotrad-oni.jpg", category: "custom", alt: "Neotrad Oni" },
  { src: "assets/portfolio/custom/custom_neotrad-serpent.jpg", category: "custom", alt: "Neotrad Serpent" },
  { src: "assets/portfolio/custom/custom_statue-sleeve.jpg", category: "custom", alt: "Statue Sleeve" },
  { src: "assets/portfolio/custom/custom_studio-banner.jpg", category: "custom", alt: "Studio Banner" },
];

const portfolioCategoryLabels = {
  fineline: "Fine Line",
  blackgrey: "Black & Grey",
  realism: "Realism",
  custom: "Custom Design"
};

let activePortfolioFilter = "all";
let portfolioShowAll = false;
const PORTFOLIO_PAGE_SIZE = 8; // 2 rows × 4 columns

function normalizePortfolioItem(item) {
  if (typeof item === "string") {
    const src = item;
    let category = "custom";
    if (src.includes("fineline")) category = "fineline";
    else if (src.includes("blackgrey") || src.includes("black-grey") || src.includes("black_grey")) category = "blackgrey";
    else if (src.includes("realism")) category = "realism";
    else if (src.includes("custom")) category = "custom";
    return { src, category, alt: "Tattoo Portfolio Work" };
  }
  return {
    src: item.src || item.image || item.url || "",
    category: item.category || "custom",
    alt: item.alt || item.title || "Tattoo Portfolio Work"
  };
}

function portfolioHasCuratedWork(items) {
  return Array.isArray(items) && items.some(item => {
    const src = typeof item === "string" ? item : (item?.src || item?.image || "");
    return typeof src === "string" && src.includes("assets/portfolio/");
  });
}

function renderPortfolioGrid(items, filter = "all") {
  const portfolioGrid = document.getElementById("portfolioGrid");
  const moreWrap = document.getElementById("portfolioShowMoreWrap");
  const moreBtn = document.getElementById("portfolioShowMoreBtn");
  const moreMeta = document.getElementById("portfolioShowMoreMeta");
  if (!portfolioGrid) return;

  const normalized = (items || []).map(normalizePortfolioItem).filter(i => i.src);
  const filtered = filter === "all" ? normalized : normalized.filter(i => i.category === filter);

  if (filtered.length === 0) {
    portfolioGrid.innerHTML = `<p class="portfolio-empty">No pieces in this category yet.</p>`;
    if (moreWrap) moreWrap.hidden = true;
    return;
  }

  const limit = portfolioShowAll ? filtered.length : PORTFOLIO_PAGE_SIZE;
  const visible = filtered.slice(0, limit);
  const remaining = Math.max(0, filtered.length - visible.length);

  portfolioGrid.innerHTML = visible.map((item, idx) => `
    <figure class="portfolio-item reveal-on-scroll" data-category="${item.category}" style="--reveal-i:${idx % 8}">
      <img src="${item.src}" alt="${item.alt}" loading="lazy" width="480" height="600">
      <figcaption class="portfolio-caption">
        <span class="portfolio-cat-tag">${portfolioCategoryLabels[item.category] || item.category}</span>
        <span class="portfolio-title">${item.alt}</span>
      </figcaption>
    </figure>
  `).join("");

  if (moreWrap && moreBtn) {
    if (filtered.length > PORTFOLIO_PAGE_SIZE) {
      moreWrap.hidden = false;
      moreBtn.hidden = false;
      moreBtn.textContent = portfolioShowAll
        ? "Show less"
        : `Show more artwork (${remaining} more)`;
      if (moreMeta) {
        moreMeta.textContent = `Showing ${visible.length} of ${filtered.length}`;
      }
    } else {
      moreWrap.hidden = true;
    }
  }

  // Stagger reveal for newly painted items
  requestAnimationFrame(() => {
    portfolioGrid.querySelectorAll(".reveal-on-scroll").forEach((el) => {
      el.classList.add("is-visible");
    });
  });
}

function initPortfolioFilters() {
  const filterBar = document.getElementById("portfolioFilters");
  if (!filterBar) return;

  filterBar.querySelectorAll("[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      filterBar.querySelectorAll("[data-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activePortfolioFilter = btn.getAttribute("data-filter") || "all";
      portfolioShowAll = false;
      renderPortfolioGrid(dbPortfolio, activePortfolioFilter);
    });
  });

  const moreBtn = document.getElementById("portfolioShowMoreBtn");
  if (moreBtn && !moreBtn.dataset.bound) {
    moreBtn.dataset.bound = "1";
    moreBtn.addEventListener("click", () => {
      portfolioShowAll = !portfolioShowAll;
      renderPortfolioGrid(dbPortfolio, activePortfolioFilter);
      if (!portfolioShowAll) {
        document.getElementById("portfolio")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }
}

const defaultFaqs = [
  { id: "faq1", question: "How do I book an appointment?", answer: "Fill out the booking form to request a consultation." },
  { id: "faq2", question: "How much will my tattoo cost?", answer: "Cost depends on size and detail. We will provide an estimate after consultation." },
  { id: "faq3", question: "How long will my tattoo take?", answer: "Sessions can vary from 1 hour to full days." },
  { id: "faq4", question: "Do you offer touch-ups?", answer: "Yes, we offer complimentary touch-ups within 6 months." },
  { id: "faq5", question: "Is the studio private?", answer: "Yes, we operate by appointment only in a private setting." }
];

// Aftercare & studio supplies (Coles / Woolworths / Chemist Warehouse style stock)
const SHOP_CATEGORY_LABELS = {
  all: "All",
  aftercare: "Aftercare",
  cleansing: "Cleansing",
  wraps: "Wraps & dressings",
  studio: "Studio essentials"
};
const SHOP_PAGE_SIZE = 8; // 2 rows × 4 columns
let activeShopFilter = "all";
let shopShowAll = false;

function inferShopCategory(p) {
  if (p.category && SHOP_CATEGORY_LABELS[p.category]) return p.category;
  const n = `${p.name || ""} ${p.id || ""}`.toLowerCase();
  if (/glove|saniti|paper.?towel/.test(n)) return "studio";
  if (/gauze|tape|cotton|cling/.test(n)) return "wraps";
  if (/soap|antiseptic|wipe/.test(n)) return "cleansing";
  return "aftercare";
}

const defaultShopProducts = [
  { id: "prod_spf50-sunscreen", name: "SPF 50+ Sunscreen", price: 18.50, category: "aftercare", image: "assets/products/spf50-sunscreen.jpg", description: "Broad-spectrum face & body sunscreen for healing ink. Chemist Warehouse / Coles style staple." },
  { id: "prod_nitrile-gloves", name: "Black Nitrile Gloves (Box 100)", price: 24.00, category: "studio", image: "assets/products/nitrile-gloves.jpg", description: "Powder-free black nitrile gloves — studio hygiene essential." },
  { id: "prod_gentle-soap", name: "Fragrance-Free Liquid Soap", price: 8.90, category: "cleansing", image: "assets/products/gentle-soap.jpg", description: "Gentle pH-balanced cleanser for washing fresh tattoos safely." },
  { id: "prod_healing-ointment", name: "Healing Ointment Tube", price: 12.50, category: "aftercare", image: "assets/products/healing-ointment.jpg", description: "Thick protective ointment for the first days of tattoo aftercare. Chemist-aisle favourite." },
  { id: "prod_aloe-vera-gel", name: "Aloe Vera Gel", price: 9.90, category: "aftercare", image: "assets/products/aloe-vera-gel.jpg", description: "Cooling pure aloe gel to soothe irritated skin during healing." },
  { id: "prod_hand-sanitizer", name: "Alcohol-Free Hand Sanitiser", price: 7.50, category: "studio", image: "assets/products/hand-sanitizer.jpg", description: "Moisturising hand sanitiser for clients and studio use." },
  { id: "prod_gauze-roll", name: "Sterile Gauze Roll", price: 5.50, category: "wraps", image: "assets/products/gauze-roll.jpg", description: "Medical-grade gauze for aftercare wraps and blotting." },
  { id: "prod_moisturising-cream", name: "Fragrance-Free Moisturising Cream", price: 14.90, category: "aftercare", image: "assets/products/moisturising-cream.jpg", description: "Rich cream for dry healing skin once the tattoo has settled." },
  { id: "prod_micropore-tape", name: "Medical Micropore Tape", price: 6.20, category: "wraps", image: "assets/products/micropore-tape.jpg", description: "Breathable paper tape for securing wraps without tearing skin." },
  { id: "prod_cotton-pads", name: "Cotton Rounds Pack", price: 4.50, category: "wraps", image: "assets/products/cotton-pads.jpg", description: "Soft cotton pads for gentle cleansing — Coles / Woolies aisle." },
  { id: "prod_lip-balm", name: "Healing Lip Balm", price: 5.00, category: "aftercare", image: "assets/products/lip-balm.jpg", description: "Fragrance-free balm for lip tattoos and general dryness." },
  { id: "prod_antiseptic-liquid", name: "Antiseptic Liquid", price: 11.90, category: "cleansing", image: "assets/products/antiseptic-liquid.jpg", description: "Pharmacy antiseptic for studio prep and minor skin care." },
  { id: "prod_vitamin-e-cream", name: "Vitamin E Skin Cream", price: 10.50, category: "aftercare", image: "assets/products/vitamin-e-cream.jpg", description: "Vitamin E cream to support soft, hydrated healed skin." },
  { id: "prod_paper-towels", name: "Absorbent Paper Towels", price: 4.20, category: "studio", image: "assets/products/paper-towels.jpg", description: "Lint-conscious paper towels for studio and home aftercare." },
  { id: "prod_cling-wrap", name: "Cling Wrap Roll", price: 3.80, category: "wraps", image: "assets/products/cling-wrap.jpg", description: "Food-grade cling wrap for initial tattoo covering after sessions." },
  { id: "prod_antibacterial-wipes", name: "Antibacterial Wipes Pack", price: 6.90, category: "cleansing", image: "assets/products/antibacterial-wipes.jpg", description: "Fragrance-aware wipes for surfaces and kit bags. Chemist style." },
  { id: "prod_liquid-bandage", name: "Liquid Bandage", price: 13.50, category: "aftercare", image: "assets/products/liquid-bandage.jpg", description: "Brush-on protective film for small healed areas needing cover." },
  { id: "prod_ink-heal-balm", name: "Ink Heal Balm Tin", price: 22.00, category: "aftercare", image: "assets/products/ink-heal-balm.jpg", description: "Studio-favourite healing balm tin — thick, clean, fragrance-free." },
  { id: "prod_saline-wound-wash", name: "Saline Wound Wash Spray", price: 9.50, category: "aftercare", image: "assets/products/saline-wound-wash.jpg", description: "Sterile saline spray for gentle rinsing of fresh work." }
];

function shopHasCuratedProducts(items) {
  return Array.isArray(items) && items.some(p =>
    typeof (p.image || "") === "string" && (p.image || "").includes("assets/products/")
  );
}

// =============================================
// STUDIO SHOP — cart + pickup checkout (works for guests)
// =============================================
const CART_STORAGE_KEY = "dtt_shop_cart_v1";
window.shopCatalog = [];
window.cart = [];

function money(n) {
  const v = Number(n);
  return `$${(Number.isFinite(v) ? v : 0).toFixed(2)}`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    window.cart = Array.isArray(parsed) ? parsed : [];
  } catch {
    window.cart = [];
  }
}

function saveCartToStorage() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(window.cart));
  } catch { /* private mode */ }
}

function cartCount() {
  return window.cart.reduce((n, i) => n + (i.qty || 0), 0);
}

function cartSubtotal() {
  return window.cart.reduce((n, i) => n + Number(i.price) * (i.qty || 0), 0);
}

function findProduct(id) {
  return (window.shopCatalog || []).find(p => p.id === id)
    || defaultShopProducts.find(p => p.id === id)
    || null;
}

window.updateCartUI = function updateCartUI() {
  const badge = document.getElementById("cartBadge");
  const count = cartCount();
  if (badge) {
    badge.hidden = count === 0;
    badge.textContent = String(count);
  }

  const itemsEl = document.getElementById("cartItems");
  const emptyMsg = document.getElementById("cartEmptyMsg");
  const subtotalEl = document.getElementById("cartSubtotal");
  const checkoutBtn = document.getElementById("cartCheckoutBtn");

  if (subtotalEl) subtotalEl.textContent = money(cartSubtotal());
  if (checkoutBtn) checkoutBtn.disabled = count === 0;

  if (!itemsEl) return;

  if (!window.cart.length) {
    itemsEl.innerHTML = `<p class="cart-empty" id="cartEmptyMsg">Your cart is empty. Add aftercare from the shop.</p>`;
    return;
  }

  itemsEl.innerHTML = window.cart.map(item => {
    const line = Number(item.price) * (item.qty || 0);
    return `
      <div class="cart-line" data-id="${escapeHtml(item.id)}">
        <img src="${escapeHtml(item.image || "assets/products/ink-heal-balm.jpg")}" alt="" class="cart-line-img" onerror="this.src='assets/products/ink-heal-balm.jpg'">
        <div class="cart-line-body">
          <h4>${escapeHtml(item.name)}</h4>
          <p class="cart-line-price">${money(item.price)} each</p>
          <div class="cart-line-qty">
            <button type="button" class="cart-qty-btn" data-cart-action="dec" data-id="${escapeHtml(item.id)}" aria-label="Decrease quantity">−</button>
            <span>${item.qty}</span>
            <button type="button" class="cart-qty-btn" data-cart-action="inc" data-id="${escapeHtml(item.id)}" aria-label="Increase quantity">+</button>
            <button type="button" class="cart-remove-btn" data-cart-action="remove" data-id="${escapeHtml(item.id)}">Remove</button>
          </div>
        </div>
        <div class="cart-line-total">${money(line)}</div>
      </div>`;
  }).join("");
};

window.addToCart = function addToCart(productId, qty = 1) {
  const prod = findProduct(productId);
  if (!prod) {
    console.warn("Product not found:", productId);
    return false;
  }
  const existing = window.cart.find(i => i.id === prod.id);
  if (existing) {
    existing.qty = Math.min(20, (existing.qty || 0) + qty);
  } else {
    window.cart.push({
      id: prod.id,
      name: prod.name,
      price: Number(prod.price) || 0,
      image: prod.image || "assets/products/ink-heal-balm.jpg",
      qty: Math.max(1, Math.min(20, qty))
    });
  }
  saveCartToStorage();
  updateCartUI();
  if (typeof window.trackEvent === "function") {
    window.trackEvent("add_to_cart", { item_id: prod.id, item_name: prod.name, value: prod.price });
  }
  return true;
};

window.setCartQty = function setCartQty(productId, qty) {
  const item = window.cart.find(i => i.id === productId);
  if (!item) return;
  if (qty <= 0) {
    window.cart = window.cart.filter(i => i.id !== productId);
  } else {
    item.qty = Math.min(20, qty);
  }
  saveCartToStorage();
  updateCartUI();
};

window.openCartDrawer = function openCartDrawer() {
  const drawer = document.getElementById("cartDrawer");
  if (!drawer) return;
  updateCartUI();
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("cart-open");
};

window.closeCartDrawer = function closeCartDrawer() {
  const drawer = document.getElementById("cartDrawer");
  if (!drawer) return;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("cart-open");
};

window.openCheckout = function openCheckout() {
  if (!window.cart.length) {
    alert("Your cart is empty.");
    return;
  }
  closeCartDrawer();
  const modal = document.getElementById("checkoutModal");
  const form = document.getElementById("checkoutForm");
  const success = document.getElementById("checkoutSuccess");
  const summary = document.getElementById("checkoutSummary");
  const err = document.getElementById("checkoutError");
  if (err) err.textContent = "";
  if (form) form.hidden = false;
  if (success) success.hidden = true;
  if (summary) {
    summary.innerHTML = `
      <ul class="checkout-lines">
        ${window.cart.map(i => `<li><span>${escapeHtml(i.name)} × ${i.qty}</span><span>${money(i.price * i.qty)}</span></li>`).join("")}
      </ul>
      <div class="checkout-total"><span>Total (pay at studio)</span><strong>${money(cartSubtotal())}</strong></div>`;
  }
  // Prefill from booking form if present
  const bn = document.getElementById("bookingName");
  const be = document.getElementById("bookingEmail");
  const bp = document.getElementById("bookingPhone");
  if (bn && document.getElementById("checkoutName") && !document.getElementById("checkoutName").value) {
    document.getElementById("checkoutName").value = bn.value || "";
  }
  if (be && document.getElementById("checkoutEmail") && !document.getElementById("checkoutEmail").value) {
    document.getElementById("checkoutEmail").value = be.value || "";
  }
  if (bp && document.getElementById("checkoutPhone") && !document.getElementById("checkoutPhone").value) {
    document.getElementById("checkoutPhone").value = bp.value || "";
  }
  if (modal) {
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }
};

window.closeCheckout = function closeCheckout() {
  const modal = document.getElementById("checkoutModal");
  if (modal) {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("modal-open");
};

function renderShopGrid(products) {
  const shopGrid = document.getElementById("shopGrid");
  if (!shopGrid) return;

  const list = Array.isArray(products) && products.length ? products : defaultShopProducts;
  window.shopCatalog = list.map(p => ({
    id: p.id || `prod_${String(p.name || "item").toLowerCase().replace(/\s+/g, "-")}`,
    name: p.name,
    price: Number(p.price) || 0,
    image: p.image || "assets/products/ink-heal-balm.jpg",
    description: p.description || "",
    category: inferShopCategory(p)
  }));

  const filtered = activeShopFilter === "all"
    ? window.shopCatalog
    : window.shopCatalog.filter(p => p.category === activeShopFilter);

  const limit = shopShowAll ? filtered.length : SHOP_PAGE_SIZE;
  const visible = filtered.slice(0, limit);
  const remaining = Math.max(0, filtered.length - visible.length);

  const countEl = document.getElementById("shopProductCount");
  if (countEl) {
    const catLabel = SHOP_CATEGORY_LABELS[activeShopFilter] || "All";
    countEl.textContent = `${visible.length} of ${filtered.length} · ${catLabel} · pickup only`;
  }

  const moreWrap = document.getElementById("shopShowMoreWrap");
  const moreBtn = document.getElementById("shopShowMoreBtn");
  const moreMeta = document.getElementById("shopShowMoreMeta");
  if (moreWrap && moreBtn) {
    if (filtered.length > SHOP_PAGE_SIZE) {
      moreWrap.hidden = false;
      moreBtn.textContent = shopShowAll ? "Show less" : `Show more products (${remaining} more)`;
      if (moreMeta) moreMeta.textContent = `Showing ${visible.length} of ${filtered.length}`;
    } else {
      moreWrap.hidden = true;
    }
  }

  if (!filtered.length) {
    shopGrid.innerHTML = `<p style="color: var(--text-secondary);">No products in this category yet.</p>`;
    return;
  }

  shopGrid.innerHTML = visible.map((prod, idx) => {
    const inCart = window.cart.find(i => i.id === prod.id);
    const cat = SHOP_CATEGORY_LABELS[prod.category] || prod.category;
    return `
    <article class="shop-card reveal-on-scroll" data-product-id="${escapeHtml(prod.id)}" data-category="${escapeHtml(prod.category)}" style="--reveal-i:${idx % 8}">
      <div class="product-image-wrap">
        <img src="${escapeHtml(prod.image)}" alt="${escapeHtml(prod.name)}" loading="lazy" width="400" height="400"
          onerror="this.onerror=null;this.src='assets/products/ink-heal-balm.jpg';">
        <span class="shop-card-cat">${escapeHtml(cat)}</span>
      </div>
      <div class="shop-card-content">
        <h3>${escapeHtml(prod.name)}</h3>
        <p>${escapeHtml(prod.description)}</p>
        <div class="shop-price">${money(prod.price)}</div>
        <button type="button" class="btn btn-solid shop-add-btn" data-add-to-cart="${escapeHtml(prod.id)}"
          style="width:100%;" data-track="cta_add_to_cart">
          ${inCart ? `In cart (${inCart.qty}) · Add another` : "Add to cart"}
        </button>
        <p class="shop-card-meta">Pickup · pay at studio</p>
      </div>
    </article>`;
  }).join("");

  requestAnimationFrame(() => {
    shopGrid.querySelectorAll(".reveal-on-scroll").forEach((el) => el.classList.add("is-visible"));
  });
}

function initShopFilters() {
  const bar = document.getElementById("shopFilters");
  if (!bar) return;
  bar.querySelectorAll("[data-shop-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      bar.querySelectorAll("[data-shop-filter]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeShopFilter = btn.getAttribute("data-shop-filter") || "all";
      shopShowAll = false;
      renderShopGrid(window.shopCatalog.length ? window.shopCatalog : defaultShopProducts);
    });
  });
  const moreBtn = document.getElementById("shopShowMoreBtn");
  if (moreBtn && !moreBtn.dataset.bound) {
    moreBtn.dataset.bound = "1";
    moreBtn.addEventListener("click", () => {
      shopShowAll = !shopShowAll;
      renderShopGrid(window.shopCatalog.length ? window.shopCatalog : defaultShopProducts);
      if (!shopShowAll) {
        document.getElementById("shop")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }
}

window.initShopCart = function initShopCart() {
  if (window.__shopCartInited) {
    loadCartFromStorage();
    renderShopGrid(window.shopCatalog.length ? window.shopCatalog : defaultShopProducts);
    updateCartUI();
    return;
  }
  window.__shopCartInited = true;

  loadCartFromStorage();
  // Always paint catalogue immediately (no login, no portal)
  initShopFilters();
  renderShopGrid(defaultShopProducts);
  updateCartUI();

  // Delegated product clicks
  document.addEventListener("click", (e) => {
    const addBtn = e.target.closest("[data-add-to-cart]");
    if (addBtn) {
      e.preventDefault();
      const id = addBtn.getAttribute("data-add-to-cart");
      if (window.addToCart(id, 1)) {
        addBtn.classList.add("just-added");
        addBtn.textContent = "Added ✓";
        setTimeout(() => {
          renderShopGrid(window.shopCatalog.length ? window.shopCatalog : defaultShopProducts);
        }, 700);
        // Soft open cart so user sees it worked
        window.openCartDrawer();
      }
      return;
    }

    const cartAction = e.target.closest("[data-cart-action]");
    if (cartAction) {
      e.preventDefault();
      const id = cartAction.getAttribute("data-id");
      const action = cartAction.getAttribute("data-cart-action");
      const item = window.cart.find(i => i.id === id);
      if (action === "inc") window.setCartQty(id, (item?.qty || 0) + 1);
      if (action === "dec") window.setCartQty(id, (item?.qty || 1) - 1);
      if (action === "remove") window.setCartQty(id, 0);
      return;
    }
  });

  const openCartBtn = document.getElementById("openCartBtn");
  const shopOpenCartBtn = document.getElementById("shopOpenCartBtn");
  const closeCartBtn = document.getElementById("closeCartBtn");
  const cartBackdrop = document.getElementById("cartBackdrop");
  const cartCheckoutBtn = document.getElementById("cartCheckoutBtn");
  const cartKeepShopping = document.getElementById("cartKeepShopping");
  const closeCheckoutBtn = document.getElementById("closeCheckoutBtn");
  const checkoutSuccessClose = document.getElementById("checkoutSuccessClose");
  const checkoutForm = document.getElementById("checkoutForm");
  const checkoutModal = document.getElementById("checkoutModal");

  if (openCartBtn) openCartBtn.addEventListener("click", () => window.openCartDrawer());
  if (shopOpenCartBtn) shopOpenCartBtn.addEventListener("click", () => window.openCartDrawer());
  if (closeCartBtn) closeCartBtn.addEventListener("click", () => window.closeCartDrawer());
  if (cartBackdrop) cartBackdrop.addEventListener("click", () => window.closeCartDrawer());
  if (cartCheckoutBtn) cartCheckoutBtn.addEventListener("click", () => window.openCheckout());
  if (cartKeepShopping) {
    cartKeepShopping.addEventListener("click", () => {
      window.closeCartDrawer();
    });
  }
  if (closeCheckoutBtn) closeCheckoutBtn.addEventListener("click", () => window.closeCheckout());
  if (checkoutSuccessClose) {
    checkoutSuccessClose.addEventListener("click", () => {
      window.closeCheckout();
      window.closeCartDrawer();
    });
  }
  if (checkoutModal) {
    checkoutModal.addEventListener("click", (e) => {
      if (e.target === checkoutModal) window.closeCheckout();
    });
  }

  if (checkoutForm) {
    checkoutForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById("checkoutSubmitBtn");
      const errEl = document.getElementById("checkoutError");
      if (!window.cart.length) {
        if (errEl) errEl.textContent = "Your cart is empty.";
        return;
      }

      const name = document.getElementById("checkoutName")?.value?.trim() || "";
      const email = document.getElementById("checkoutEmail")?.value?.trim() || "";
      const phone = document.getElementById("checkoutPhone")?.value?.trim() || "";
      const pickupWindow = document.getElementById("checkoutWhen")?.value || "First available";
      const notes = document.getElementById("checkoutNotes")?.value?.trim() || "";

      if (!name || !email || !phone) {
        if (errEl) errEl.textContent = "Name, email and mobile are required.";
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "PLACING ORDER…";
      }
      if (errEl) errEl.textContent = "";

      const items = window.cart.map(i => ({
        id: i.id,
        name: i.name,
        price: Number(i.price),
        qty: Number(i.qty),
        lineTotal: Number(i.price) * Number(i.qty)
      }));
      const total = cartSubtotal();
      const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const orderPayload = {
        id: orderId,
        name,
        email,
        phone,
        pickupWindow,
        notes,
        items,
        itemCount: cartCount(),
        total,
        currency: "AUD",
        fulfillment: "studio_pickup",
        payment: "pay_at_studio",
        status: "Pending",
        createdAt: new Date().toISOString(),
        userId: currentUser ? currentUser.uid : null,
        source: "website_shop"
      };

      // Open Messenger during click gesture for shop orders too
      try {
        window.__pendingMessengerWindow = window.open("about:blank", "dtt_messenger");
      } catch (_) {
        window.__pendingMessengerWindow = null;
      }

      try {
        await setDoc(doc(db, "orders", orderId), orderPayload);

        // Full order details (incl. email) → Messenger + email backup
        const orderText = formatOrderMessageForMessenger(orderPayload);
        try {
          await sendFormDataToMessenger(orderText, {
            win: window.__pendingMessengerWindow,
            open: true,
            ref: `order_${orderId}`
          });
        } catch (mErr) {
          console.warn("Order messenger handoff failed:", mErr);
        }
        try {
          await addDoc(collection(db, "mail"), {
            to: STUDIO_NOTIFY_EMAILS,
            message: {
              subject: `New shop pickup order — ${name} ($${Number(total).toFixed(2)})`,
              text: orderText
            },
            createdAt: new Date().toISOString(),
            type: "shop_order",
            orderId,
            messengerUrl: STUDIO_MESSENGER_URL,
            status: "pending"
          });
        } catch (mailErr) {
          console.warn("Order mail queue failed:", mailErr);
        }
        try {
          await fetch(`https://formsubmit.co/ajax/${STUDIO_NOTIFY_EMAILS[0]}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              _subject: `New shop pickup order — ${name}`,
              _template: "table",
              _captcha: "false",
              _replyto: email,
              _cc: STUDIO_NOTIFY_EMAILS.slice(1).join(","),
              name,
              email,
              phone,
              pickupWindow,
              notes,
              orderId,
              total,
              message: orderText,
              messenger: STUDIO_MESSENGER_URL
            })
          });
        } catch (_) { /* optional backup */ }

        // Vercel form webhook (shop / aftercare order)
        try {
          await postFormWebhook("order", {
            ...orderPayload,
            messenger: STUDIO_MESSENGER_URL
          });
        } catch (whErr) {
          console.warn("Vercel order webhook failed:", whErr);
        }

        if (typeof window.trackConversion === "function") {
          window.trackConversion("purchase", {
            transaction_id: orderId,
            value: total,
            currency: "AUD",
            items: items.length,
            notify: "facebook_messenger"
          });
        }

        // Clear cart
        window.cart = [];
        saveCartToStorage();
        updateCartUI();
        renderShopGrid(window.shopCatalog.length ? window.shopCatalog : defaultShopProducts);

        const formEl = document.getElementById("checkoutForm");
        const successEl = document.getElementById("checkoutSuccess");
        const msg = document.getElementById("checkoutSuccessMsg");
        const oid = document.getElementById("checkoutOrderId");
        if (formEl) formEl.hidden = true;
        if (successEl) successEl.hidden = false;
        if (msg) {
          msg.textContent = `Thanks ${name}. Order details (including ${email}) were prepared for Facebook Messenger. Paste into the chat if it opened.`;
        }
        if (oid) oid.textContent = `Order ref: ${orderId}`;
      } catch (err) {
        console.error("Order failed:", err);
        // Offline / rules fallback: still give local confirmation + save draft
        try {
          const drafts = JSON.parse(localStorage.getItem("dtt_order_drafts") || "[]");
          drafts.push(orderPayload);
          localStorage.setItem("dtt_order_drafts", JSON.stringify(drafts.slice(-20)));
        } catch { /* ignore */ }

        // If firestore create failed due to rules not deployed yet, show clear error but keep cart
        if (errEl) {
          errEl.textContent = err?.code === "permission-denied"
            ? "Order blocked by server permissions — please call (02) 4261 4311 or message us on Instagram."
            : ("Could not place order: " + (err.message || "try again"));
        }
        // Still allow recovery: if we saved draft, clear cart and show soft success
        if (err?.code !== "permission-denied") {
          // network errors already messaged
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Place pickup order";
        }
      }
    });
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // No intro animation — page is ready immediately
  document.body.classList.add('page-ready');

  // Mobile Hamburger Menu Toggle — open/close reliably
  const menuToggle = document.getElementById('menuToggleBtn');
  const navLinks = document.getElementById('navbarLinks');
  const navBackdrop = document.getElementById('navDrawerBackdrop');

  const setNavOpen = (open) => {
    if (!menuToggle || !navLinks) return;
    menuToggle.classList.toggle('open', open);
    navLinks.classList.toggle('open', open);
    document.body.classList.toggle('nav-open', open);
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (navBackdrop) {
      navBackdrop.classList.toggle('is-open', open);
      navBackdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
  };

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setNavOpen(!navLinks.classList.contains('open'));
    });

    if (navBackdrop) {
      navBackdrop.addEventListener('click', () => setNavOpen(false));
    }

    navLinks.querySelectorAll('a, button').forEach((el) => {
      el.addEventListener('click', () => setNavOpen(false));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navLinks.classList.contains('open')) {
        setNavOpen(false);
      }
    });

    // Ensure drawer starts closed
    setNavOpen(false);
  }

  // Hero Slider Functionality
  const sliderTitle = document.getElementById('sliderTitle');
  const sliderBgText = document.getElementById('sliderBgText');
  const sliderLocationTag = document.getElementById('sliderLocationTag');
  const sliderMainImg = document.getElementById('sliderMainImg');
  const sliderTeaserImg = document.getElementById('sliderTeaserImg');
  const sliderAction1 = document.getElementById('sliderAction1');
  const sliderAction2 = document.getElementById('sliderAction2');
  const sliderPrevBtn = document.getElementById('sliderPrevBtn');
  const sliderNextBtn = document.getElementById('sliderNextBtn');
  const sliderCurrentNum = document.getElementById('sliderCurrentNum');
  const sliderDotsContainer = document.getElementById('sliderDots');
  const sliderTeaserFrame = document.getElementById('sliderTeaserFrame');
  const homeHeader = document.getElementById('home');

  const heroSlides = [
    {
      title: "CUSTOM TATTOOS<br>BUILT TO LAST",
      bgText: "TATTOOS",
      mainImg: "assets/tattoo_model_main.png",
      teaserImg: "assets/tattoo_model_secondary.png",
      location: "Private studio · Dapto, Illawarra NSW",
      actionText1: "BOOK FREE CONSULTATION",
      actionText2: "SEE IT ON YOU",
      actionLink1: "#book",
      action2: "try-on"
    },
    {
      title: "FINE LINE<br>& REALISM",
      bgText: "FINE LINE",
      mainImg: "assets/portfolio/realism/realism_bear-wolf-landscape.jpg",
      teaserImg: "assets/portfolio/fineline/fineline_butterfly-florals.jpg",
      location: "Steven Benn & Scotty · Dapto",
      actionText1: "BOOK THIS STYLE",
      actionText2: "SEE IT ON YOU",
      actionLink1: "#book",
      action2: "try-on"
    },
    {
      title: "YOUR IDEA.<br>OUR CRAFT.",
      bgText: "CUSTOM",
      mainImg: "assets/portfolio/custom/custom_neotrad-oni.jpg",
      teaserImg: "assets/portfolio/custom/custom_japanese-pagoda.jpg",
      location: "Free consult · clear pricing",
      actionText1: "START CONSULTATION",
      actionText2: "TRY YOUR DESIGN",
      actionLink1: "#book",
      action2: "try-on"
    },
    {
      title: "PRIVATE.<br>HYGIENIC. PRECISE.",
      bgText: "STUDIO",
      mainImg: "assets/portfolio/realism/realism_joker-clown-faces.jpg",
      teaserImg: "assets/portfolio/blackgrey/blackgrey_skull-backpiece.jpg",
      location: "Appointment only · mornings",
      actionText1: "BOOK YOUR SESSION",
      actionText2: "SEE IT ON YOU",
      actionLink1: "#book",
      action2: "try-on"
    }
  ];

  let currentSlideIndex = 0;
  let isTransitioning = false;
  let sliderTimer = null;

  function initSlider() {
    if (!homeHeader) return;

    // Trigger initial slide reveal immediately (no intro loader)
    requestAnimationFrame(() => {
      homeHeader.classList.add('slide-in');
    });

    // Dot Navigation
    if (sliderDotsContainer) {
      sliderDotsContainer.querySelectorAll('.dot').forEach((dot, idx) => {
        dot.onclick = () => {
          if (idx !== currentSlideIndex) goToSlide(idx);
        };
      });
    }

    // Arrow Navigation
    if (sliderPrevBtn) {
      sliderPrevBtn.onclick = () => {
        let prevIdx = (currentSlideIndex - 1 + heroSlides.length) % heroSlides.length;
        goToSlide(prevIdx);
      };
    }
    if (sliderNextBtn) {
      sliderNextBtn.onclick = () => {
        let nextIdx = (currentSlideIndex + 1) % heroSlides.length;
        goToSlide(nextIdx);
      };
    }

    // Teaser Image Click to advance
    if (sliderTeaserFrame) {
      sliderTeaserFrame.onclick = () => {
        let nextIdx = (currentSlideIndex + 1) % heroSlides.length;
        goToSlide(nextIdx);
      };
    }

    // Start Auto rotation
    startAutoSlider();
  }

  function startAutoSlider() {
    stopAutoSlider();
    sliderTimer = setInterval(() => {
      if (!isTransitioning) {
        let nextIdx = (currentSlideIndex + 1) % heroSlides.length;
        goToSlide(nextIdx);
      }
    }, 7000);
  }

  function stopAutoSlider() {
    if (sliderTimer) clearInterval(sliderTimer);
  }

  function goToSlide(index) {
    if (isTransitioning || !homeHeader) return;
    isTransitioning = true;

    // Reset timer on manual interaction
    startAutoSlider();

    // Start slide-out animations
    homeHeader.classList.remove('slide-in');

    // Wait for slide-out transition (800ms matches CSS transition)
    setTimeout(() => {
      currentSlideIndex = index;
      const slide = heroSlides[currentSlideIndex];

      // Update content
      if (sliderTitle) sliderTitle.innerHTML = slide.title;
      if (sliderBgText) sliderBgText.textContent = slide.bgText;
      if (sliderLocationTag) sliderLocationTag.textContent = slide.location;
      if (sliderMainImg) sliderMainImg.src = slide.mainImg;
      if (sliderTeaserImg) sliderTeaserImg.src = slide.teaserImg;

      if (sliderAction1) {
        sliderAction1.textContent = slide.actionText1;
        if (sliderAction1.tagName === "A") sliderAction1.href = slide.actionLink1 || "#book";
      }
      if (sliderAction2) {
        sliderAction2.textContent = slide.actionText2 || "SEE IT ON YOU";
        // Secondary hero CTA opens try-on (button or link)
        sliderAction2.classList.add("open-try-on-btn");
        if (sliderAction2.tagName === "A") {
          sliderAction2.href = "#see-it-on-you";
        }
      }

      // Update counter
      if (sliderCurrentNum) {
        sliderCurrentNum.textContent = `0${currentSlideIndex + 1}`;
      }

      // Update dots active class
      if (sliderDotsContainer) {
        sliderDotsContainer.querySelectorAll('.dot').forEach((dot, idx) => {
          dot.classList.toggle('active', idx === currentSlideIndex);
        });
      }

      // Trigger slide-in animations
      homeHeader.classList.add('slide-in');

      setTimeout(() => {
        isTransitioning = false;
      }, 500);
    }, 800);
  }

  // Scroll effects for Navbar
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  }

  initSlider();


  // Scroll animations BOTH directions: re-trigger when scrolling up or down
  // (do not unobserve — keep watching enter/leave)
  const isNarrow = window.matchMedia("(max-width: 820px)").matches;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const setInView = (el, on) => {
    if (on) {
      el.classList.add("visible", "is-inview");
      // also reveal any delayed children in this section
      el.querySelectorAll(".reveal-on-scroll").forEach((child) => {
        child.classList.add("is-visible");
      });
    } else if (!reduceMotion) {
      el.classList.remove("visible", "is-inview");
      el.querySelectorAll(".reveal-on-scroll").forEach((child) => {
        child.classList.remove("is-visible");
      });
    }
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      setInView(entry.target, entry.isIntersecting);
    });
  }, {
    threshold: isNarrow ? [0, 0.08, 0.2] : [0, 0.12, 0.25],
    rootMargin: isNarrow ? "0px 0px -4% 0px" : "0px 0px -6% 0px"
  });

  const scrollAnimTargets = document.querySelectorAll(
    ".fade-in, .slide-up, .features-bar, .sterilization-bar, .journey-section, .section, .conversion-strip, .reviews-section, .social-feed-section, .book-section"
  );
  scrollAnimTargets.forEach((el) => observer.observe(el));

  // Initial paint: reveal what's already on screen
  const syncInView = () => {
    const vh = window.innerHeight || 1;
    scrollAnimTargets.forEach((el) => {
      const r = el.getBoundingClientRect();
      const on = r.top < vh * 0.92 && r.bottom > vh * 0.08;
      setInView(el, on);
    });
  };
  requestAnimationFrame(syncInView);
  window.addEventListener("resize", () => {
    requestAnimationFrame(syncInView);
  }, { passive: true });

  // Scroll progress + ambient journey motifs (smoke / guns / skulls / roses)
  // Journey motif animations disabled — keep scroll progress/motifs off the public site

  // Show curated specialties + portfolio + artists immediately (before Firebase responds)
  renderSpecialtiesGrid(defaultSpecialties);
  renderArtistsGrid(defaultArtists);
  dbPortfolio = defaultPortfolio;
  renderPortfolioGrid(dbPortfolio, activePortfolioFilter);
  initPortfolioFilters();
  initTattooTryOn();
  if (typeof window.initTryonHomeDemo === "function") window.initTryonHomeDemo();
  // Studio shop cart + catalogue (must work without login)
  if (typeof window.initShopCart === "function") window.initShopCart();
  if (typeof window.loadShopWebsite === "function") window.loadShopWebsite();

  // Dynamic Content Initial Loading
  loadDynamicContent().then(() => {
    if (typeof fetchCMSDataCache === 'function') {
      fetchCMSDataCache().then(() => {
        if (typeof handleRouting === 'function') handleRouting();
      });
    }
  });

  // Review Slider
  const slides = document.querySelectorAll('.review-slide');
  const prevBtn = document.getElementById('prevReview');
  const nextBtn = document.getElementById('nextReview');
  let currentSlide = 0;

  if (slides.length > 0) {
    const showSlide = (index) => {
      slides.forEach((slide, i) => {
        slide.style.display = i === index ? 'block' : 'none';
      });
    };

    prevBtn.onclick = () => {
      currentSlide = (currentSlide > 0) ? currentSlide - 1 : slides.length - 1;
      showSlide(currentSlide);
    };

    nextBtn.onclick = () => {
      currentSlide = (currentSlide < slides.length - 1) ? currentSlide + 1 : 0;
      showSlide(currentSlide);
    };
  }

  // Auth Modal Logic
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const portalBtn = document.getElementById('portalBtn');
  const modal = document.getElementById('loginModal');
  const closeBtn = document.querySelector('.close-modal');
  const authForm = document.getElementById('loginForm');
  const toggleModeBtn = document.getElementById('toggleAuthMode');
  const modalTitle = document.getElementById('modalTitle');
  const modalSubtitle = document.getElementById('modalSubtitle');
  const submitBtn = document.getElementById('authSubmitBtn');
  const errorText = document.getElementById('authError');

  let isLoginMode = true;

  loginBtn.onclick = () => {
    modal.style.display = "flex";
    errorText.textContent = "";
  }

  closeBtn.onclick = () => {
    modal.style.display = "none";
  }

  window.onclick = (event) => {
    if (event.target == modal) {
      modal.style.display = "none";
    }
  }

  toggleModeBtn.onclick = (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    errorText.textContent = "";

    if (isLoginMode) {
      modalTitle.textContent = "Welcome Back";
      modalSubtitle.textContent = "Access your client portal";
      submitBtn.textContent = "SIGN IN";
      document.getElementById('toggleAuthModeText').innerHTML = `Don't have an account? <a href="#" id="toggleAuthMode" style="color: var(--accent);">Register here</a>.`;
    } else {
      modalTitle.textContent = "Create Account";
      modalSubtitle.textContent = "Join the Diamond Tip family";
      submitBtn.textContent = "REGISTER";
      document.getElementById('toggleAuthModeText').innerHTML = `Already have an account? <a href="#" id="toggleAuthMode" style="color: var(--accent);">Sign in here</a>.`;
    }

    document.getElementById('toggleAuthMode').onclick = toggleModeBtn.onclick;
  }

  authForm.onsubmit = (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    submitBtn.disabled = true;
    submitBtn.textContent = "PLEASE WAIT...";
    errorText.textContent = "";

    if (isLoginMode) {
      signInWithEmailAndPassword(auth, email, password)
        .then(() => {
          modal.style.display = "none";
          authForm.reset();
        })
        .catch((error) => {
          errorText.textContent = error.message;
        })
        .finally(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = "SIGN IN";
        });
    } else {
      createUserWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
          modal.style.display = "none";
          authForm.reset();
          // Save client info to Firestore
          const user = userCredential.user;
          setDoc(doc(db, "clients", user.uid), {
            email: user.email,
            createdAt: new Date().toISOString()
          });
        })
        .catch((error) => {
          errorText.textContent = error.message;
        })
        .finally(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = "REGISTER";
        });
    }
  };

  // Google Sign-In Logic
  const googleAuthBtn = document.getElementById('googleAuthBtn');
  if (googleAuthBtn) {
    googleAuthBtn.onclick = () => {
      const provider = new GoogleAuthProvider();
      errorText.textContent = "";
      googleAuthBtn.disabled = true;
      googleAuthBtn.innerHTML = "Signing in...";
      signInWithPopup(auth, provider)
        .then(() => {
          modal.style.display = "none";
          authForm.reset();
        })
        .catch((error) => {
          errorText.textContent = error.message;
        })
        .finally(() => {
          googleAuthBtn.disabled = false;
          googleAuthBtn.innerHTML = `
                        <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                        </svg>
                        SIGN IN WITH GOOGLE
                    `;
        });
    };
  }

  logoutBtn.onclick = () => {
    signOut(auth).then(() => {
      exitPortal();
    });
  };

  // Client Skin Notes Save
  const saveSkinNotesBtn = document.getElementById('saveSkinNotesBtn');
  if (saveSkinNotesBtn) {
    saveSkinNotesBtn.onclick = saveSkinNotes;
  }

  // CMS Modal Close Buttons
  const closeBlogModalBtn = document.getElementById('closeBlogModalBtn');
  if (closeBlogModalBtn) closeBlogModalBtn.onclick = closeBlogModal;
  const closeBlogArticleBtn = document.getElementById('closeBlogArticleBtn');
  if (closeBlogArticleBtn) closeBlogArticleBtn.onclick = () => window.closeBlogArticle();
  const blogArticleModal = document.getElementById('blogArticleModal');
  if (blogArticleModal) {
    blogArticleModal.addEventListener('click', (e) => {
      if (e.target === blogArticleModal) window.closeBlogArticle();
    });
  }
  const blogArticleBookBtn = document.getElementById('blogArticleBookBtn');
  if (blogArticleBookBtn) {
    blogArticleBookBtn.addEventListener('click', () => window.closeBlogArticle());
  }
  const closeProductModalBtn = document.getElementById('closeProductModalBtn');
  if (closeProductModalBtn) closeProductModalBtn.onclick = closeProductModal;

  // CMS Save/Delete Actions
  const saveBlogItemBtn = document.getElementById('saveBlogItemBtn');
  if (saveBlogItemBtn) saveBlogItemBtn.onclick = saveBlogItem;
  const saveProductItemBtn = document.getElementById('saveProductItemBtn');
  if (saveProductItemBtn) saveProductItemBtn.onclick = saveProductItem;

  const deleteBlogBtn = document.getElementById('deleteBlogBtn');
  if (deleteBlogBtn) deleteBlogBtn.onclick = deleteBlogItem;
  const deleteProductBtn = document.getElementById('deleteProductBtn');
  if (deleteProductBtn) deleteProductBtn.onclick = deleteProductItem;

  // SEO Settings Actions
  const seoForm = document.getElementById('seoForm');
  if (seoForm) seoForm.onsubmit = saveSeoItem;
  const seoPageSelect = document.getElementById('seoPageSelect');
  if (seoPageSelect) seoPageSelect.onchange = loadSeoSettings;

  // Chat CRM reply bindings
  const chatCrmSendBtn = document.getElementById('chatCrmSendBtn');
  const chatCrmInput = document.getElementById('chatCrmMessageInput');
  if (chatCrmSendBtn && chatCrmInput) {
    chatCrmSendBtn.onclick = sendAdminReply;
    chatCrmInput.onkeypress = (e) => {
      if (e.key === 'Enter') sendAdminReply();
    };
  }

  // Public File Upload Handling
  const fileInput = document.getElementById('bookingFiles');
  const dropZone = document.getElementById('dropZone');
  const previewGrid = document.getElementById('filePreviewGrid');

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', (e) => {
      if (e.target !== fileInput) {
        fileInput.click();
      }
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--accent)';
      dropZone.style.background = 'rgba(181, 150, 93, 0.02)';
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        dropZone.style.borderColor = 'var(--border)';
        dropZone.style.background = 'rgba(255,255,255,0.01)';
      });
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files) {
        handleSelectedFiles(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files) {
        handleSelectedFiles(e.target.files);
      }
    });
  }

  function handleSelectedFiles(files) {
    const fileList = Array.from(files);
    const validFiles = fileList.filter(file => {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';
      const isValidSize = file.size <= 5 * 1024 * 1024; // 5MB
      return (isImage || isPdf) && isValidSize;
    });

    if (selectedBookingFiles.length + validFiles.length > 5) {
      alert("You can upload a maximum of 5 files.");
      return;
    }

    validFiles.forEach(file => {
      selectedBookingFiles.push(file);
      renderFilePreview(file);
    });
  }

  function renderFilePreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement('div');
      div.className = 'file-preview-item';

      let content = '';
      if (file.type.startsWith('image/')) {
        content = `<img src="${e.target.result}" alt="Preview">`;
      } else {
        content = `<span style="display:inline-flex;width:22px;height:22px;color:var(--accent);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:100%;height:100%;"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg></span><span style="font-size: 0.6rem; color: var(--text-secondary); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; display: block;">${file.name}</span>`;
      }

      div.innerHTML = `
                ${content}
                <button type="button" class="remove-file-btn">&times;</button>
            `;

      div.querySelector('.remove-file-btn').onclick = (event) => {
        event.stopPropagation();
        const index = selectedBookingFiles.indexOf(file);
        if (index > -1) {
          selectedBookingFiles.splice(index, 1);
        }
        div.remove();
      };

      previewGrid.appendChild(div);
    };
    reader.readAsDataURL(file);
  }

  // Booking Submission Logic
  const bookingForm = document.getElementById('bookingForm');
  const bookingSubmitBtn = document.getElementById('bookingSubmitBtn');
  const uploadProgressContainer = document.getElementById('uploadProgressContainer');
  const uploadProgressLabel = document.getElementById('uploadProgressLabel');
  const uploadProgressFill = document.getElementById('uploadProgressFill');

  if (bookingForm) {
    bookingForm.onsubmit = async (e) => {
      e.preventDefault();
      bookingSubmitBtn.disabled = true;
      bookingSubmitBtn.textContent = "SUBMITTING...";

      const name = document.getElementById('bookingName').value;
      const email = document.getElementById('bookingEmail').value;
      const phone = document.getElementById('bookingPhone').value;
      const date = document.getElementById('bookingDate').value;
      const time = document.getElementById('bookingTime').value;
      const style = document.getElementById('bookingStyle').value;
      const idea = document.getElementById('bookingIdea').value;
      const preferredArtist = document.getElementById('bookingArtist')?.value || "Either / No preference";

      if (!date || !time) {
        alert("Please select a preferred date and available time slot on the calendar.");
        bookingSubmitBtn.disabled = false;
        bookingSubmitBtn.textContent = "REQUEST FREE CONSULTATION";
        return;
      }

      // Open Messenger tab immediately (must be in user gesture) so form data can be pasted/sent
      try {
        window.__pendingMessengerWindow = window.open("about:blank", "dtt_messenger");
      } catch (_) {
        window.__pendingMessengerWindow = null;
      }

      try {
        // 1. Create a Booking ID first
        const bookingRef = doc(collection(db, "bookings"));
        const bookingId = bookingRef.id;

        const uploadedUrls = [];
        let tryOnImageUrl = null;
        let hasTryOn = false;

        uploadProgressContainer.style.display = 'block';
        uploadProgressLabel.textContent = 'Preparing booking files...';
        uploadProgressFill.style.width = '5%';

        // Attach try-on / AI preview — upload data URLs to Storage (not raw base64 in Firestore)
        if (aiGeneratedTattooUrl) {
          hasTryOn = true;
          try {
            uploadProgressLabel.textContent = 'Uploading try-on preview...';
            tryOnImageUrl = await uploadDataUrlOrBlobToStorage(
              aiGeneratedTattooUrl,
              `bookings/${bookingId}/try-on-preview-${Date.now()}.png`
            );
            uploadedUrls.push(tryOnImageUrl);
            uploadProgressFill.style.width = '25%';
          } catch (upErr) {
            console.warn("Try-on upload failed, keeping inline if small:", upErr);
            // Only store data URL if short enough; otherwise skip image but keep meta
            if (String(aiGeneratedTattooUrl).length < 900000) {
              uploadedUrls.push(aiGeneratedTattooUrl);
            }
          }
        }

        // 2. Upload Reference Images to Storage
        if (selectedBookingFiles.length > 0) {
          let totalBytes = selectedBookingFiles.reduce((acc, f) => acc + f.size, 0) || 1;
          let uploadedBytes = 0;

          for (let i = 0; i < selectedBookingFiles.length; i++) {
            const file = selectedBookingFiles[i];
            const fileRef = ref(storage, `bookings/${bookingId}/${Date.now()}_${file.name}`);

            const uploadTask = uploadBytesResumable(fileRef, file);

            await new Promise((resolve, reject) => {
              let lastTransferred = 0;
              uploadTask.on('state_changed',
                (snapshot) => {
                  const delta = snapshot.bytesTransferred - lastTransferred;
                  lastTransferred = snapshot.bytesTransferred;
                  uploadedBytes += delta;
                  const percent = 25 + Math.min(Math.round((uploadedBytes / totalBytes) * 65), 65);
                  uploadProgressLabel.textContent = `Uploading references... ${percent}%`;
                  uploadProgressFill.style.width = `${percent}%`;
                },
                (error) => reject(error),
                () => {
                  getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                    uploadedUrls.push(downloadURL);
                    resolve();
                  });
                }
              );
            });
          }

          uploadProgressLabel.textContent = `Upload complete!`;
          uploadProgressFill.style.width = `100%`;
        } else {
          uploadProgressFill.style.width = '90%';
        }

        // Build CRM try-on payload
        const tryOnPayload = (hasTryOn || tryOnMeta) ? {
          ...(tryOnMeta || {}),
          previewUrl: tryOnImageUrl || (uploadedUrls[0] || null),
          prompt: aiGeneratedTattooPrompt || tryOnMeta?.notes || null,
          attachedAt: new Date().toISOString()
        } : null;

        const source = hasTryOn || tryOnMeta
          ? "website_try_on_booking"
          : "website_booking_form";

        // 3. Save booking details to Firestore (CRM)
        const bookingData = {
          id: bookingId,
          name,
          email,
          phone,
          date,
          time,
          style,
          idea,
          preferredArtist,
          referenceImages: uploadedUrls,
          tryOn: tryOnPayload,
          tryOnPreviewUrl: tryOnImageUrl || null,
          createdAt: new Date().toISOString(),
          status: "Pending",
          assignedArtist: preferredArtist && preferredArtist !== "Either / No preference" ? preferredArtist : "Unassigned",
          internalNotes: [
            preferredArtist ? `Client preferred: ${preferredArtist}` : "",
            tryOnPayload ? `Try-on attached (${tryOnPayload.placementLabel || tryOnPayload.placement || "custom"})` : ""
          ].filter(Boolean).join(" · "),
          userId: currentUser ? currentUser.uid : null,
          source,
          channel: "website",
          type: "consultation_request"
        };

        await setDoc(bookingRef, bookingData);
        uploadProgressLabel.textContent = 'Saving to CRM & notifying studio...';
        uploadProgressFill.style.width = '95%';

        // Messenger (primary) + email + CRM notify
        try {
          uploadProgressLabel.textContent = "Sending to Facebook Messenger…";
          await notifyStudioOfBooking(bookingData, {
            messengerWin: window.__pendingMessengerWindow,
            openMessenger: true
          });
        } catch (notifyErr) {
          console.warn("Studio notify failed:", notifyErr);
          // Still try to open Messenger with a basic message
          try {
            const fallbackText = formatBookingMessageForMessenger(bookingData);
            await sendFormDataToMessenger(fallbackText, {
              win: window.__pendingMessengerWindow,
              open: true
            });
            updateMessengerSuccessUI({ copied: true, text: fallbackText });
          } catch (_) { /* ignore */ }
        }
        uploadProgressFill.style.width = '100%';

        // Conversion tracking (GA4 / Meta if loaded)
        if (typeof window.trackConversion === "function") {
          window.trackConversion("booking_request", {
            style,
            preferredArtist,
            has_refs: uploadedUrls.length > 0,
            has_try_on: !!tryOnPayload,
            source,
            notify: "facebook_messenger"
          });
        }

        // Success State — in-page confirmation + Messenger handoff
        bookingForm.reset();
        bookingForm.hidden = true;
        const successEl = document.getElementById("bookingSuccess");
        if (successEl) {
          successEl.hidden = false;
          const emailEl = document.getElementById("messengerClientEmail");
          if (emailEl) emailEl.textContent = email || "—";
          successEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } else {
          alert("Thank you! Your consultation request was saved. Open Facebook Messenger to send your details to the studio.");
        }
        selectedBookingFiles = [];
        const previewGrid = document.getElementById('filePreviewGrid');
        if (previewGrid) previewGrid.innerHTML = '';
        uploadProgressContainer.style.display = 'none';

        // Reset AI attachment reference UI
        aiGeneratedTattooUrl = null;
        aiGeneratedTattooPrompt = null;
        const aiContainer = document.getElementById('aiBookingAttachmentContainer');
        if (aiContainer) aiContainer.style.display = 'none';

        // Reset calendar states
        selectedPubDate = null;
        selectedPubTime = null;
        renderPublicBookingCalendar();
        const pubTimeSlotsContainer = document.getElementById('pubTimeSlotsContainer');
        if (pubTimeSlotsContainer) pubTimeSlotsContainer.style.display = 'none';

        if (currentUser) {
          loadClientBookings();
        }

      } catch (err) {
        console.error("Booking submission failed: ", err);
        // Close unused messenger placeholder tab
        try {
          if (window.__pendingMessengerWindow && !window.__pendingMessengerWindow.closed) {
            window.__pendingMessengerWindow.close();
          }
        } catch (_) { /* ignore */ }
        window.__pendingMessengerWindow = null;
        alert("Failed to submit booking: " + err.message);
      } finally {
        bookingSubmitBtn.disabled = false;
        bookingSubmitBtn.textContent = "REQUEST FREE CONSULTATION";
      }
    };
  }

  // Portal Navigation Switches
  portalBtn.onclick = () => {
    enterPortal();
  };

  const closePortalBtn = document.getElementById('closePortalBtn');
  if (closePortalBtn) {
    closePortalBtn.onclick = () => {
      exitPortal();
    };
  }

  // Tab Links
  const linkMyBookings = document.getElementById('linkMyBookings');
  const linkCalendarCRM = document.getElementById('linkCalendarCRM');
  const linkCMS = document.getElementById('linkCMS');

  if (linkMyBookings) linkMyBookings.onclick = (e) => { e.preventDefault(); switchPortalTab('my-bookings'); };
  if (linkCalendarCRM) linkCalendarCRM.onclick = (e) => { e.preventDefault(); switchPortalTab('calendar-crm'); };
  if (linkCMS) linkCMS.onclick = (e) => { e.preventDefault(); switchPortalTab('cms'); };

  // Booking Details Modal Closers
  const closeBookingModalBtn = document.getElementById('closeBookingModalBtn');
  if (closeBookingModalBtn) {
    closeBookingModalBtn.onclick = () => {
      closeBookingModal();
    };
  }

  // FAQ Modal Closers
  const closeFaqModalBtn = document.getElementById('closeFaqModalBtn');
  if (closeFaqModalBtn) {
    closeFaqModalBtn.onclick = () => {
      closeFaqModal();
    };
  }

  const cmsAddFaqBtn = document.getElementById('cmsAddFaqBtn');
  if (cmsAddFaqBtn) {
    cmsAddFaqBtn.onclick = () => {
      openFaqModal();
    };
  }

  // CRM Actions
  const saveBookingDetailsBtn = document.getElementById('saveBookingDetailsBtn');
  if (saveBookingDetailsBtn) {
    saveBookingDetailsBtn.onclick = () => {
      saveBookingDetails();
    };
  }

  const saveFaqItemBtn = document.getElementById('saveFaqItemBtn');
  if (saveFaqItemBtn) {
    saveFaqItemBtn.onclick = () => {
      saveFaqItem();
    };
  }

  // Calendar navigation
  const prevMonthBtn = document.getElementById('prevMonthBtn');
  const nextMonthBtn = document.getElementById('nextMonthBtn');
  if (prevMonthBtn && nextMonthBtn) {
    prevMonthBtn.onclick = () => {
      currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
      renderCRMCalendar();
    };
    nextMonthBtn.onclick = () => {
      currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
      renderCRMCalendar();
    };
  }

  // Booking Search & Filtering
  const searchInput = document.getElementById('bookingSearchInput');
  const statusFilter = document.getElementById('bookingFilterStatus');

  if (searchInput) {
    searchInput.oninput = () => filterCRMTable();
  }
  if (statusFilter) {
    statusFilter.onchange = () => filterCRMTable();
  }

  // CMS Portfolio upload
  const cmsPortfolioFileInput = document.getElementById('cmsPortfolioFile');
  if (cmsPortfolioFileInput) {
    cmsPortfolioFileInput.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        uploadCMSPortfolioImage(e.target.files[0]);
      }
    };
  }

  // Initialize public booking calendar
  initPublicBookingCalendar();
});

// Authentication Handling
onAuthStateChanged(auth, async (user) => {
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const portalBtn = document.getElementById('portalBtn');

  if (user) {
    currentUser = user;
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'block';
    portalBtn.style.display = 'block';

    // 1. Authorize role: check hardcoded admins or admins collection
    try {
      const adminDoc = await getDoc(doc(db, "admins", user.email.toLowerCase()));
      // Super admins (hardcoded) + any email listed under /admins
      if (adminDoc.exists() || SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
        isAdmin = true;
        document.getElementById('adminBadge').style.display = 'inline-block';
        document.getElementById('adminPortalNav').style.display = 'block';
        document.getElementById('portalTitle').textContent = 'Studio CRM & Manager';

        // Seed database if this is an admin and database is empty
        seedDatabaseIfNeeded();

        // Load CRM & CMS Data
        listenToAllBookings();
        fetchCMSDataCache();
      } else {
        isAdmin = false;
        document.getElementById('adminBadge').style.display = 'none';
        document.getElementById('adminPortalNav').style.display = 'none';
        document.getElementById('portalTitle').textContent = 'Client Portal';

        loadClientBookings();
      }
    } catch (err) {
      console.error("Authorization check failed: ", err);
      // Fallback to normal client
      isAdmin = false;
      document.getElementById('adminBadge').style.display = 'none';
      document.getElementById('adminPortalNav').style.display = 'none';
      document.getElementById('portalTitle').textContent = 'Client Portal';
      loadClientBookings();
    }

    setupGiftCardForm();
    loadClientGiftCards();
    loadClientSkinNotes();
    setupLiveChat();
  } else {
    currentUser = null;
    isAdmin = false;
    loginBtn.style.display = 'block';
    logoutBtn.style.display = 'none';
    portalBtn.style.display = 'none';
    document.getElementById('adminBadge').style.display = 'none';
    document.getElementById('adminPortalNav').style.display = 'none';
    setupLiveChat();
  }

  loadBlogWebsite();
  loadShopWebsite();
  if (typeof window.initFacebookFeed === "function") window.initFacebookFeed();
  handleRouting();
});

// Portal View Manager
function enterPortal() {
  // Hide standard site sections
  document.getElementById('home').style.display = 'none';
  document.getElementById('specialties').style.display = 'none';
  document.getElementById('artists').style.display = 'none';
  document.getElementById('portfolio').style.display = 'none';
  document.getElementById('process').style.display = 'none';
  const blogEl = document.getElementById('blog');
  if (blogEl) blogEl.style.display = 'none';
  const shopEl = document.getElementById('shop');
  if (shopEl) shopEl.style.display = 'none';
  const findUsEl = document.getElementById('find-us');
  if (findUsEl) findUsEl.style.display = 'none';
  const tryonHome = document.getElementById('see-it-on-you');
  if (tryonHome) tryonHome.style.display = 'none';
  const awardsEl = document.getElementById('awards');
  if (awardsEl) awardsEl.style.display = 'none';
  const socialEl = document.getElementById('social');
  if (socialEl) socialEl.style.display = 'none';
  const bookEl = document.getElementById('book');
  if (bookEl) bookEl.style.display = 'none';
  document.getElementById('info').style.display = 'none';
  document.querySelector('footer').style.display = 'none';
  document.querySelector('.features-bar').style.display = 'none';
  document.querySelector('.sterilization-bar').style.display = 'none';

  // Keep site navbar visible (portal has its own back control)
  // Do not hide navLinks with display:none — it breaks the mobile drawer permanently

  // Show Portal
  document.getElementById('portalSection').style.display = 'block';

  // Default tab
  switchPortalTab('my-bookings');
}

function exitPortal() {
  // Show standard site sections
  document.getElementById('home').style.display = '';
  document.getElementById('specialties').style.display = '';
  document.getElementById('artists').style.display = '';
  document.getElementById('portfolio').style.display = '';
  document.getElementById('process').style.display = '';
  const blogEl = document.getElementById('blog');
  if (blogEl) blogEl.style.display = '';
  const shopEl = document.getElementById('shop');
  if (shopEl) shopEl.style.display = '';
  const findUsEl = document.getElementById('find-us');
  if (findUsEl) findUsEl.style.display = '';
  const tryonHome = document.getElementById('see-it-on-you');
  if (tryonHome) tryonHome.style.display = '';
  const awardsEl = document.getElementById('awards');
  if (awardsEl) awardsEl.style.display = '';
  const socialEl = document.getElementById('social');
  if (socialEl) socialEl.style.display = '';
  const bookEl = document.getElementById('book');
  if (bookEl) bookEl.style.display = '';
  document.getElementById('info').style.display = '';
  document.querySelector('footer').style.display = '';
  document.querySelector('.features-bar').style.display = '';
  document.querySelector('.sterilization-bar').style.display = '';

  // Restore drawer styles if anything left inline
  const navLinks = document.getElementById('navbarLinks');
  if (navLinks) {
    navLinks.style.display = '';
    navLinks.classList.remove('open');
  }
  const bookNavBtn = document.getElementById('bookNavBtn');
  if (bookNavBtn) bookNavBtn.style.display = '';
  document.body.classList.remove('nav-open');
  const menuToggle = document.getElementById('menuToggleBtn');
  if (menuToggle) menuToggle.classList.remove('open');
  const navBackdrop = document.getElementById('navDrawerBackdrop');
  if (navBackdrop) navBackdrop.classList.remove('is-open');

  // Hide Portal
  document.getElementById('portalSection').style.display = 'none';
}

window.switchPortalTab = function (tabId) {
  const navItems = document.querySelectorAll('.portal-nav li');
  navItems.forEach(item => {
    item.className = '';
    item.style.borderLeft = '2px solid transparent';
    const a = item.querySelector('a');
    if (a) a.style.color = 'var(--text-secondary)';
  });

  const tabs = document.querySelectorAll('.portal-tab-content');
  tabs.forEach(tab => tab.style.display = 'none');

  let activeNavLi = null;
  let activeTabDiv = null;

  if (tabId === 'my-bookings') {
    activeNavLi = document.getElementById('navMyBookings');
    activeTabDiv = document.getElementById('tabMyBookings');
    if (currentUser) {
      if (isAdmin) {
        loadAllBookingsListForAdminSelf();
      } else {
        loadClientBookings();
      }
    }
  } else if (tabId === 'my-notes') {
    activeNavLi = document.getElementById('navMyNotes');
    activeTabDiv = document.getElementById('tabMyNotes');
    loadClientSkinNotes();
  } else if (tabId === 'tattoo-generator') {
    activeNavLi = document.getElementById('navTattooGenerator');
    activeTabDiv = document.getElementById('tabTattooGenerator');
    initAiTattooStudio();
  } else if (tabId === 'calendar-crm') {
    activeNavLi = document.getElementById('navCalendarCRM');
    activeTabDiv = document.getElementById('tabCalendarCRM');
    renderCRMCalendar();
    renderCRMTable();
  } else if (tabId === 'client-database') {
    activeNavLi = document.getElementById('navClientDatabase');
    activeTabDiv = document.getElementById('tabClientDatabase');
    loadClientDatabase();
  } else if (tabId === 'chat-crm') {
    activeNavLi = document.getElementById('navChatCRM');
    activeTabDiv = document.getElementById('tabChatCRM');
    loadChatCrm();
  }

  if (activeNavLi) {
    activeNavLi.className = 'active';
    activeNavLi.style.borderLeft = '2px solid var(--accent)';
    const a = activeNavLi.querySelector('a');
    if (a) a.style.color = 'var(--text-primary)';
  }
  if (activeTabDiv) {
    activeTabDiv.style.display = 'block';
  }
}

// Database Seeding Logic
async function seedDatabaseIfNeeded() {
  try {
    const specRef = doc(db, "content", "specialties");
    const specSnap = await getDoc(specRef);

    // Keep specialties + portfolio on curated tattoo assets even if CMS was seeded earlier
    if (specSnap.exists()) {
      const existing = specSnap.data().items || [];
      const needsSpecialtyRefresh = !existing.some(s =>
        typeof (s.image || s.src) === "string" &&
        ((s.image || s.src).includes("assets/specialties/") || (s.image || s.src).includes("assets/portfolio/"))
      );
      if (needsSpecialtyRefresh) {
        console.log("Refreshing specialties with curated tattoo covers...");
        await setDoc(doc(db, "content", "specialties"), { items: defaultSpecialties });
      }
    }

    const portfolioRef = doc(db, "content", "portfolio");
    const portfolioSnap = await getDoc(portfolioRef);
    if (portfolioSnap.exists()) {
      const items = portfolioSnap.data().items || [];
      if (!portfolioHasCuratedWork(items)) {
        console.log("Refreshing portfolio with curated tattoo work...");
        await setDoc(doc(db, "content", "portfolio"), { items: defaultPortfolio });
      }
    }

    if (!specSnap.exists()) {
      console.log("Seeding database with default template content...");

      // Seed Specialties
      await setDoc(doc(db, "content", "specialties"), { items: defaultSpecialties });

      // Seed Artists
      await setDoc(doc(db, "content", "artists"), { items: defaultArtists });

      // Seed Portfolio
      await setDoc(doc(db, "content", "portfolio"), { items: defaultPortfolio });

      // Seed FAQs
      await setDoc(doc(db, "content", "faqs"), { items: defaultFaqs });

      // Seed super admin emails
      await setDoc(doc(db, "admins", "stormychaseforrester@gmail.com"), {
        role: "super_admin",
        email: "stormychaseforrester@gmail.com"
      });
      await setDoc(doc(db, "admins", "hello@techaidaustralia.com.au"), {
        role: "super_admin",
        email: "hello@techaidaustralia.com.au"
      });

      // Seed Default Blogs (real studio photography)
      const defaultBlogs = [
        {
          title: "Aftercare: How to Heal Your Tattoo Perfectly",
          author: "Steven Benn",
          image: "assets/brand/blog-aftercare.jpg",
          content: "Taking care of your new tattoo is just as important as the tattooing process itself. Keep it clean, use premium vegan aftercare cream, avoid long soaking in water, and protect it from direct sunlight. Your skin notes are valuable here!",
          createdAt: new Date().toISOString()
        },
        {
          title: "Tattoo Placements: Finding the Perfect Spot",
          author: "Scotty",
          image: "assets/brand/blog-placement.jpg",
          content: "Tattoo placement can make or break a design. Fine line work looks gorgeous on wrists and collarbones, whereas large realism designs require larger canvases like sleeves or chests. Let's consult and design something custom.",
          createdAt: new Date().toISOString()
        }
      ];
      for (const b of defaultBlogs) {
        await setDoc(doc(db, "blogs", `blog_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`), b);
      }

      // Seed Default Products (aftercare / chemist-style studio shop)
      for (const p of defaultShopProducts) {
        await setDoc(doc(db, "products", p.id || `product_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`), {
          name: p.name,
          price: p.price,
          image: p.image,
          description: p.description
        });
      }

      // Seed Default SEO
      const defaultSeo = {
        home: {
          title: "Diamond Tip Tattoo | Private Tattoo Studio Dapto",
          description: "Private tattoo studio for custom work of uncompromising quality. Fine art on skin, crafted to last a lifetime in Dapto.",
          keywords: "tattoo, Dapto, fine line, realism, custom design"
        },
        portal: {
          title: "Client Portal | Diamond Tip Tattoo",
          description: "Manage bookings, skin notes, live chat and buy gift cards.",
          keywords: "crm, bookings, client notes, gift cards"
        }
      };
      await setDoc(doc(db, "content", "seo"), defaultSeo);

      console.log("Seeding completed successfully.");
      loadDynamicContent();
    }
  } catch (err) {
    console.error("Error during database seeding: ", err);
  }
}

// Load Content dynamically on Landing Page
async function loadDynamicContent() {
  try {
    // 1. Specialties — always show curated tattoo covers for the 4 style cards
    const specialtiesSnap = await getDoc(doc(db, "content", "specialties"));
    const cmsSpecialties = specialtiesSnap.exists() ? specialtiesSnap.data().items : null;
    const specialties = resolveSpecialties(cmsSpecialties);
    renderSpecialtiesGrid(specialties);

    // 2. Artists — always prefer real studio roster (Steven + Scotty)
    const artistsSnap = await getDoc(doc(db, "content", "artists"));
    const cmsArtists = artistsSnap.exists() ? artistsSnap.data().items : null;
    const artists = artistsAreCurated(cmsArtists) ? cmsArtists : defaultArtists;
    renderArtistsGrid(artists);
    // Refresh CMS artists if still on placeholder roster
    if (!artistsAreCurated(cmsArtists)) {
      try {
        await setDoc(doc(db, "content", "artists"), { items: defaultArtists });
      } catch (e) {
        console.warn("Could not refresh artists doc:", e);
      }
    }

    // 3. Portfolio — prefer curated local tattoo work when CMS still has placeholders
    const portfolioSnap = await getDoc(doc(db, "content", "portfolio"));
    const cmsPortfolio = portfolioSnap.exists() ? portfolioSnap.data().items : null;
    dbPortfolio = portfolioHasCuratedWork(cmsPortfolio) ? cmsPortfolio : defaultPortfolio;
    renderPortfolioGrid(dbPortfolio, activePortfolioFilter);
    initPortfolioFilters();

    // 4. FAQs
    const faqsSnap = await getDoc(doc(db, "content", "faqs"));
    const faqs = faqsSnap.exists() ? faqsSnap.data().items : defaultFaqs;
    dbFaqs = faqs;
    const faqAccordion = document.getElementById('faqAccordion');
    if (faqAccordion) {
      faqAccordion.innerHTML = faqs.map(faq => `
                <div class="acc-item">
                    <button class="acc-btn">${faq.question} <span>+</span></button>
                    <div class="acc-content"><p>${faq.answer}</p></div>
                </div>
            `).join('');

      // Re-apply Accordion click listeners
      const accBtns = faqAccordion.querySelectorAll('.acc-btn');
      accBtns.forEach(btn => {
        btn.onclick = function () {
          this.classList.toggle('active');
          const content = this.nextElementSibling;
          if (content.style.maxHeight) {
            content.style.maxHeight = null;
            this.querySelector('span').textContent = '+';
          } else {
            content.style.maxHeight = content.scrollHeight + "px";
            this.querySelector('span').textContent = '-';
          }
        };
      });
    }

    // Trigger blog and shop website loading
    loadBlogWebsite();
    loadShopWebsite();
  } catch (err) {
    console.error("Error loading dynamic content: ", err);
  }
}

// Client Side Bookings Fetch
async function loadClientBookings() {
  const listContainer = document.getElementById('clientBookingsList');
  if (!listContainer) return;

  try {
    const qBookings = query(
      collection(db, "bookings"),
      where("email", "==", currentUser.email)
    );
    const querySnapshot = await getDocs(qBookings);

    const bookings = [];
    querySnapshot.forEach(docSnap => {
      bookings.push(docSnap.data());
    });

    bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (bookings.length === 0) {
      listContainer.innerHTML = `<p style="color: var(--text-secondary);">You have not submitted any consultation requests yet.</p>`;
      return;
    }

    listContainer.innerHTML = bookings.map(b => `
            <div class="box-inner" style="border: 1px solid var(--border); padding: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; background: rgba(255,255,255,0.01);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                    <h4 style="color: var(--accent); font-family: var(--font-display); font-size: 1.05rem;">${b.style.toUpperCase()}</h4>
                    <span class="badge badge-status ${b.status.toLowerCase()}">${b.status}</span>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">
                    <span><strong>Preferred Date:</strong> ${b.date || 'Flexible'}</span> | 
                    <span><strong>Artist:</strong> ${b.assignedArtist || 'Unassigned'}</span>
                </div>
                <p style="font-size: 0.9rem; margin-top: 0.5rem; white-space: pre-wrap; line-height: 1.4;">${b.idea}</p>
                ${b.referenceImages && b.referenceImages.length > 0 ? `
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); gap: 0.5rem; margin-top: 0.5rem;">
                        ${b.referenceImages.map(img => `<img src="${img}" style="width: 60px; height: 60px; object-fit: cover; border: 1px solid var(--border); cursor: pointer;" onclick="window.open('${img}', '_blank')">`).join('')}
                    </div>
                ` : ''}
                ${b.internalNotes ? `
                    <div style="background: rgba(181, 150, 93, 0.05); padding: 0.75rem; border: 1px solid var(--border); font-size: 0.85rem; margin-top: 0.5rem;">
                        <strong>Artist Note:</strong> ${b.internalNotes}
                    </div>
                ` : ''}
            </div>
        `).join('');

  } catch (err) {
    console.error("Failed to load client bookings: ", err);
  }
}

// Admin Self List (My Bookings tab for admins lists all active bookings)
function loadAllBookingsListForAdminSelf() {
  const listContainer = document.getElementById('clientBookingsList');
  if (!listContainer) return;

  if (dbBookings.length === 0) {
    listContainer.innerHTML = `<p style="color: var(--text-secondary);">No booking requests are currently in the system.</p>`;
    return;
  }

  listContainer.innerHTML = dbBookings.map(b => `
        <div class="box-inner crm-booking-item" onclick="openBookingModal('${b.id}')" style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                <h4 style="font-family: var(--font-display); color: #fff;">${b.name.toUpperCase()}</h4>
                <span class="badge badge-status ${b.status.toLowerCase()}">${b.status}</span>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">
                <span><strong>Email:</strong> ${b.email}</span> | 
                <span><strong>Style:</strong> ${b.style}</span> |
                <span><strong>Date:</strong> ${b.date || 'Flexible'}</span>
            </div>
            <p style="font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.25rem;">${b.idea}</p>
        </div>
    `).join('');
}

// Admin CRM Realtime Listener
function listenToAllBookings() {
  const q = query(collection(db, "bookings"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    dbBookings = [];
    snapshot.forEach((docSnap) => {
      dbBookings.push(docSnap.data());
    });

    // Trigger UI updates
    if (document.getElementById('portalSection').style.display === 'block') {
      const activeTab = document.querySelector('.portal-tab-content.active');
      if (activeTab.id === 'tabMyBookings') {
        loadAllBookingsListForAdminSelf();
      } else if (activeTab.id === 'tabCalendarCRM') {
        renderCRMCalendar();
        renderCRMTable();
      }
    }
  });
}

// CRM Calendar Generator
let currentCalendarDate = new Date();
let selectedCalendarDay = null;

function renderCRMCalendar() {
  const calendarMonthYear = document.getElementById('calendarMonthYear');
  const calendarDaysGrid = document.getElementById('calendarDaysGrid');
  if (!calendarMonthYear || !calendarDaysGrid) return;

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  // Month label
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  calendarMonthYear.textContent = `${months[month]} ${year}`;

  // Get dates
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let gridHtml = '';

  // Empty cells before start of month
  for (let i = 0; i < firstDay; i++) {
    gridHtml += `<div class="day-cell empty"></div>`;
  }

  // Days grid
  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Find if bookings exist on this day
    const dayBookings = dbBookings.filter(b => b.date === dateString);

    let cellClasses = 'day-cell';
    if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === day) {
      cellClasses += ' today';
    }
    if (selectedCalendarDay === dateString) {
      cellClasses += ' selected';
    }

    gridHtml += `
            <div class="${cellClasses}" onclick="selectCalendarDate('${dateString}')">
                <span class="day-num">${day}</span>
                ${dayBookings.length > 0 ? `<div class="day-indicator"></div>` : ''}
            </div>
        `;
  }

  calendarDaysGrid.innerHTML = gridHtml;

  // Update the drawer bookings list for selected day
  if (selectedCalendarDay) {
    renderDayDrawerBookings(selectedCalendarDay);
  }
}

window.selectCalendarDate = function (dateString) {
  selectedCalendarDay = dateString;
  renderCRMCalendar();
}

function renderDayDrawerBookings(dateString) {
  const dayBookingsList = document.getElementById('dayBookingsList');
  const selectedDayLabel = document.getElementById('selectedDayLabel');
  if (!dayBookingsList) return;

  // Parse nice date label
  const dateObj = new Date(dateString);
  selectedDayLabel.textContent = `Bookings: ${dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;

  const dayBookings = dbBookings.filter(b => b.date === dateString);

  if (dayBookings.length === 0) {
    dayBookingsList.innerHTML = `<p style="color: var(--text-secondary); margin-top: 1rem;">No bookings scheduled for this date.</p>`;
    return;
  }

  dayBookingsList.innerHTML = dayBookings.map(b => `
        <div class="box-inner crm-booking-item" onclick="openBookingModal('${b.id}')" style="display: flex; flex-direction: column; gap: 0.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="color: #fff; font-size: 0.9rem;">${b.name}</strong>
                <span class="badge badge-status ${b.status.toLowerCase()}" style="font-size: 0.65rem; padding: 0.1rem 0.3rem;">${b.status}</span>
            </div>
            <span style="font-size: 0.75rem; color: var(--text-secondary);">${b.style} | ${b.assignedArtist}</span>
        </div>
    `).join('');
}

// CRM Bookings Table Render
function renderCRMTable(bookingsToRender = dbBookings) {
  const tableBody = document.getElementById('crmBookingsTableBody');
  if (!tableBody) return;

  if (bookingsToRender.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 2rem;">No bookings match the filters.</td></tr>`;
    return;
  }

  tableBody.innerHTML = bookingsToRender.map(b => `
        <tr style="cursor: pointer;" onclick="openBookingModal('${b.id}')">
            <td style="padding: 1rem 0.5rem;">
                <strong style="color: #fff; display: block;">${b.name}</strong>
                <span style="font-size: 0.8rem; color: var(--text-secondary);">${b.email}</span>
            </td>
            <td style="padding: 1rem 0.5rem; font-size: 0.85rem;">${b.style}</td>
            <td style="padding: 1rem 0.5rem; font-size: 0.85rem;">${b.date || 'Flexible'}</td>
            <td style="padding: 1rem 0.5rem;">
                <span class="badge badge-status ${b.status.toLowerCase()}">${b.status}</span>
            </td>
            <td style="padding: 1rem 0.5rem; font-size: 0.85rem;">${b.assignedArtist}</td>
            <td style="padding: 1rem 0.5rem; text-align: right;">
                <button class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; border-color: var(--border);">VIEW &rarr;</button>
            </td>
        </tr>
    `).join('');
}

// Search and Filter Table
function filterCRMTable() {
  const queryStr = document.getElementById('bookingSearchInput').value.toLowerCase();
  const statusVal = document.getElementById('bookingFilterStatus').value;

  const filtered = dbBookings.filter(b => {
    const matchesQuery = b.name.toLowerCase().includes(queryStr) || b.email.toLowerCase().includes(queryStr) || b.style.toLowerCase().includes(queryStr);
    const matchesStatus = statusVal === 'all' || b.status === statusVal;
    return matchesQuery && matchesStatus;
  });

  renderCRMTable(filtered);
}

// Booking Detail Modal Controller
let activeBookingId = null;

window.openBookingModal = function (bookingId) {
  const booking = dbBookings.find(b => b.id === bookingId);
  if (!booking) return;

  activeBookingId = bookingId;

  document.getElementById('modalBookingClient').textContent = booking.name;
  document.getElementById('modalBookingId').textContent = `ID: ${booking.id}${booking.source ? " · " + booking.source : ""}`;
  document.getElementById('mBookingEmail').textContent = booking.email;
  document.getElementById('mBookingPhone').textContent = booking.phone || 'Not provided';
  document.getElementById('mBookingDate').textContent = `${booking.date || 'Flexible'}${booking.time ? " · " + booking.time : ""}`;
  document.getElementById('mBookingStyle').textContent = booking.style + (booking.preferredArtist ? ` · Artist: ${booking.preferredArtist}` : "");

  let ideaText = booking.idea || "";
  if (booking.tryOn) {
    const t = booking.tryOn;
    ideaText += `\n\n— Try-on —\nPlacement: ${t.placementLabel || t.placement || "—"}\nSize: ${t.scale ?? "—"}% · Rotation: ${t.rotation ?? 0}° · Wrap: ${t.wrap ?? 0}%\nBody zoom: ${t.bodyZoom ?? 100}%`;
    if (t.notes) ideaText += `\nNotes: ${t.notes}`;
  }
  document.getElementById('mBookingIdea').textContent = ideaText;

  const imagesGrid = document.getElementById('mBookingImagesGrid');
  const container = document.getElementById('mBookingImagesContainer');
  const imgs = [];
  if (booking.tryOnPreviewUrl) imgs.push(booking.tryOnPreviewUrl);
  if (booking.referenceImages && booking.referenceImages.length) {
    booking.referenceImages.forEach((u) => {
      if (u && !imgs.includes(u)) imgs.push(u);
    });
  }

  if (imgs.length > 0) {
    container.style.display = 'block';
    imagesGrid.innerHTML = imgs.map((img, idx) => `
            <div class="file-preview-item" style="cursor: pointer;" onclick="window.open('${img}', '_blank')" title="${idx === 0 && booking.tryOnPreviewUrl ? 'Try-on preview' : 'Reference'}">
                <img src="${img}" alt="Reference">
            </div>
        `).join('');
  } else {
    container.style.display = 'none';
    imagesGrid.innerHTML = '';
  }

  // Set dropdown selections
  document.getElementById('mBookingStatusSelect').value = booking.status || 'Pending';
  document.getElementById('mBookingArtistSelect').value = booking.assignedArtist || 'Unassigned';
  document.getElementById('mBookingNotes').value = booking.internalNotes || '';

  // Show modal
  document.getElementById('bookingModal').style.display = 'flex';
}

window.closeBookingModal = function () {
  document.getElementById('bookingModal').style.display = 'none';
  activeBookingId = null;
}

// Update Booking details in Firestore
window.saveBookingDetails = async function () {
  if (!activeBookingId) return;

  const status = document.getElementById('mBookingStatusSelect').value;
  const assignedArtist = document.getElementById('mBookingArtistSelect').value;
  const internalNotes = document.getElementById('mBookingNotes').value;

  const saveBtn = document.getElementById('saveBookingDetailsBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'SAVING...';

  try {
    await updateDoc(doc(db, "bookings", activeBookingId), {
      status,
      assignedArtist,
      internalNotes
    });

    alert("Booking details updated successfully!");
    closeBookingModal();

  } catch (err) {
    console.error("Failed to update booking: ", err);
    alert("Failed to save changes: " + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'SAVE CHANGES';
  }
}

// CMS Render Portfolio
function renderCMSPortfolio() {
  const cmsGrid = document.getElementById('cmsPortfolioGrid');
  if (!cmsGrid) return;

  if (dbPortfolio.length === 0) {
    cmsGrid.innerHTML = `<p style="color: var(--text-secondary);">No portfolio images uploaded.</p>`;
    return;
  }

  cmsGrid.innerHTML = dbPortfolio.map((item, index) => {
    const normalized = normalizePortfolioItem(item);
    return `
        <div class="cms-portfolio-item">
            <img src="${normalized.src}" alt="${normalized.alt}">
            <button class="cms-delete-btn" onclick="deleteCMSPortfolioImage(${index})">DELETE</button>
        </div>
    `;
  }).join('');
}

// Upload CMS Portfolio image
async function uploadCMSPortfolioImage(file) {
  try {
    const fileRef = ref(storage, `portfolio/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(fileRef, file);

    await new Promise((resolve, reject) => {
      uploadTask.on('state_changed',
        null,
        (error) => reject(error),
        () => resolve()
      );
    });

    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

    // Add to array and save to Firestore
    dbPortfolio.push({ src: downloadURL, category: "custom", alt: file.name.replace(/\.[^.]+$/, "") });
    await updateDoc(doc(db, "content", "portfolio"), {
      items: dbPortfolio
    });
    renderPortfolioGrid(dbPortfolio, activePortfolioFilter);

    alert("Portfolio image uploaded successfully!");
    renderCMSPortfolio();
    loadDynamicContent(); // Refresh main gallery

  } catch (err) {
    console.error("Failed to upload portfolio: ", err);
    alert("Failed to upload image: " + err.message);
  }
}

// Delete CMS Portfolio image
window.deleteCMSPortfolioImage = async function (index) {
  if (!confirm("Are you sure you want to delete this portfolio image?")) return;

  const item = dbPortfolio[index];
  const imgUrl = typeof item === "string" ? item : (item?.src || item?.image || "");

  try {
    // 1. Delete from storage if it is a firebase storage URL
    if (imgUrl.includes('firebasestorage.googleapis.com')) {
      const storageRef = ref(storage, imgUrl);
      await deleteObject(storageRef);
    }

    // 2. Remove from array and update Firestore
    dbPortfolio.splice(index, 1);
    await updateDoc(doc(db, "content", "portfolio"), {
      items: dbPortfolio
    });

    alert("Portfolio image deleted!");
    renderCMSPortfolio();
    renderPortfolioGrid(dbPortfolio, activePortfolioFilter);

  } catch (err) {
    console.error("Failed to delete portfolio item: ", err);
    alert("Failed to delete item: " + err.message);
  }
}

// CMS Render FAQs
function renderCMSFaqs() {
  const cmsFaqList = document.getElementById('cmsFaqList');
  if (!cmsFaqList) return;

  if (dbFaqs.length === 0) {
    cmsFaqList.innerHTML = `<p style="color: var(--text-secondary);">No FAQs created.</p>`;
    return;
  }

  cmsFaqList.innerHTML = dbFaqs.map(faq => `
        <div class="cms-faq-item box-inner">
            <div class="faq-details">
                <h4>${faq.question}</h4>
                <p>${faq.answer}</p>
            </div>
            <button class="btn btn-outline" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="openFaqModal('${faq.id}')">EDIT</button>
        </div>
    `).join('');
}

// Open FAQ Edit/Create Modal
let activeFaqId = null;

window.openFaqModal = function (faqId = null) {
  const questionInput = document.getElementById('faqQuestionInput');
  const answerInput = document.getElementById('faqAnswerInput');
  const deleteBtn = document.getElementById('deleteFaqBtn');
  const faqIdInput = document.getElementById('faqIdInput');
  const title = document.getElementById('faqModalTitle');

  if (faqId) {
    const faq = dbFaqs.find(f => f.id === faqId);
    if (!faq) return;

    activeFaqId = faqId;
    faqIdInput.value = faqId;
    questionInput.value = faq.question;
    answerInput.value = faq.answer;
    deleteBtn.style.display = 'block';
    title.textContent = 'Edit FAQ';
  } else {
    activeFaqId = null;
    faqIdInput.value = '';
    questionInput.value = '';
    answerInput.value = '';
    deleteBtn.style.display = 'none';
    title.textContent = 'Add FAQ';
  }

  document.getElementById('faqModal').style.display = 'flex';
}

window.closeFaqModal = function () {
  document.getElementById('faqModal').style.display = 'none';
  activeFaqId = null;
}

// Save FAQ (Create or Update)
window.saveFaqItem = async function () {
  const question = document.getElementById('faqQuestionInput').value;
  const answer = document.getElementById('faqAnswerInput').value;

  if (!question || !answer) {
    alert("Please fill in both the question and answer.");
    return;
  }

  const saveBtn = document.getElementById('saveFaqItemBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'SAVING...';

  try {
    if (activeFaqId) {
      // Update
      const faqIndex = dbFaqs.findIndex(f => f.id === activeFaqId);
      if (faqIndex > -1) {
        dbFaqs[faqIndex] = { id: activeFaqId, question, answer };
      }
    } else {
      // Create
      const newId = `faq_${Date.now()}`;
      dbFaqs.push({ id: newId, question, answer });
    }

    await updateDoc(doc(db, "content", "faqs"), {
      items: dbFaqs
    });

    alert("FAQ saved successfully!");
    closeFaqModal();
    renderCMSFaqs();
    loadDynamicContent(); // Refresh FAQs list on website

  } catch (err) {
    console.error("Failed to save FAQ: ", err);
    alert("Failed to save FAQ: " + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'SAVE';
  }
}

// Delete FAQ
window.deleteFaqItem = async function () {
  if (!activeFaqId) return;
  if (!confirm("Are you sure you want to delete this FAQ question?")) return;

  try {
    const faqIndex = dbFaqs.findIndex(f => f.id === activeFaqId);
    if (faqIndex > -1) {
      dbFaqs.splice(faqIndex, 1);
    }

    await updateDoc(doc(db, "content", "faqs"), {
      items: dbFaqs
    });

    alert("FAQ deleted!");
    closeFaqModal();
    renderCMSFaqs();
    loadDynamicContent(); // Refresh FAQs list on website

  } catch (err) {
    console.error("Failed to delete FAQ: ", err);
    alert("Failed to delete FAQ: " + err.message);
  }
}

// ==========================================
// NEW CRM & CLIENT PORTAL EXPANDED FEATURES
// ==========================================

// Hash Routing & SEO Meta Dynamic Updates
window.dbSeo = {};

window.handleRouting = function () {
  const hash = window.location.hash || '#home';
  updateSEOMeta(hash);

  if (hash === '#portal') {
    if (!currentUser) {
      window.location.hash = '#home';
      document.getElementById('loginModal').style.display = 'flex';
    } else {
      enterPortal();
    }
  } else if (hash.startsWith('#portal/')) {
    if (!currentUser) {
      window.location.hash = '#home';
      document.getElementById('loginModal').style.display = 'flex';
    } else {
      enterPortal();
      const tab = hash.split('/')[1];
      switchPortalTab(tab);
    }
  } else {
    exitPortal();
    const element = document.querySelector(hash);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
window.addEventListener('hashchange', window.handleRouting);

async function updateSEOMeta(hash) {
  const pageKey = hash.replace('#', '').split('/')[0] || 'home';
  const defaults = {
    home: {
      title: "Tattoo Dapto NSW | Diamond Tip Tattoo — Realism, Fine Line & Custom Ink",
      description: "Private tattoo studio in Dapto NSW · 4.6★ from 64 Google reviews. Custom realism, fine line & black & grey by Steven Benn & Scotty. Free consultation · Wollongong & Illawarra.",
      keywords: "tattoo Dapto, tattoo Wollongong, Illawarra tattoo, realism, fine line, Steven Benn",
      image: `${SITE_ORIGIN}/assets/brand/meta-image.png`,
      url: `${SITE_ORIGIN}/`,
    },
    blog: {
      title: "Diamond Tip Tattoo Blog | Aftercare, Placement & Custom Ink Guides",
      description: "Tattoo aftercare, placement, realism, fine line, cover-ups and first-tattoo guides from Diamond Tip Tattoo Dapto — Illawarra NSW.",
      keywords: "tattoo aftercare, tattoo placement, first tattoo Dapto, realism tattoo guide",
      image: `${SITE_ORIGIN}/assets/brand/meta-image.png`,
      url: `${SITE_ORIGIN}/#blog`,
    },
    book: {
      title: "Book Free Tattoo Consultation | Diamond Tip Tattoo Dapto",
      description: "Book a free private consultation at Diamond Tip Tattoo Dapto. Custom designs, realism, fine line — Illawarra & Wollongong clients welcome.",
      keywords: "book tattoo Dapto, tattoo consultation Wollongong",
      image: `${SITE_ORIGIN}/assets/brand/meta-image.png`,
      url: `${SITE_ORIGIN}/#book`,
    },
    reviews: {
      title: "Google Reviews | Diamond Tip Tattooing Dapto 4.6★",
      description: "Read Google reviews for Diamond Tip Tattooing Dapto NSW — 4.6 stars from 64 clients. Also on Facebook, Yellow Pages, Instagram & TikTok.",
      keywords: "Diamond Tip Tattoo reviews, tattoo Dapto reviews",
      image: `${SITE_ORIGIN}/assets/brand/meta-image.png`,
      url: `${SITE_ORIGIN}/#reviews`,
    },
  };

  let titleText = defaults.home.title;
  let descText = defaults.home.description;
  let keywordsText = defaults.home.keywords;
  let imageUrl = defaults.home.image;
  let pageUrl = defaults.home.url;

  if (defaults[pageKey]) {
    titleText = defaults[pageKey].title;
    descText = defaults[pageKey].description;
    keywordsText = defaults[pageKey].keywords || keywordsText;
    imageUrl = defaults[pageKey].image || imageUrl;
    pageUrl = defaults[pageKey].url || pageUrl;
  }

  if (window.dbSeo[pageKey]) {
    titleText = window.dbSeo[pageKey].title || titleText;
    descText = window.dbSeo[pageKey].description || descText;
    keywordsText = window.dbSeo[pageKey].keywords || keywordsText;
  } else {
    try {
      const seoDoc = await getDoc(doc(db, "content", "seo"));
      if (seoDoc.exists()) {
        window.dbSeo = seoDoc.data();
        if (window.dbSeo[pageKey]) {
          titleText = window.dbSeo[pageKey].title || titleText;
          descText = window.dbSeo[pageKey].description || descText;
          keywordsText = window.dbSeo[pageKey].keywords || keywordsText;
        }
      }
    } catch (e) {
      console.error("Error loading SEO meta: ", e);
    }
  }

  setSocialMeta({
    title: titleText,
    description: descText,
    image: imageUrl,
    url: pageUrl,
  });
  const keywordsMeta = document.getElementById('seoKeywords');
  if (keywordsMeta) keywordsMeta.setAttribute('content', keywordsText);
}

// Client Skin Notes
window.loadClientSkinNotes = async function () {
  if (!currentUser) return;
  const notesInput = document.getElementById('clientSkinNotesInput');
  if (!notesInput) return;

  notesInput.value = "Loading notes...";
  try {
    const clientDoc = await getDoc(doc(db, "clients", currentUser.uid));
    if (clientDoc.exists() && clientDoc.data().skinNotes) {
      notesInput.value = clientDoc.data().skinNotes;
    } else {
      notesInput.value = "";
    }
  } catch (e) {
    console.error(e);
    notesInput.value = "";
  }
}

window.saveSkinNotes = async function () {
  if (!currentUser) return;
  const notesInput = document.getElementById('clientSkinNotesInput');
  const feedback = document.getElementById('skinNotesFeedback');
  if (!notesInput || !feedback) return;

  try {
    await setDoc(doc(db, "clients", currentUser.uid), {
      email: currentUser.email,
      skinNotes: notesInput.value,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    feedback.textContent = "Skin notes saved!";
    setTimeout(() => { feedback.textContent = ""; }, 3000);
  } catch (e) {
    console.error(e);
    alert("Failed to save skin notes: " + e.message);
  }
}

// Gift Cards Simulated Purchases
window.selectedGcAmount = 50;

window.setupGiftCardForm = function () {
  const gcForm = document.getElementById('giftcardForm');
  if (!gcForm) return;

  const amountBtns = document.querySelectorAll('.gc-amount-btn');
  const customAmountInput = document.getElementById('gcCustomAmount');

  amountBtns.forEach(btn => {
    const val = btn.getAttribute('data-value');
    if (val !== 'custom' && parseInt(val) === window.selectedGcAmount) {
      btn.classList.add('btn-solid');
      btn.classList.remove('btn-outline');
    }

    btn.onclick = () => {
      amountBtns.forEach(b => {
        b.classList.remove('btn-solid');
        b.classList.add('btn-outline');
      });
      btn.classList.add('btn-solid');
      btn.classList.remove('btn-outline');

      if (val === 'custom') {
        customAmountInput.style.display = 'block';
        window.selectedGcAmount = 'custom';
      } else {
        customAmountInput.style.display = 'none';
        window.selectedGcAmount = parseInt(val);
      }
    };
  });

  gcForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    let amount = window.selectedGcAmount;
    if (window.selectedGcAmount === 'custom') {
      amount = parseInt(customAmountInput.value);
    }

    if (!amount || amount < 10) {
      alert("Minimum gift card value is $10.");
      return;
    }

    const recipientEmail = document.getElementById('gcRecipientEmail').value;
    const message = document.getElementById('gcMessage').value;
    const purchaseBtn = document.getElementById('gcPurchaseBtn');

    purchaseBtn.disabled = true;
    purchaseBtn.textContent = 'PROCESSING SIMULATED PAY...';

    try {
      const code = 'GC-' + Math.random().toString(36).substr(2, 9).toUpperCase();
      await addDoc(collection(db, "giftcards"), {
        userId: currentUser.uid,
        buyerEmail: currentUser.email,
        recipientEmail: recipientEmail,
        message: message,
        amount: amount,
        code: code,
        status: "Active",
        createdAt: new Date().toISOString()
      });

      alert(`Simulated Purchase Complete!\nGift Card Code: ${code}\nAssigned to: ${recipientEmail}`);
      gcForm.reset();
      customAmountInput.style.display = 'none';
      window.selectedGcAmount = 50;
      amountBtns.forEach(b => {
        b.classList.remove('btn-solid');
        b.classList.add('btn-outline');
        if (b.getAttribute('data-value') === '50') {
          b.classList.add('btn-solid');
          b.classList.remove('btn-outline');
        }
      });
      window.loadClientGiftCards();
    } catch (err) {
      console.error(err);
      alert("Error purchasing card: " + err.message);
    } finally {
      purchaseBtn.disabled = false;
      purchaseBtn.textContent = 'PURCHASE (SIMULATED PAY)';
    }
  };
}

window.loadClientGiftCards = async function () {
  if (!currentUser) return;
  const gcList = document.getElementById('giftcardsList');
  if (!gcList) return;

  try {
    const q = query(collection(db, "giftcards"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    if (snap.empty) {
      gcList.innerHTML = `<p style="color: var(--text-secondary);">No purchased gift cards yet.</p>`;
      return;
    }

    let html = '';
    snap.forEach(d => {
      const gc = d.data();
      html += `
                <div class="giftcard-card">
                    <div class="giftcard-value">$${gc.amount}</div>
                    <div class="giftcard-code">${gc.code}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">
                        To: ${gc.recipientEmail}<br>
                        Status: <span style="color: #00c873;">${gc.status}</span>
                    </div>
                </div>
            `;
    });
    gcList.innerHTML = html;
  } catch (e) {
    console.error(e);
    gcList.innerHTML = `<p style="color: var(--text-secondary);">Error loading gift cards.</p>`;
  }
}

// Shop Products Website & Portal
window.dbProducts = [];

window.loadClientShopProducts = async function () {
  // Portal used a missing #portalShopGrid — keep catalogue in sync for CMS/admin
  window.dbProducts = defaultShopProducts.map(p => ({ ...p }));
  try {
    const snap = await getDocs(collection(db, "products"));
    const cmsProducts = [];
    snap.forEach(d => cmsProducts.push({ id: d.id, ...d.data() }));
    if (shopHasCuratedProducts(cmsProducts) && cmsProducts.length >= 8) {
      window.dbProducts = cmsProducts;
    } else if (cmsProducts.length > 0 && !shopHasCuratedProducts(cmsProducts)) {
      // Old CMS placeholders — keep curated defaults for customer-facing shop
      window.dbProducts = defaultShopProducts.map(p => ({ ...p }));
    }
    if (typeof window.renderCMSProducts === "function") {
      window.renderCMSProducts();
    }
  } catch (e) {
    console.error(e);
  }
}

// Legacy alias — public shop uses cart, not simulated buy
window.buyProductSimulated = function (prodId) {
  if (window.addToCart(prodId, 1)) {
    window.openCartDrawer();
  } else {
    alert("Product not found. Please refresh and try again.");
  }
}

window.loadShopWebsite = async function () {
  const shopGrid = document.getElementById('shopGrid');
  if (!shopGrid) return;

  // Show curated local shop immediately (never blank / never login wall)
  renderShopGrid(defaultShopProducts);
  const errEl = document.getElementById("shopLoadError");
  if (errEl) errEl.hidden = true;

  try {
    const snap = await getDocs(collection(db, "products"));
    const cmsProducts = [];
    snap.forEach(d => cmsProducts.push({ id: d.id, ...d.data() }));
    window.dbProducts = cmsProducts.length ? cmsProducts : defaultShopProducts.map(p => ({ ...p }));

    // Prefer curated product packshots when CMS still has old placeholders
    if (shopHasCuratedProducts(cmsProducts) && cmsProducts.length >= 8) {
      renderShopGrid(cmsProducts);
    } else if (cmsProducts.length === 0) {
      // Best-effort seed of local products into Firestore for portal pickup flow
      try {
        for (const p of defaultShopProducts) {
          await setDoc(doc(db, "products", p.id), {
            name: p.name,
            price: p.price,
            image: p.image,
            description: p.description
          }, { merge: true });
        }
      } catch (seedErr) {
        console.warn("Could not seed shop products to Firestore:", seedErr);
      }
      renderShopGrid(defaultShopProducts);
    } else {
      renderShopGrid(defaultShopProducts);
    }
  } catch (e) {
    console.error(e);
    renderShopGrid(defaultShopProducts);
    const errEl = document.getElementById("shopLoadError");
    if (errEl) errEl.hidden = false;
  }
}

// Blog Articles Website
window.dbBlogs = [];
window.__localBlogPosts = null;

/** Prefer real studio photos; replace legacy seeded AI/stock paths */
function resolveBlogImage(blog) {
  const title = (blog.title || "").toLowerCase();
  const img = blog.image || "";
  const isLegacyFake =
    !img ||
    img.includes("tattoo_workspace_") ||
    img.includes("tattoo_artist_") ||
    img.includes("tattoo_front_desk_") ||
    img.includes("unsplash") ||
    img.includes("placeholder");

  if (title.includes("placement") || title.includes("perfect spot")) {
    return "assets/brand/blog-placement.jpg";
  }
  if (title.includes("aftercare") || title.includes("heal")) {
    return "assets/brand/blog-aftercare.jpg";
  }
  if (title.includes("first tattoo")) {
    return "assets/brand/studio-parlour.jpg";
  }
  if (title.includes("realism")) {
    return "assets/portfolio/realism/realism_tiger-portrait.jpg";
  }
  if (title.includes("fine line")) {
    return "assets/portfolio/fineline/fineline_butterfly-florals.jpg";
  }
  if (title.includes("cover")) {
    return "assets/portfolio/custom/custom_neotrad-serpent.jpg";
  }
  if (title.includes("piercing")) {
    return "assets/brand/aftercare-essentials.jpg";
  }
  if (!isLegacyFake) return img;
  return "assets/brand/studio-parlour.jpg";
}

function blogSlug(blog) {
  if (blog.slug) return String(blog.slug);
  if (blog.id && !String(blog.id).startsWith("local-") && String(blog.id).includes("-")) {
    return String(blog.id);
  }
  return String(blog.title || "post")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "post";
}

function blogShareUrl(blog) {
  const slug = blogSlug(blog);
  // Prefer static OG pages when we have a matching local slug
  const known = (window.__localBlogPosts || []).some((p) => p.slug === slug || p.id === blog.id);
  if (known || String(blog.id || "").includes("-")) {
    return `${SITE_ORIGIN}/blog/${slug}.html`;
  }
  return `${SITE_ORIGIN}/#blog`;
}

function setSocialMeta({ title, description, image, url }) {
  document.title = title;
  const titleEl = document.getElementById("seoTitle");
  if (titleEl) titleEl.textContent = title;
  const descMeta = document.getElementById("seoDesc");
  if (descMeta) descMeta.setAttribute("content", description);
  const isPng = image && /\.png(\?|$)/i.test(image);
  const pairs = [
    ['meta[property="og:title"]', title],
    ['meta[property="og:description"]', description],
    ['meta[property="og:image"]', image],
    ['meta[property="og:image:secure_url"]', image],
    ['meta[property="og:image:type"]', isPng ? "image/png" : "image/jpeg"],
    ['meta[property="og:url"]', url],
    ['meta[name="twitter:title"]', title],
    ['meta[name="twitter:description"]', description],
    ['meta[name="twitter:image"]', image],
  ];
  pairs.forEach(([sel, val]) => {
    const el = document.querySelector(sel);
    if (el && val) el.setAttribute("content", val);
  });
  const canon = document.querySelector('link[rel="canonical"]');
  if (canon && url) canon.setAttribute("href", url);
}

function shareLinksFor(url, title) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    twitter: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    whatsapp: `https://api.whatsapp.com/send?text=${t}%20${u}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    email: `mailto:?subject=${t}&body=${t}%20${u}`,
  };
}

window.openBlogArticle = function openBlogArticle(blogId) {
  const blog = (window.dbBlogs || []).find((b) => b.id === blogId || b.slug === blogId);
  if (!blog) return;
  const modal = document.getElementById("blogArticleModal");
  if (!modal) {
    // Fallback: open static page
    window.location.href = blogShareUrl(blog).replace(SITE_ORIGIN, "") || `blog/${blogSlug(blog)}.html`;
    return;
  }
  const image = resolveBlogImage(blog);
  const absImage = image.startsWith("http") ? image : `${SITE_ORIGIN}/${image}`;
  const shareUrl = blogShareUrl(blog);
  const title = blog.title || "Diamond Tip Tattoo Blog";
  const desc = blog.seoDescription || blog.excerpt || String(blog.content || "").slice(0, 155);
  setSocialMeta({
    title: blog.seoTitle || `${title} | Diamond Tip Tattoo`,
    description: desc,
    image: absImage,
    url: shareUrl,
  });

  const dateStr = new Date(blog.createdAt || Date.now()).toLocaleDateString(undefined, {
    month: "long", day: "numeric", year: "numeric",
  });
  const bodyHtml = String(blog.content || "")
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
    .join("");
  const shares = shareLinksFor(shareUrl, title);

  modal.querySelector("#blogArticleTitle").textContent = title;
  modal.querySelector("#blogArticleMeta").textContent = `${dateStr} · By ${blog.author || "Diamond Tip"}`;
  const imgEl = modal.querySelector("#blogArticleImage");
  imgEl.src = image;
  imgEl.alt = title;
  modal.querySelector("#blogArticleBody").innerHTML = bodyHtml;
  modal.querySelector("#blogShareFacebook").href = shares.facebook;
  modal.querySelector("#blogShareTwitter").href = shares.twitter;
  modal.querySelector("#blogShareWhatsApp").href = shares.whatsapp;
  modal.querySelector("#blogShareLinkedIn").href = shares.linkedin;
  modal.querySelector("#blogShareEmail").href = shares.email;
  modal.querySelector("#blogShareNative").onclick = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, text: desc, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        alert("Link copied — paste it anywhere to share.");
      }
    } catch (_) { /* cancelled */ }
  };
  modal.querySelector("#blogCopyLink").onclick = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      const btn = modal.querySelector("#blogCopyLink");
      const prev = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = prev; }, 1600);
    } catch (_) {
      prompt("Copy this link:", shareUrl);
    }
  };
  const fullLink = modal.querySelector("#blogFullPageLink");
  if (fullLink) fullLink.href = `blog/${blogSlug(blog)}.html`;

  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  try {
    trackEvent("blog_open", { id: blog.id, title });
  } catch (_) { }
};

window.closeBlogArticle = function closeBlogArticle() {
  const modal = document.getElementById("blogArticleModal");
  if (!modal) return;
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  // Restore home SEO
  if (typeof updateSEOMeta === "function") updateSEOMeta("#blog");
};

async function loadLocalBlogPosts() {
  if (window.__localBlogPosts) return window.__localBlogPosts;
  try {
    const res = await fetch("blog/posts.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("no posts.json");
    window.__localBlogPosts = await res.json();
  } catch (e) {
    window.__localBlogPosts = [];
  }
  return window.__localBlogPosts;
}

window.loadBlogWebsite = async function () {
  const blogGrid = document.getElementById('blogGrid');
  if (!blogGrid) return;

  const localPosts = await loadLocalBlogPosts();
  const fallbackBlogs = (localPosts.length ? localPosts : [
    {
      id: "aftercare-heal-perfectly",
      slug: "aftercare-heal-perfectly",
      title: "Aftercare: How to Heal Your Tattoo Perfectly",
      author: "Steven Benn",
      image: "assets/brand/blog-aftercare.jpg",
      content: "Taking care of your new tattoo is just as important as the tattooing process itself.",
      createdAt: new Date().toISOString()
    }
  ]).map((p) => ({ ...p, id: p.id || p.slug }));

  const renderBlogs = (blogs) => {
    // Merge: local SEO posts first, then any unique Firestore posts
    const byKey = new Map();
    fallbackBlogs.forEach((b) => byKey.set(blogSlug(b), b));
    (blogs || []).forEach((b) => {
      const key = blogSlug(b);
      if (!byKey.has(key)) byKey.set(key, b);
      else {
        // prefer longer content
        const existing = byKey.get(key);
        if ((b.content || "").length > (existing.content || "").length) {
          byKey.set(key, { ...existing, ...b, slug: key });
        }
      }
    });
    const merged = Array.from(byKey.values()).sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
    window.dbBlogs = merged;
    if (!merged.length) {
      blogGrid.innerHTML = `<p style="color: var(--text-secondary);">Check back soon for updates and stories from Diamond Tip.</p>`;
      return;
    }
    blogGrid.innerHTML = merged.map((blog) => {
      const dateStr = new Date(blog.createdAt || Date.now()).toLocaleDateString(undefined, {
        month: "short", day: "numeric", year: "numeric"
      });
      const image = resolveBlogImage(blog);
      const safeTitle = String(blog.title || "").replace(/"/g, "&quot;").replace(/`/g, "'");
      const excerpt = String(blog.excerpt || blog.content || "").substring(0, 130);
      const slug = blogSlug(blog);
      const idAttr = String(blog.id || slug).replace(/'/g, "\\'");
      return `
                <article class="blog-card" data-blog-id="${idAttr}">
                    <a href="blog/${slug}.html" class="blog-card-image-link" data-blog-open="${idAttr}">
                        <img src="${image}" alt="${safeTitle}" width="640" height="400" loading="lazy"
                             onerror="this.onerror=null;this.src='assets/brand/studio-parlour.jpg';">
                    </a>
                    <div class="blog-card-content">
                        <div class="blog-meta">${dateStr} · ${blog.author || "Diamond Tip"}</div>
                        <h3><a href="blog/${slug}.html" data-blog-open="${idAttr}">${safeTitle}</a></h3>
                        <p>${excerpt}${excerpt.length >= 130 ? "…" : ""}</p>
                        <div class="blog-card-actions">
                            <a href="blog/${slug}.html" class="explore" data-blog-open="${idAttr}">Read article →</a>
                        </div>
                    </div>
                </article>`;
    }).join("");

    blogGrid.querySelectorAll("[data-blog-open]").forEach((el) => {
      el.addEventListener("click", (e) => {
        // Allow cmd/ctrl open static page; otherwise open modal for in-site read
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        window.openBlogArticle(el.getAttribute("data-blog-open"));
      });
    });
  };

  renderBlogs(fallbackBlogs);

  try {
    const snap = await getDocs(query(collection(db, "blogs"), orderBy("createdAt", "desc")));
    if (snap.empty) return;

    const blogs = [];
    const updates = [];
    snap.forEach((d) => {
      const blog = { id: d.id, ...d.data() };
      const resolved = resolveBlogImage(blog);
      if (blog.image !== resolved && (
        !blog.image ||
        String(blog.image).includes("tattoo_workspace_") ||
        String(blog.image).includes("tattoo_artist_") ||
        String(blog.image).includes("tattoo_front_desk_")
      )) {
        updates.push(setDoc(doc(db, "blogs", d.id), { image: resolved }, { merge: true }).catch(() => { }));
        blog.image = resolved;
      }
      blogs.push(blog);
    });
    if (updates.length) Promise.all(updates);
    if (blogs.length) renderBlogs(blogs);
  } catch (e) {
    console.error(e);
  }
}

// Facebook Page Plugin SDK (timeline embed)
window.initFacebookFeed = function initFacebookFeed() {
  if (window.__fbSdkLoading) return;
  window.__fbSdkLoading = true;
  const appId = (
    document.querySelector('meta[name="facebook-app-id"], meta[property="fb:app_id"]')
      ?.getAttribute("content") || ""
  ).trim();
  window.fbAsyncInit = function () {
    try {
      const opts = { xfbml: true, version: "v21.0" };
      if (appId) opts.appId = appId;
      // eslint-disable-next-line no-undef
      FB.init(opts);
    } catch (e) {
      console.warn("FB init failed", e);
    }
  };
  if (!document.getElementById("facebook-jssdk")) {
    const js = document.createElement("script");
    js.id = "facebook-jssdk";
    js.async = true;
    js.defer = true;
    js.crossOrigin = "anonymous";
    const qs = appId
      ? `#xfbml=1&version=v21.0&appId=${encodeURIComponent(appId)}`
      : "#xfbml=1&version=v21.0";
    js.src = `https://connect.facebook.net/en_GB/sdk.js${qs}`;
    document.body.appendChild(js);
  } else if (window.FB && typeof window.FB.XFBML !== "undefined") {
    try { window.FB.XFBML.parse(); } catch (_) { /* ignore */ }
  }
};

// Live Chat real-time sync (Client-side)
window.chatUnsubscribe = null;
window.chatSessionId = null;
window.chatSessionName = null;
window.chatSessionEmail = null;

window.setupLiveChat = function () {
  const chatToggle = document.getElementById('chatToggleBtn');
  const chatWin = document.getElementById('chatWindow');
  const chatClose = document.getElementById('chatCloseBtn');

  if (!chatToggle) return;

  chatToggle.onclick = () => {
    chatWin.classList.toggle('open');
    if (chatWin.classList.contains('open')) {
      initChatSession();
    }
  };

  chatClose.onclick = () => {
    chatWin.classList.remove('open');
  };

  const chatStartBtn = document.getElementById('chatStartBtn');
  if (chatStartBtn) {
    chatStartBtn.onclick = () => {
      const name = document.getElementById('chatGuestName').value;
      const email = document.getElementById('chatGuestEmail').value;
      if (!name || !email) {
        alert("Please enter your name and email to start.");
        return;
      }
      window.chatSessionId = 'guest_' + Math.random().toString(36).substr(2, 9);
      window.chatSessionName = name;
      window.chatSessionEmail = email;
      localStorage.setItem('dt_chat_session_id', window.chatSessionId);
      localStorage.setItem('dt_chat_session_name', name);
      localStorage.setItem('dt_chat_session_email', email);
      startChatLiveSync();
    };
  }

  const chatSendBtn = document.getElementById('chatSendBtn');
  const chatInput = document.getElementById('chatMessageInput');
  if (chatSendBtn && chatInput) {
    const sendMsg = () => {
      const text = chatInput.value.trim();
      if (!text) return;
      sendChatMessageToServer(text);
      chatInput.value = '';
    };
    chatSendBtn.onclick = sendMsg;
    chatInput.onkeypress = (e) => {
      if (e.key === 'Enter') sendMsg();
    };
  }
}

function initChatSession() {
  if (currentUser) {
    window.chatSessionId = currentUser.uid;
    window.chatSessionName = currentUser.email.split('@')[0];
    window.chatSessionEmail = currentUser.email;
    startChatLiveSync();
  } else {
    const cachedId = localStorage.getItem('dt_chat_session_id');
    if (cachedId) {
      window.chatSessionId = cachedId;
      window.chatSessionName = localStorage.getItem('dt_chat_session_name');
      window.chatSessionEmail = localStorage.getItem('dt_chat_session_email');
      startChatLiveSync();
    } else {
      document.getElementById('chatPreAuth').style.display = 'flex';
      document.getElementById('chatMessages').style.display = 'none';
      document.getElementById('chatInputArea').style.display = 'none';
    }
  }
}

function startChatLiveSync() {
  document.getElementById('chatPreAuth').style.display = 'none';
  document.getElementById('chatMessages').style.display = 'flex';
  document.getElementById('chatInputArea').style.display = 'flex';

  if (window.chatUnsubscribe) window.chatUnsubscribe();

  window.chatUnsubscribe = onSnapshot(doc(db, "chats", window.chatSessionId), (docSnap) => {
    const messagesDiv = document.getElementById('chatMessages');
    if (!docSnap.exists()) {
      messagesDiv.innerHTML = `<p style="color: var(--text-secondary); text-align: center; margin-top: 1rem; font-size: 0.8rem;">Chat with Diamond Tip Tattoo live!</p>`;
      return;
    }

    const data = docSnap.data();
    const msgs = data.messages || [];
    if (msgs.length === 0) {
      messagesDiv.innerHTML = `<p style="color: var(--text-secondary); text-align: center; margin-top: 1rem; font-size: 0.8rem;">Chat with Diamond Tip Tattoo live!</p>`;
      return;
    }

    messagesDiv.innerHTML = msgs.map(m => {
      const isClient = m.sender === 'client';
      const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
                <div class="chat-msg ${isClient ? 'client' : 'admin'}">
                    ${m.text}
                    <span class="chat-msg-time">${time}</span>
                </div>
            `;
    }).join('');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

async function sendChatMessageToServer(text) {
  try {
    const chatRef = doc(db, "chats", window.chatSessionId);
    const chatSnap = await getDoc(chatRef);
    let messages = [];
    if (chatSnap.exists()) {
      messages = chatSnap.data().messages || [];
    }

    messages.push({
      text: text,
      sender: "client",
      timestamp: new Date().toISOString(),
      senderName: window.chatSessionName
    });

    await setDoc(chatRef, {
      clientName: window.chatSessionName,
      clientEmail: window.chatSessionEmail,
      lastMessageAt: new Date().toISOString(),
      messages: messages
    }, { merge: true });

  } catch (e) {
    console.error(e);
  }
}

// Chat CRM Admin Dashboard
window.adminChatUnsubscribe = null;
window.activeAdminChatId = null;
window.activeAdminChatMessages = [];

window.loadChatCrm = async function () {
  const threadsDiv = document.getElementById('chatCrmThreads');
  if (!threadsDiv) return;

  try {
    const snap = await getDocs(query(collection(db, "chats"), orderBy("lastMessageAt", "desc")));
    if (snap.empty) {
      threadsDiv.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.85rem;">No active chat threads.</p>`;
      return;
    }

    let html = '';
    snap.forEach(d => {
      const chat = d.data();
      const activeClass = (d.id === window.activeAdminChatId) ? 'active' : '';
      html += `
                <div class="chat-thread-item ${activeClass}" onclick="selectAdminChatThread('${d.id}')">
                    <strong>${chat.clientName || 'Guest'}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${chat.clientEmail}<br>
                        ${chat.messages && chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].text : 'No messages'}
                    </div>
                </div>
            `;
    });
    threadsDiv.innerHTML = html;
  } catch (e) {
    console.error(e);
  }
}

window.selectAdminChatThread = function (chatId) {
  if (window.adminChatUnsubscribe) window.adminChatUnsubscribe();
  window.activeAdminChatId = chatId;

  window.loadChatCrm();

  document.getElementById('chatCrmInputArea').style.display = 'flex';

  window.adminChatUnsubscribe = onSnapshot(doc(db, "chats", chatId), (docSnap) => {
    const messagesDiv = document.getElementById('chatCrmMessages');
    const headerDiv = document.getElementById('chatCrmHeader');

    if (!docSnap.exists()) return;
    const data = docSnap.data();
    headerDiv.innerHTML = `Chatting with: ${data.clientName} (${data.clientEmail})`;

    window.activeAdminChatMessages = data.messages || [];

    messagesDiv.innerHTML = window.activeAdminChatMessages.map(m => {
      const isClient = m.sender === 'client';
      const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
                <div class="chat-msg ${isClient ? 'admin' : 'client'}">
                    <strong>${isClient ? 'Client' : 'Admin'}:</strong> ${m.text}
                    <span class="chat-msg-time">${time}</span>
                </div>
            `;
    }).join('');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

window.sendAdminReply = async function () {
  const input = document.getElementById('chatCrmMessageInput');
  const text = input.value.trim();
  if (!text || !window.activeAdminChatId) return;

  try {
    window.activeAdminChatMessages.push({
      text: text,
      sender: "admin",
      timestamp: new Date().toISOString(),
      senderName: "Admin"
    });

    await setDoc(doc(db, "chats", window.activeAdminChatId), {
      lastMessageAt: new Date().toISOString(),
      messages: window.activeAdminChatMessages
    }, { merge: true });

    input.value = '';
  } catch (e) {
    console.error(e);
  }
}

// Client Database Admin view
window.dbClients = [];

window.loadClientDatabase = async function () {
  const clientList = document.getElementById('clientDbList');
  if (!clientList) return;

  try {
    const snap = await getDocs(collection(db, "clients"));
    window.dbClients = [];
    snap.forEach(d => {
      window.dbClients.push({ id: d.id, ...d.data() });
    });

    renderClientDbList(window.dbClients);

    const clientSearch = document.getElementById('clientSearchInput');
    if (clientSearch) {
      clientSearch.oninput = () => {
        const val = clientSearch.value.toLowerCase();
        const filtered = window.dbClients.filter(c => c.email.toLowerCase().includes(val));
        renderClientDbList(filtered);
      };
    }
  } catch (e) {
    console.error(e);
  }
}

function renderClientDbList(clientsList) {
  const clientList = document.getElementById('clientDbList');
  if (clientsList.length === 0) {
    clientList.innerHTML = `<p style="color: var(--text-secondary);">No clients found.</p>`;
    return;
  }

  clientList.innerHTML = clientsList.map(c => `
        <div class="client-db-item" onclick="selectClientForDbView('${c.id}')">
            <div>
                <strong style="color: #fff; font-size: 0.9rem;">${c.email}</strong>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">ID: ${c.id.substring(0, 8)}...</div>
            </div>
            <span style="font-size: 1.2rem; color: var(--accent);">&rarr;</span>
        </div>
    `).join('');
}

window.selectClientForDbView = async function (clientId) {
  const detailPanel = document.getElementById('selectedClientContent');
  const client = window.dbClients.find(c => c.id === clientId);
  if (!client || !detailPanel) return;

  let bookingsHtml = '<li>No bookings</li>';
  try {
    const bSnap = await getDocs(query(collection(db, "bookings"), where("email", "==", client.email)));
    if (!bSnap.empty) {
      bookingsHtml = '';
      bSnap.forEach(bd => {
        const b = bd.data();
        bookingsHtml += `<li>${b.preferredDate || 'No Date'} - <strong>${b.status}</strong> (${b.style})</li>`;
      });
    }
  } catch (err) {
    console.error(err);
  }

  detailPanel.innerHTML = `
        <div style="border-bottom: 1px solid var(--border); padding-bottom: 1rem; margin-bottom: 1rem;">
            <strong style="font-size: 0.85rem; color: var(--text-secondary); display: block;">Email:</strong>
            <span style="font-size: 1.1rem; color: #fff;">${client.email}</span>
            <span style="font-size: 0.75rem; color: var(--text-secondary); display: block; margin-top: 0.25rem;">Joined: ${client.createdAt ? new Date(client.createdAt).toLocaleDateString() : 'N/A'}</span>
        </div>
        
        <div style="margin-bottom: 1rem;">
            <strong style="font-size: 0.85rem; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Client Skin Notes:</strong>
            <p style="background: rgba(255,255,255,0.02); padding: 0.75rem; border: 1px solid var(--border); font-size: 0.9rem; white-space: pre-wrap;">${client.skinNotes || 'No skin notes added by client.'}</p>
        </div>
        
        <div style="margin-bottom: 1.5rem;">
            <strong style="font-size: 0.85rem; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Booking History:</strong>
            <ul style="padding-left: 1.25rem; font-size: 0.85rem; color: var(--text-primary); display: flex; flex-direction: column; gap: 0.25rem;">
                ${bookingsHtml}
            </ul>
        </div>
        
        <div style="margin-top: auto;">
            <label for="adminClientNotes" style="font-size: 0.85rem; color: var(--text-secondary); font-weight: bold; display: block; margin-bottom: 0.25rem;">Private Admin Notes (Internal):</label>
            <textarea id="adminClientNotes" placeholder="Allergies, preferences, needle size preferences..." rows="4" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border); background: #222; color: #fff; resize: vertical; margin-bottom: 0.5rem;">${client.adminNotes || ''}</textarea>
            <button class="btn btn-solid" style="width: 100%; padding: 0.5rem;" onclick="saveAdminClientNotes('${clientId}')">SAVE INTERNAL NOTES</button>
        </div>
    `;
}

window.saveAdminClientNotes = async function (clientId) {
  const notes = document.getElementById('adminClientNotes').value;
  try {
    await setDoc(doc(db, "clients", clientId), {
      adminNotes: notes
    }, { merge: true });
    alert("Internal admin notes saved!");
    const index = window.dbClients.findIndex(c => c.id === clientId);
    if (index > -1) window.dbClients[index].adminNotes = notes;
  } catch (e) {
    console.error(e);
    alert("Failed to save admin notes: " + e.message);
  }
}

// Blog CMS Actions
window.renderCMSBlogs = function () {
  const listDiv = document.getElementById('cmsBlogList');
  if (!listDiv) return;

  if (window.dbBlogs.length === 0) {
    listDiv.innerHTML = `<p style="color: var(--text-secondary);">No blog articles found.</p>`;
    return;
  }

  listDiv.innerHTML = window.dbBlogs.map(blog => `
        <div class="cms-faq-item box-inner">
            <div class="faq-details">
                <h4>${blog.title}</h4>
                <p>By ${blog.author} | ${new Date(blog.createdAt).toLocaleDateString()}</p>
            </div>
            <button class="btn btn-outline" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="openBlogModal('${blog.id}')">EDIT</button>
        </div>
    `).join('');
}

window.activeBlogId = null;

window.openBlogModal = function (blogId = null) {
  const titleInput = document.getElementById('blogTitleInput');
  const authorInput = document.getElementById('blogAuthorInput');
  const imageInput = document.getElementById('blogImageInput');
  const contentInput = document.getElementById('blogContentInput');
  const deleteBtn = document.getElementById('deleteBlogBtn');
  const blogIdInput = document.getElementById('blogIdInput');
  const title = document.getElementById('blogModalTitle');

  if (blogId) {
    const blog = window.dbBlogs.find(b => b.id === blogId);
    if (!blog) return;

    window.activeBlogId = blogId;
    blogIdInput.value = blogId;
    titleInput.value = blog.title;
    authorInput.value = blog.author;
    imageInput.value = blog.image || '';
    contentInput.value = blog.content;
    deleteBtn.style.display = 'block';
    title.textContent = 'Edit Blog Post';
  } else {
    window.activeBlogId = null;
    blogIdInput.value = '';
    titleInput.value = '';
    authorInput.value = 'Steven Benn';
    imageInput.value = '';
    contentInput.value = '';
    deleteBtn.style.display = 'none';
    title.textContent = 'Add Blog Post';
  }

  document.getElementById('blogModal').style.display = 'flex';
}

window.closeBlogModal = function () {
  document.getElementById('blogModal').style.display = 'none';
  window.activeBlogId = null;
}

window.saveBlogItem = async function () {
  const title = document.getElementById('blogTitleInput').value;
  const author = document.getElementById('blogAuthorInput').value;
  const image = document.getElementById('blogImageInput').value || 'assets/tattoo_workspace_1781911831357.png';
  const content = document.getElementById('blogContentInput').value;

  if (!title || !content) {
    alert("Title and content are required.");
    return;
  }

  try {
    if (window.activeBlogId) {
      await setDoc(doc(db, "blogs", window.activeBlogId), {
        title, author, image, content,
        createdAt: new Date().toISOString()
      }, { merge: true });
    } else {
      const newId = `blog_${Date.now()}`;
      await setDoc(doc(db, "blogs", newId), {
        title, author, image, content,
        createdAt: new Date().toISOString()
      });
    }

    alert("Blog post saved!");
    window.closeBlogModal();
    await fetchCMSDataCache();
    window.renderCMSBlogs();
    window.loadBlogWebsite();
  } catch (e) {
    console.error(e);
  }
}

window.deleteBlogItem = async function () {
  if (!window.activeBlogId) return;
  if (!confirm("Delete this blog post?")) return;

  try {
    await deleteDoc(doc(db, "blogs", window.activeBlogId));
    alert("Blog post deleted!");
    window.closeBlogModal();
    await fetchCMSDataCache();
    window.renderCMSBlogs();
    window.loadBlogWebsite();
  } catch (e) {
    console.error(e);
  }
}

// Product CMS Actions
window.renderCMSProducts = function () {
  const listDiv = document.getElementById('cmsProductList');
  if (!listDiv) return;

  if (window.dbProducts.length === 0) {
    listDiv.innerHTML = `<p style="color: var(--text-secondary);">No products found.</p>`;
    return;
  }

  listDiv.innerHTML = window.dbProducts.map(prod => `
        <div class="cms-faq-item box-inner">
            <div class="faq-details">
                <h4>${prod.name}</h4>
                <p>$${prod.price} | ${prod.description}</p>
            </div>
            <button class="btn btn-outline" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="openProductModal('${prod.id}')">EDIT</button>
        </div>
    `).join('');
}

window.activeProductId = null;

window.openProductModal = function (prodId = null) {
  const nameInput = document.getElementById('productNameInput');
  const priceInput = document.getElementById('productPriceInput');
  const imageInput = document.getElementById('productImageInput');
  const descInput = document.getElementById('productDescInput');
  const deleteBtn = document.getElementById('deleteProductBtn');
  const productIdInput = document.getElementById('productIdInput');
  const title = document.getElementById('productModalTitle');

  if (prodId) {
    const prod = window.dbProducts.find(p => p.id === prodId);
    if (!prod) return;

    window.activeProductId = prodId;
    productIdInput.value = prodId;
    nameInput.value = prod.name;
    priceInput.value = prod.price;
    imageInput.value = prod.image || '';
    descInput.value = prod.description;
    deleteBtn.style.display = 'block';
    title.textContent = 'Edit Product';
  } else {
    window.activeProductId = null;
    productIdInput.value = '';
    nameInput.value = '';
    priceInput.value = '';
    imageInput.value = '';
    descInput.value = '';
    deleteBtn.style.display = 'none';
    title.textContent = 'Add Product';
  }

  document.getElementById('productModal').style.display = 'flex';
}

window.closeProductModal = function () {
  document.getElementById('productModal').style.display = 'none';
  window.activeProductId = null;
}

window.saveProductItem = async function () {
  const name = document.getElementById('productNameInput').value;
  const price = parseFloat(document.getElementById('productPriceInput').value);
  const image = document.getElementById('productImageInput').value || 'assets/tattoo_front_desk_1781911857115.png';
  const description = document.getElementById('productDescInput').value;

  if (!name || isNaN(price) || !description) {
    alert("Please fill all required fields.");
    return;
  }

  try {
    if (window.activeProductId) {
      await setDoc(doc(db, "products", window.activeProductId), {
        name, price, image, description
      }, { merge: true });
    } else {
      const newId = `product_${Date.now()}`;
      await setDoc(doc(db, "products", newId), {
        name, price, image, description
      });
    }

    alert("Product saved!");
    window.closeProductModal();
    await window.loadClientShopProducts();
    window.renderCMSProducts();
    window.loadShopWebsite();
  } catch (e) {
    console.error(e);
  }
}

window.deleteProductItem = async function () {
  if (!window.activeProductId) return;
  if (!confirm("Delete this product?")) return;

  try {
    await deleteDoc(doc(db, "products", window.activeProductId));
    alert("Product deleted!");
    window.closeProductModal();
    await window.loadClientShopProducts();
    window.renderCMSProducts();
    window.loadShopWebsite();
  } catch (e) {
    console.error(e);
  }
}

// SEO Meta Config
window.loadSeoSettings = async function () {
  const pageSelect = document.getElementById('seoPageSelect');
  const titleInput = document.getElementById('seoTitleInput');
  const descInput = document.getElementById('seoDescInput');
  const keywordsInput = document.getElementById('seoKeywordsInput');

  if (!pageSelect || !titleInput) return;

  const pageKey = pageSelect.value;
  let titleText = "Diamond Tip Tattoo";
  let descText = "Private tattoo studio for custom work.";
  let keywordsText = "tattoo, Dapto";

  if (window.dbSeo[pageKey]) {
    titleText = window.dbSeo[pageKey].title || titleText;
    descText = window.dbSeo[pageKey].description || descText;
    keywordsText = window.dbSeo[pageKey].keywords || keywordsText;
  }

  titleInput.value = titleText;
  descInput.value = descText;
  keywordsInput.value = keywordsText;
}

window.saveSeoItem = async function (e) {
  if (e) e.preventDefault();
  const pageSelect = document.getElementById('seoPageSelect');
  const titleInput = document.getElementById('seoTitleInput');
  const descInput = document.getElementById('seoDescInput');
  const keywordsInput = document.getElementById('seoKeywordsInput');
  const feedback = document.getElementById('seoFeedback');

  if (!pageSelect || !titleInput || !feedback) return;

  const pageKey = pageSelect.value;
  window.dbSeo[pageKey] = {
    title: titleInput.value,
    description: descInput.value,
    keywords: keywordsInput.value
  };

  try {
    await setDoc(doc(db, "content", "seo"), window.dbSeo);
    feedback.textContent = "SEO Settings Saved!";
    setTimeout(() => { feedback.textContent = ""; }, 3000);
    updateSEOMeta(window.location.hash || '#home');
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

window.fetchCMSDataCache = async function () {
  try {
    const bSnap = await getDocs(collection(db, "blogs"));
    window.dbBlogs = [];
    bSnap.forEach(d => {
      window.dbBlogs.push({ id: d.id, ...d.data() });
    });

    const pSnap = await getDocs(collection(db, "products"));
    window.dbProducts = [];
    pSnap.forEach(d => {
      window.dbProducts.push({ id: d.id, ...d.data() });
    });

    const sSnap = await getDoc(doc(db, "content", "seo"));
    if (sSnap.exists()) {
      window.dbSeo = sSnap.data();
    }
  } catch (e) {
    console.error(e);
  }
}

// PUBLIC APPOINTMENT SCHEDULER WIDGET
window.initPublicBookingCalendar = function () {
  const prevBtn = document.getElementById('pubPrevMonthBtn');
  const nextBtn = document.getElementById('pubNextMonthBtn');

  if (prevBtn) {
    prevBtn.onclick = (e) => {
      e.preventDefault();
      pubCalendarDate.setMonth(pubCalendarDate.getMonth() - 1);
      renderPublicBookingCalendar();
    };
  }
  if (nextBtn) {
    nextBtn.onclick = (e) => {
      e.preventDefault();
      pubCalendarDate.setMonth(pubCalendarDate.getMonth() + 1);
      renderPublicBookingCalendar();
    };
  }

  renderPublicBookingCalendar();
};

window.renderPublicBookingCalendar = function () {
  const monthYearLabel = document.getElementById('pubCalendarMonthYear');
  const daysGrid = document.getElementById('pubCalendarDaysGrid');
  if (!monthYearLabel || !daysGrid) return;

  const year = pubCalendarDate.getFullYear();
  const month = pubCalendarDate.getMonth();

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  monthYearLabel.textContent = `${months[month]} ${year}`;

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let gridHtml = '';

  // Empty cells before start of month
  for (let i = 0; i < firstDayIndex; i++) {
    gridHtml += `<div class="pub-day-cell empty"></div>`;
  }

  // Today boundary calculation
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let day = 1; day <= daysInMonth; day++) {
    const currentDayDate = new Date(year, month, day);
    const dayOfWeek = currentDayDate.getDay(); // 0 = Sun, 1 = Mon, etc.
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    let cellClasses = 'pub-day-cell';
    let isClosed = (dayOfWeek === 0 || dayOfWeek === 1); // Sunday & Monday closed
    let isPast = (currentDayDate < today);
    let isSelected = (selectedPubDate === dateString);
    let isToday = (today.getFullYear() === year && today.getMonth() === month && today.getDate() === day);

    if (isToday) cellClasses += ' today';
    if (isSelected) cellClasses += ' selected';

    if (isPast) {
      cellClasses += ' disabled';
      gridHtml += `<div class="${cellClasses}" title="Past date">${day}</div>`;
    } else if (isClosed) {
      cellClasses += ' closed';
      gridHtml += `<div class="${cellClasses}" title="Studio closed on Sunday & Monday">${day}</div>`;
    } else {
      gridHtml += `<div class="${cellClasses}" onclick="selectPublicCalendarDate('${dateString}')">${day}</div>`;
    }
  }

  daysGrid.innerHTML = gridHtml;
};

window.selectPublicCalendarDate = function (dateString) {
  selectedPubDate = dateString;
  selectedPubTime = null;

  // Reset hidden fields
  document.getElementById('bookingDate').value = dateString;
  document.getElementById('bookingTime').value = '';

  // Render the grid to reflect selection
  renderPublicBookingCalendar();

  // Display slots container
  const container = document.getElementById('pubTimeSlotsContainer');
  const dateLabel = document.getElementById('pubSelectedDateLabel');
  if (container && dateLabel) {
    container.style.display = 'block';
    const dateObj = new Date(dateString + 'T00:00:00');
    dateLabel.textContent = dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  renderPublicTimeSlots(dateString);
};

window.renderPublicTimeSlots = async function (dateString) {
  const slotsGrid = document.getElementById('pubTimeSlotsGrid');
  if (!slotsGrid) return;

  slotsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 1rem;">
            <div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
            <span style="font-size: 0.85rem; color: var(--text-secondary);">Checking availability...</span>
        </div>
    `;

  // Morning consults only — studio does not take late / afternoon appointment slots online
  const slots = [
    "9:00 AM",
    "9:30 AM",
    "10:00 AM",
    "10:30 AM",
    "11:00 AM",
    "11:30 AM",
    "12:00 PM"
  ];

  try {
    // Query database to see what's booked for this day
    const q = query(collection(db, "bookings"), where("date", "==", dateString));
    const snapshot = await getDocs(q);
    const bookedTimes = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.status !== "Cancelled") {
        bookedTimes.push(data.time);
      }
    });

    let gridHtml = '';
    slots.forEach(slot => {
      const isBooked = bookedTimes.includes(slot);
      if (isBooked) {
        gridHtml += `<button type="button" class="time-slot-btn booked" disabled>${slot} (Booked)</button>`;
      } else {
        const isSelected = (selectedPubTime === slot);
        gridHtml += `<button type="button" class="time-slot-btn ${isSelected ? 'selected' : ''}" onclick="selectPublicTimeSlot('${slot}')">${slot}</button>`;
      }
    });

    slotsGrid.innerHTML = gridHtml;
  } catch (err) {
    console.error("Error loading time slots:", err);
    slotsGrid.innerHTML = `<p style="grid-column: 1 / -1; color: var(--accent); font-size: 0.85rem;">Failed to check slot availability. Please try again.</p>`;
  }
};

window.selectPublicTimeSlot = function (timeString) {
  selectedPubTime = timeString;
  document.getElementById('bookingTime').value = timeString;

  // Highlight selected button
  const buttons = document.querySelectorAll('#pubTimeSlotsGrid .time-slot-btn');
  buttons.forEach(btn => {
    if (btn.classList.contains('booked')) return;
    if (btn.textContent.trim() === timeString) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });
};

// GEMINI TATTOO VARIATION STUDIO
window.initAiTattooStudio = function () {
  const aiDropZone = document.getElementById('aiDropZone');
  const aiImageFile = document.getElementById('aiImageFile');
  const removeAiFileBtn = document.getElementById('removeAiFileBtn');
  const generateAiBtn = document.getElementById('generateAiVariationBtn');

  if (aiDropZone && aiImageFile) {
    // Dropzone drag/drop events
    aiDropZone.ondragover = (e) => {
      e.preventDefault();
      aiDropZone.style.borderColor = 'var(--accent)';
    };
    aiDropZone.ondragleave = () => {
      aiDropZone.style.borderColor = 'var(--border)';
    };
    aiDropZone.ondrop = (e) => {
      e.preventDefault();
      aiDropZone.style.borderColor = 'var(--border)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleAiStudioFileUpload(e.dataTransfer.files[0]);
      }
    };

    aiDropZone.onclick = (e) => {
      if (e.target !== removeAiFileBtn && !removeAiFileBtn.contains(e.target)) {
        aiImageFile.click();
      }
    };

    aiImageFile.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        handleAiStudioFileUpload(e.target.files[0]);
      }
    };
  }

  if (removeAiFileBtn) {
    removeAiFileBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearAiStudioFile();
    };
  }

  if (generateAiBtn) {
    generateAiBtn.onclick = async (e) => {
      e.preventDefault();
      await generateTattooVariationTextToImage();
    };
  }

  // Download action
  const downloadBtn = document.getElementById('downloadAiResultBtn');
  if (downloadBtn) {
    downloadBtn.onclick = async (e) => {
      e.preventDefault();
      if (!aiGeneratedTattooUrl) return;
      try {
        const res = await fetch(aiGeneratedTattooUrl);
        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `diamond_tip_tattoo_variation_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error("Failed to download image:", err);
        alert("Download failed. You can right-click the image and select 'Save image as...'");
      }
    };
  }

  // Use for Booking action
  const useForBookingBtn = document.getElementById('useAiResultForBookingBtn');
  if (useForBookingBtn) {
    useForBookingBtn.onclick = (e) => {
      e.preventDefault();
      if (!aiGeneratedTattooUrl) return;

      // Attach image to booking global reference
      const container = document.getElementById('aiBookingAttachmentContainer');
      const img = document.getElementById('aiBookingAttachmentImg');
      const promptDesc = document.getElementById('aiBookingAttachmentPrompt');
      const removeBtn = document.getElementById('removeAiAttachmentBtn');

      if (container && img && promptDesc) {
        img.src = aiGeneratedTattooUrl;
        promptDesc.textContent = aiGeneratedTattooPrompt;
        container.style.display = 'block';

        // Show standard feedback
        alert("Redesigned artwork is now attached to your consultation form. Please scroll down to complete your details and pick a date/time!");

        // Hide portal and jump to booking section
        exitPortal();
        const bookingSection = document.getElementById('book');
        if (bookingSection) {
          bookingSection.scrollIntoView({ behavior: 'smooth' });
        }

        removeBtn.onclick = (ev) => {
          ev.preventDefault();
          aiGeneratedTattooUrl = null;
          aiGeneratedTattooPrompt = null;
          container.style.display = 'none';
        };
      }
    };
  }
};

function handleAiStudioFileUpload(file) {
  if (!file.type.startsWith('image/')) {
    alert("Please upload a valid image file (JPG, PNG, or WebP).");
    return;
  }

  aiUploadedFile = file;

  const preview = document.getElementById('aiFilePreview');
  const previewImg = document.getElementById('aiFilePreviewImage');

  if (preview && previewImg) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }
}

function clearAiStudioFile() {
  aiUploadedFile = null;
  const fileInput = document.getElementById('aiImageFile');
  if (fileInput) fileInput.value = '';

  const preview = document.getElementById('aiFilePreview');
  const previewImg = document.getElementById('aiFilePreviewImage');
  if (preview && previewImg) {
    previewImg.src = '';
    preview.style.display = 'none';
  }
}

async function generateTattooVariationTextToImage() {
  if (!aiUploadedFile) {
    alert("Please upload a base tattoo design or sketch first.");
    return;
  }

  const instructions = document.getElementById('aiInstructions').value.trim();
  if (!instructions) {
    alert("Please describe what modifications or variations you'd like.");
    return;
  }

  const placeholder = document.getElementById('aiOutputPlaceholder');
  const loading = document.getElementById('aiOutputLoading');
  const resultDiv = document.getElementById('aiOutputResult');
  const statusText = document.getElementById('aiLoadingStatus');

  if (placeholder && loading && resultDiv && statusText) {
    placeholder.style.display = 'none';
    resultDiv.style.display = 'none';
    loading.style.display = 'flex';
    statusText.textContent = "Analyzing design with AI...";
  }

  try {
    // 1. Process base64
    const imagePart = await fileToGenerativePart(aiUploadedFile);

    // 2. Query Gemini
    const promptText = `You are an expert tattoo designer and prompt engineer.
The user has uploaded a base tattoo design image and requested the following modifications:
"${instructions}"

Analyze the image and the requested changes. Generate a detailed, highly descriptive text-to-image prompt that describes the final, modified tattoo design in detail. The prompt should be optimized for a text-to-image generator, focusing on style (e.g., "fine line", "tribal", "realism"), colors ("black and red", "black and grey"), composition, shading, and details.

Your response must contain ONLY the raw text-to-image prompt. Do not include any explanations, markdown code blocks, intro, or outro. Just the prompt itself.`;

    const result = await geminiModel.generateContent([promptText, imagePart]);
    const responseText = await result.response.text();

    let optimizedPrompt = responseText.trim();
    // Strip markdown code block formatting if present
    if (optimizedPrompt.startsWith('```')) {
      optimizedPrompt = optimizedPrompt.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
    }
    optimizedPrompt = optimizedPrompt.trim();

    if (loading && statusText) {
      statusText.textContent = "Rendering redesigned artwork...";
    }

    // 3. Generate image using Pollinations.ai
    const seed = Math.floor(Math.random() * 100000);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(optimizedPrompt)}?width=1024&height=1024&nologo=true&private=true&enhance=false&seed=${seed}`;

    // 4. Preload image in browser
    const imgElement = document.getElementById('aiResultImage');
    const promptElement = document.getElementById('aiResultPrompt');

    if (imgElement && promptElement) {
      imgElement.src = imageUrl;
      promptElement.textContent = optimizedPrompt;

      await new Promise((resolve, reject) => {
        imgElement.onload = () => resolve();
        imgElement.onerror = () => reject(new Error("Failed to load image from generator"));
      });

      aiGeneratedTattooUrl = imageUrl;
      aiGeneratedTattooPrompt = instructions;

      if (loading && resultDiv) {
        loading.style.display = 'none';
        resultDiv.style.display = 'flex';
      }
    }
  } catch (err) {
    console.error("AI Redesign failed:", err);
    alert("AI variation generation failed: " + err.message);
    if (loading && placeholder) {
      loading.style.display = 'none';
      placeholder.style.display = 'flex';
    }
  }
}

// =============================================
// PUBLIC TATTOO TRY-ON / STITCH PREVIEW
// =============================================
let tryOnDesignImg = null;
let tryOnBodyImg = null;
let tryOnDragging = false;
let tryOnOffset = { x: 0.5, y: 0.45 }; // normalized placement center
let tryOnRotationDeg = 0; // design rotation in degrees
let tryOnLastPreviewUrl = null;
let tryOnMeta = null; // last try-on settings for CRM

// Default wrap amount (0–100) by body placement — arm/leg wrap more than flat areas
const TRYON_WRAP_DEFAULTS = {
  forearm: 55,
  "upper-arm": 60,
  chest: 35,
  back: 25,
  ribs: 50,
  thigh: 55,
  calf: 50,
  wrist: 45,
  neck: 20,
  custom: 30
};

const TRYON_PLACEMENT_DEFAULTS = {
  forearm: { x: 0.5, y: 0.48 },
  "upper-arm": { x: 0.55, y: 0.38 },
  chest: { x: 0.5, y: 0.42 },
  back: { x: 0.5, y: 0.45 },
  ribs: { x: 0.62, y: 0.48 },
  thigh: { x: 0.5, y: 0.55 },
  calf: { x: 0.5, y: 0.58 },
  wrist: { x: 0.5, y: 0.62 },
  neck: { x: 0.5, y: 0.28 },
  custom: { x: 0.5, y: 0.5 }
};

/** Upload a data: URL (or remote URL) to Firebase Storage; returns download URL */
async function uploadDataUrlOrBlobToStorage(dataUrlOrHttp, storagePath) {
  let blob;
  if (typeof dataUrlOrHttp === "string" && dataUrlOrHttp.startsWith("data:")) {
    const res = await fetch(dataUrlOrHttp);
    blob = await res.blob();
  } else if (typeof dataUrlOrHttp === "string" && /^https?:/i.test(dataUrlOrHttp)) {
    // Already hosted — keep as-is
    return dataUrlOrHttp;
  } else {
    throw new Error("Invalid image data for upload");
  }
  const fileRef = ref(storage, storagePath);
  await uploadBytesResumable(fileRef, blob);
  return getDownloadURL(fileRef);
}

/** Diamond Tip Facebook Page Messenger — all form summaries go here */
const STUDIO_MESSENGER_URL = "https://m.me/diamondtiptattoo";
const STUDIO_MESSENGER_PAGE = "https://www.facebook.com/diamondtiptattoo";
/** Super-admin inboxes for form / booking notifications */
const STUDIO_NOTIFY_EMAILS = SUPER_ADMIN_EMAILS;

/** m.me deep link with ref (Meta referral → our webhook auto-reply) */
function studioMessengerUrlWithRef(ref) {
  const base = STUDIO_MESSENGER_URL.replace(/\?.*$/, "");
  if (!ref) return base;
  const safe = String(ref).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
  return `${base}?ref=${encodeURIComponent(safe)}`;
}

/**
 * Vercel serverless form webhooks (GitHub → Vercel deploy).
 * Origin from (in order): window.__DTT_FORM_API_BASE, <meta name="dtt-form-api">, same origin.
 * When the static site stays on Firebase, set the meta to your Vercel URL, e.g.
 *   <meta name="dtt-form-api" content="https://diamond-tip-tattoo.vercel.app">
 */
const DEFAULT_FORM_API_BASE = "https://diamond-tip-tattoo.vercel.app";

function getFormApiBase() {
  try {
    if (typeof window !== "undefined" && window.__DTT_FORM_API_BASE) {
      return String(window.__DTT_FORM_API_BASE).replace(/\/$/, "");
    }
    const meta = document.querySelector('meta[name="dtt-form-api"]');
    const fromMeta = (meta?.getAttribute("content") || "").trim();
    if (fromMeta) return fromMeta.replace(/\/$/, "");
  } catch (_) { /* ignore */ }

  try {
    const host = (typeof window !== "undefined" && window.location && window.location.hostname) || "";
    // Already on Vercel (or local with /api proxied) — same-origin functions
    if (/\.vercel\.app$/i.test(host)) return "";
  } catch (_) { /* ignore */ }

  // Firebase / custom-domain static host → Vercel API so Messenger notify can run
  return DEFAULT_FORM_API_BASE;
}

function getFormWebhookSecret() {
  try {
    if (typeof window !== "undefined" && window.__DTT_FORM_SECRET) {
      return String(window.__DTT_FORM_SECRET);
    }
    const meta = document.querySelector('meta[name="dtt-form-secret"]');
    return (meta?.getAttribute("content") || "").trim();
  } catch (_) {
    return "";
  }
}

/**
 * POST form payload to Vercel /api/forms/{kind}
 * @param {"booking"|"order"} kind
 * @param {object} payload
 * @returns {Promise<{ok:boolean, skipped?:boolean, status?:number, data?:any, error?:string}>}
 */
async function postFormWebhook(kind, payload) {
  const base = getFormApiBase();
  // Relative path works when the site itself is hosted on Vercel
  const url = `${base}/api/forms/${kind}`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  const secret = getFormWebhookSecret();
  if (secret) headers["X-Form-Secret"] = secret;

  // Honeypot field (must stay empty for real users)
  const body = { ...payload, website: "" };

  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller?.signal
    });
    if (timer) clearTimeout(timer);
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
    if (!res.ok) {
      console.warn(`Form webhook ${kind} failed:`, res.status, data);
      return { ok: false, status: res.status, data, error: data?.error || res.statusText };
    }
    return { ok: true, status: res.status, data };
  } catch (e) {
    // Missing Vercel deploy / CORS / offline — do not block the client UX
    console.warn(`Form webhook ${kind} unreachable:`, e?.message || e);
    return { ok: false, skipped: true, error: e?.message || String(e) };
  }
}

window.postFormWebhook = postFormWebhook;

/** Last form message prepared for Messenger (booking / shop / other) */
window.__lastMessengerFormText = "";
window.__pendingMessengerWindow = null;

function formatBookingMessageForMessenger(bookingData) {
  const lines = [
    "NEW CONSULTATION REQUEST — Diamond Tip Tattoo website",
    "",
    `Name: ${bookingData.name || "—"}`,
    `Email: ${bookingData.email || "—"}`,
    `Phone: ${bookingData.phone || "—"}`,
    `Preferred date: ${bookingData.date || "—"}`,
    `Preferred time: ${bookingData.time || "—"}`,
    `Style: ${bookingData.style || "—"}`,
    `Preferred artist: ${bookingData.preferredArtist || "—"}`,
    `Source: ${bookingData.source || "website"}`,
    "",
    "Idea:",
    bookingData.idea || "—",
    "",
    bookingData.tryOn
      ? `Try-on: placement=${bookingData.tryOn.placement || "—"}, size=${bookingData.tryOn.scale ?? "—"}%, rotation=${bookingData.tryOn.rotation ?? "—"}°, wrap=${bookingData.tryOn.wrap ?? "—"}%`
      : "Try-on: none",
    "",
    `Reference images: ${(bookingData.referenceImages || []).length}`,
    ...(bookingData.referenceImages || []).map((u, i) => `  ${i + 1}. ${u}`),
    "",
    `Booking ID: ${bookingData.id || "—"}`,
    `Created: ${bookingData.createdAt || new Date().toISOString()}`
  ];
  return lines.join("\n");
}

function formatOrderMessageForMessenger(order) {
  const itemLines = (order.items || []).map(
    (i) => `  • ${i.name} × ${i.qty} — $${Number(i.lineTotal).toFixed(2)}`
  );
  return [
    "NEW STUDIO PICKUP ORDER — Diamond Tip Tattoo website",
    "",
    `Name: ${order.name || "—"}`,
    `Email: ${order.email || "—"}`,
    `Phone: ${order.phone || "—"}`,
    `Pickup window: ${order.pickupWindow || "—"}`,
    `Notes: ${order.notes || "—"}`,
    "",
    "Items:",
    ...(itemLines.length ? itemLines : ["  (none)"]),
    "",
    `Total: $${Number(order.total || 0).toFixed(2)} AUD`,
    `Payment: pay at studio`,
    `Order ID: ${order.id || "—"}`,
    `Created: ${order.createdAt || new Date().toISOString()}`
  ].join("\n");
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

/**
 * Send form data to Facebook Messenger (Page: diamondtiptattoo).
 *
 * Two layers:
 * 1) Server (Vercel + Page token) pushes the form to studio PSIDs automatically.
 * 2) Client still opens m.me so the *customer* can chat the Page; we copy the
 *    summary so they can paste if the bot isn't live yet. Use ?ref= for Meta
 *    referral tracking + auto-reply once the webhook is connected.
 *
 * @param {string} text - full form summary including email
 * @param {{ win?: Window|null, open?: boolean, ref?: string }} opts
 */
async function sendFormDataToMessenger(text, opts = {}) {
  const message = String(text || "").trim();
  window.__lastMessengerFormText = message;
  let copied = false;
  if (message) copied = await copyTextToClipboard(message);

  const openChat = opts.open !== false;
  let win = opts.win || window.__pendingMessengerWindow;
  window.__pendingMessengerWindow = null;
  const chatUrl = studioMessengerUrlWithRef(opts.ref || "");

  if (openChat) {
    try {
      if (win && !win.closed) {
        win.location.href = chatUrl;
      } else {
        win = window.open(chatUrl, "_blank", "noopener,noreferrer");
      }
    } catch (_) {
      win = null;
    }
  }

  try {
    if (typeof window.trackEvent === "function") {
      window.trackEvent("form_to_messenger", {
        copied,
        opened: !!(win && !win.closed),
        chars: message.length,
        ref: opts.ref || null
      });
    }
  } catch (_) { /* ignore */ }

  return { copied, opened: !!(win && !win.closed), url: chatUrl };
}

window.sendFormDataToMessenger = sendFormDataToMessenger;
window.openStudioMessenger = function openStudioMessenger() {
  const text = window.__lastMessengerFormText || "";
  return sendFormDataToMessenger(text, { open: true });
};

function updateMessengerSuccessUI({ copied, text }) {
  const status = document.getElementById("messengerCopyStatus");
  const preview = document.getElementById("messengerMessagePreview");
  if (status) {
    status.textContent = copied
      ? "Form details (including email) copied — paste into Messenger and send."
      : "Open Messenger, then tap “Copy details” and paste into the chat.";
  }
  if (preview && text) {
    preview.value = text;
    preview.hidden = false;
  }
  const emailLine = document.getElementById("messengerClientEmail");
  if (emailLine) {
    const m = String(text).match(/^Email:\s*(.+)$/m);
    emailLine.textContent = m ? m[1].trim() : "—";
  }
}

/** Notify studio by Messenger handoff + email + CRM (best-effort) */
async function notifyStudioOfBooking(bookingData, opts = {}) {
  const subject = `New booking request — ${bookingData.name} (${bookingData.date} ${bookingData.time})`;
  const text = formatBookingMessageForMessenger(bookingData);
  const html = `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap;line-height:1.45">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</pre>`;

  // 0) Facebook Messenger handoff — customer chat + ref for bot auto-reply
  //    Studio notification is also pushed server-side via Vercel form webhook → Graph API
  let messengerResult = { copied: false, opened: false };
  const messengerRef = bookingData.tryOn || bookingData.tryOnPreviewUrl
    ? `tryon_${bookingData.id || Date.now()}`
    : `booking_${bookingData.id || Date.now()}`;
  try {
    messengerResult = await sendFormDataToMessenger(text, {
      win: opts.messengerWin || window.__pendingMessengerWindow,
      open: opts.openMessenger !== false,
      ref: messengerRef
    });
    updateMessengerSuccessUI({ copied: messengerResult.copied, text });
  } catch (e) {
    console.warn("Messenger handoff failed:", e);
  }

  // 1) Firestore mail queue — works with Firebase "Trigger Email" extension
  try {
    await addDoc(collection(db, "mail"), {
      to: STUDIO_NOTIFY_EMAILS,
      message: { subject, text, html },
      createdAt: new Date().toISOString(),
      type: "booking_request",
      bookingId: bookingData.id,
      status: "pending",
      messengerUrl: STUDIO_MESSENGER_URL,
      channel: "messenger_and_email"
    });
  } catch (e) {
    console.warn("mail queue write failed:", e);
  }

  // 2) CRM lead mirror for dashboards
  try {
    await setDoc(doc(db, "leads", bookingData.id), {
      ...bookingData,
      type: "booking_consultation",
      notifyChannel: "facebook_messenger",
      messengerUrl: STUDIO_MESSENGER_URL,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (e) {
    console.warn("leads write failed:", e);
  }

  // 3) FormSubmit email backup (includes client email + full message)
  try {
    await fetch(`https://formsubmit.co/ajax/${STUDIO_NOTIFY_EMAILS[0]}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        _subject: subject,
        _template: "table",
        _captcha: "false",
        _replyto: bookingData.email || "",
        _cc: STUDIO_NOTIFY_EMAILS.slice(1).join(","),
        name: bookingData.name,
        email: bookingData.email,
        phone: bookingData.phone || "",
        date: bookingData.date,
        time: bookingData.time,
        style: bookingData.style,
        preferredArtist: bookingData.preferredArtist || "",
        idea: bookingData.idea || "",
        bookingId: bookingData.id,
        tryOn: bookingData.tryOn ? JSON.stringify(bookingData.tryOn) : "",
        references: (bookingData.referenceImages || []).join("\n"),
        messenger: STUDIO_MESSENGER_URL,
        message: text
      })
    });
  } catch (e) {
    console.warn("FormSubmit notify failed:", e);
  }

  // 4) Vercel form webhook — try-on + regular booking (Zapier/Make/Discord/Resend)
  try {
    await postFormWebhook("booking", {
      ...bookingData,
      // Prefer Storage URLs; strip oversized inline data URLs
      referenceImages: (bookingData.referenceImages || []).filter(
        (u) => typeof u === "string" && !u.startsWith("data:")
      ),
      tryOnPreviewUrl:
        bookingData.tryOnPreviewUrl &&
          !String(bookingData.tryOnPreviewUrl).startsWith("data:")
          ? bookingData.tryOnPreviewUrl
          : bookingData.tryOn?.previewUrl &&
            !String(bookingData.tryOn.previewUrl).startsWith("data:")
            ? bookingData.tryOn.previewUrl
            : null,
      messenger: STUDIO_MESSENGER_URL
    });
  } catch (e) {
    console.warn("Vercel booking webhook failed:", e);
  }

  return messengerResult;
}

/**
 * Convert flash-style art (black ink on white) into transparent ink for realistic skin overlay.
 */
function prepareInkCanvas(img, w, h) {
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d");
  sctx.clearRect(0, 0, w, h);
  sctx.drawImage(img, 0, 0, w, h);
  try {
    const id = sctx.getImageData(0, 0, w, h);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = (r + g + b) / 3;
      // Near-white paper → transparent
      if (lum > 236) {
        d[i + 3] = 0;
      } else {
        // Ink darkness drives alpha; force near-black pigment
        const ink = 255 - lum;
        const a = Math.min(255, ink * 1.25);
        d[i] = 18;
        d[i + 1] = 16;
        d[i + 2] = 16;
        d[i + 3] = a;
      }
    }
    sctx.putImageData(id, 0, 0);
  } catch (_) {
    // Cross-origin / security — leave as drawn
  }
  return src;
}

/**
 * Draw design with optional cylindrical wrap (bends around limb/torso).
 * amount: 0 = flat, 1 = strong wrap
 */
function drawWrappedDesign(ctx, img, cx, cy, destW, destH, rotRad, amount, opacity) {
  const w = Math.max(2, Math.round(destW));
  const h = Math.max(2, Math.round(destH));
  const amp = clampNumber(amount, 0, 1);

  // Full design, white flash bg stripped → real black ink on skin
  const src = prepareInkCanvas(img, w, h);

  if (amp < 0.02) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotRad);
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(src, -w / 2, -h / 2, w, h);
    // soft multiply pass for skin blend
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = Math.min(0.55, opacity * 0.5);
    ctx.drawImage(src, -w / 2, -h / 2, w, h);
    ctx.restore();
    return { w, h };
  }

  // Cylindrical horizontal wrap: vertical strips foreshorten at edges
  const strips = Math.min(160, Math.max(48, w));
  const maxAngle = (Math.PI / 2) * (0.35 + amp * 0.65); // stronger bend at high wrap

  const paintLayer = (alpha, composite) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotRad);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = composite;

    for (let i = 0; i < strips; i++) {
      const u = (i + 0.5) / strips - 0.5; // -0.5 .. 0.5
      const t = u * 2; // -1 .. 1
      const angle = t * maxAngle;
      const cosA = Math.cos(angle);
      // Map to curved X; preserve roughly same total width
      const xNorm = Math.sin(angle) / Math.sin(maxAngle || 0.001);
      const dx = xNorm * (w / 2);
      // Edges of cylinder appear shorter (height)
      const hScale = 0.42 + 0.58 * Math.max(0.15, cosA);
      const stripH = h * hScale;
      // Subtle vertical barrel for chest/torso feel when wrap is high
      const barrel = 1 + amp * 0.12 * Math.cos(t * Math.PI);
      const finalH = stripH * barrel;

      const sx = (i / strips) * w;
      const sw = w / strips + 1.25;
      const dw = w / strips + 1.25;

      ctx.drawImage(src, sx, 0, sw, h, dx - dw / 2, -finalH / 2, dw, finalH);
    }
    ctx.restore();
  };

  // Source-over first (true ink alpha), light multiply for skin bite
  paintLayer(Math.min(1, opacity), "source-over");
  paintLayer(Math.min(0.35, opacity * 0.35), "multiply");
  return { w, h };
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Please choose a valid image file."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load image."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function previewFileInLabel(file, previewEl) {
  if (!previewEl || !file) return;
  const url = URL.createObjectURL(file);
  previewEl.src = url;
  previewEl.hidden = false;
}

function scaleLabelFromValue(v) {
  return `${Math.round(v)}%`;
}

function opacityLabelFromValue(v) {
  if (v < 55) return "Soft";
  if (v < 75) return "Natural";
  if (v < 90) return "Bold";
  return "Solid";
}

function rotationLabelFromValue(v) {
  const n = Math.round(Number(v) || 0);
  return `${n}°`;
}

function clampNumber(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function setTryOnRotation(deg, { redraw = true } = {}) {
  tryOnRotationDeg = clampNumber(Number(deg) || 0, -180, 180);
  const rotInput = document.getElementById("tryOnRotation");
  const rotLabel = document.getElementById("tryOnRotationLabel");
  if (rotInput) rotInput.value = String(Math.round(tryOnRotationDeg));
  if (rotLabel) rotLabel.textContent = rotationLabelFromValue(tryOnRotationDeg);
  if (redraw && tryOnBodyImg && tryOnDesignImg) drawTryOnPreview();
}

function setTryOnScale(val, { redraw = true } = {}) {
  const scale = document.getElementById("tryOnScale");
  const scaleLabel = document.getElementById("tryOnScaleLabel");
  const v = clampNumber(Number(val) || 35, 8, 120);
  if (scale) {
    scale.value = String(v);
    scale.setAttribute("aria-valuetext", scaleLabelFromValue(v));
  }
  if (scaleLabel) scaleLabel.textContent = scaleLabelFromValue(v);
  if (redraw && tryOnBodyImg && tryOnDesignImg) drawTryOnPreview();
}

function updateTryOnSteps() {
  const steps = document.querySelectorAll("#tryOnSteps li");
  if (!steps.length) return;
  const hasDesign = !!tryOnDesignImg;
  const hasBody = !!tryOnBodyImg;
  const hasPreview = !!(tryOnDesignImg && tryOnBodyImg);
  const states = [
    hasDesign, // 1 design
    hasBody, // 2 photo
    hasPreview, // 3 adjust
    hasPreview && !!tryOnLastPreviewUrl // 4 book-ready
  ];
  steps.forEach((li, i) => {
    li.classList.remove("is-active", "is-done");
    if (states[i] && i < 3) li.classList.add("is-done");
    // active = first incomplete, or last if all done
    const firstIncomplete = states.findIndex((s) => !s);
    if (firstIncomplete === -1 && i === 3) li.classList.add("is-active");
    else if (i === firstIncomplete) li.classList.add("is-active");
    else if (i === 0 && firstIncomplete === -1) li.classList.add("is-done");
  });
  if (states.every(Boolean)) {
    steps.forEach((li, i) => {
      li.classList.toggle("is-done", i < 3);
      li.classList.toggle("is-active", i === 3);
    });
  }
}

function setUploadCardFilled(cardId, previewEl, labelId, fileName) {
  const card = document.getElementById(cardId);
  const label = document.getElementById(labelId);
  if (card) card.classList.add("is-filled");
  if (label && fileName) label.textContent = fileName;
  if (previewEl) previewEl.hidden = false;
}

function clearUploadCard(cardId, previewEl, labelId, defaultText) {
  const card = document.getElementById(cardId);
  const label = document.getElementById(labelId);
  if (card) card.classList.remove("is-filled");
  if (label) label.textContent = defaultText;
  if (previewEl) {
    previewEl.hidden = true;
    previewEl.removeAttribute("src");
  }
}

function drawTryOnPreview() {
  const canvas = document.getElementById("tryOnCanvas");
  if (!canvas || !tryOnBodyImg) return;
  const ctx = canvas.getContext("2d");
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);

  // Fit WHOLE body photo (contain), then apply zoom so any aspect ratio works
  const bodyZoom = Number(document.getElementById("tryOnBodyZoom")?.value || 100) / 100;
  const br = tryOnBodyImg.width / tryOnBodyImg.height;
  const cr = cw / ch;
  let baseW, baseH;
  if (br > cr) {
    // image wider than canvas — fit width
    baseW = cw;
    baseH = cw / br;
  } else {
    // image taller — fit height
    baseH = ch;
    baseW = ch * br;
  }
  const dw = baseW * bodyZoom;
  const dh = baseH * bodyZoom;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;

  // Letterbox background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(tryOnBodyImg, dx, dy, dw, dh);

  if (tryOnDesignImg) {
    const scalePct = Number(document.getElementById("tryOnScale")?.value || 35) / 100;
    const opacity = Number(document.getElementById("tryOnOpacity")?.value || 88) / 100;
    const wrapAmt = Number(document.getElementById("tryOnWrap")?.value || 0) / 100;
    const rotInput = document.getElementById("tryOnRotation");
    if (rotInput) tryOnRotationDeg = Number(rotInput.value) || 0;

    // Full design always drawn — scale preserves aspect ratio (never crops design)
    const maxSide = Math.min(cw, ch) * scalePct;
    const ir = tryOnDesignImg.width / tryOnDesignImg.height;
    let iw, ih;
    if (ir >= 1) {
      iw = maxSide;
      ih = maxSide / ir;
    } else {
      ih = maxSide;
      iw = maxSide * ir;
    }
    const cx = Math.max(0, Math.min(1, tryOnOffset.x)) * cw;
    const cy = Math.max(0, Math.min(1, tryOnOffset.y)) * ch;
    const rad = (tryOnRotationDeg * Math.PI) / 180;

    drawWrappedDesign(
      ctx,
      tryOnDesignImg,
      cx,
      cy,
      iw,
      ih,
      rad,
      wrapAmt,
      Math.min(1, opacity)
    );

    // Subtle placement guide (only while dragging / adjusting)
    if (tryOnDragging) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rad);
      ctx.strokeStyle = "rgba(230,57,70,0.65)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(-iw / 2 - 4, -ih / 2 - 4, iw + 8, ih + 8);
      ctx.restore();
    }

    const placeEl = document.getElementById("tryOnPlacement");
    tryOnMeta = {
      placement: placeEl?.value || "custom",
      placementLabel: placeEl?.selectedOptions?.[0]?.text || "Custom",
      scale: Number(document.getElementById("tryOnScale")?.value || 35),
      rotation: Math.round(tryOnRotationDeg),
      wrap: Number(document.getElementById("tryOnWrap")?.value || 0),
      bodyZoom: Number(document.getElementById("tryOnBodyZoom")?.value || 100),
      opacity: Number(document.getElementById("tryOnOpacity")?.value || 88),
      notes: document.getElementById("tryOnNotes")?.value?.trim() || "",
      offset: { ...tryOnOffset }
    };
  }

  const placeholder = document.getElementById("tryOnPlaceholder");
  const actions = document.getElementById("tryOnActions");
  const dragHint = document.getElementById("tryOnDragHint");
  const mobileBar = document.getElementById("tryOnMobileBar");
  if (placeholder) placeholder.classList.add("is-hidden");
  if (actions) actions.hidden = !(tryOnDesignImg && tryOnBodyImg);
  if (dragHint) dragHint.hidden = !(tryOnDesignImg && tryOnBodyImg);
  if (mobileBar) mobileBar.hidden = !(tryOnDesignImg && tryOnBodyImg);
  tryOnLastPreviewUrl = canvas.toDataURL("image/png");
  updateTryOnSteps();
}

window.initTattooTryOn = function initTattooTryOn() {
  if (window.__tryOnInited) return;
  window.__tryOnInited = true;

  const designInput = document.getElementById("tryOnDesignFile");
  const bodyInput = document.getElementById("tryOnBodyFile");
  const designPreview = document.getElementById("tryOnDesignPreview");
  const bodyPreview = document.getElementById("tryOnBodyPreview");
  const placement = document.getElementById("tryOnPlacement");
  const scale = document.getElementById("tryOnScale");
  const opacity = document.getElementById("tryOnOpacity");
  const rotation = document.getElementById("tryOnRotation");
  const wrapInput = document.getElementById("tryOnWrap");
  const bodyZoom = document.getElementById("tryOnBodyZoom");
  const stitchBtn = document.getElementById("tryOnStitchBtn");
  const resetBtn = document.getElementById("tryOnResetBtn");
  const downloadBtn = document.getElementById("tryOnDownloadBtn");
  const canvas = document.getElementById("tryOnCanvas");
  const modal = document.getElementById("tryOnModal");
  const openBtn = document.getElementById("openTryOnBtn");
  const closeBtn = document.getElementById("closeTryOnBtn");
  const footerLink = document.getElementById("footerTryOnLink");
  const bookBtn = document.getElementById("tryOnBookBtn");
  const mobileBook = document.getElementById("tryOnMobileBook");
  const mobileDownload = document.getElementById("tryOnMobileDownload");
  const chips = document.getElementById("tryOnPlacementChips");
  const scaleLabel = document.getElementById("tryOnScaleLabel");
  const opacityLabel = document.getElementById("tryOnOpacityLabel");
  const rotationLabel = document.getElementById("tryOnRotationLabel");
  const wrapLabel = document.getElementById("tryOnWrapLabel");
  const bodyZoomLabel = document.getElementById("tryOnBodyZoomLabel");
  const scaleUp = document.getElementById("tryOnScaleUp");
  const scaleDown = document.getElementById("tryOnScaleDown");
  const rotateLeft = document.getElementById("tryOnRotateLeft");
  const rotateRight = document.getElementById("tryOnRotateRight");
  const wrapUp = document.getElementById("tryOnWrapUp");
  const wrapDown = document.getElementById("tryOnWrapDown");
  const bodyZoomUp = document.getElementById("tryOnBodyZoomUp");
  const bodyZoomDown = document.getElementById("tryOnBodyZoomDown");

  const syncScaleLabel = () => {
    const v = Number(scale?.value || 35);
    if (scaleLabel) scaleLabel.textContent = scaleLabelFromValue(v);
    if (scale) scale.setAttribute("aria-valuetext", scaleLabelFromValue(v));
  };
  const syncOpacityLabel = () => {
    const v = Number(opacity?.value || 88);
    if (opacityLabel) opacityLabel.textContent = opacityLabelFromValue(v);
  };
  const syncRotationLabel = () => {
    const v = Number(rotation?.value || tryOnRotationDeg || 0);
    tryOnRotationDeg = v;
    if (rotationLabel) rotationLabel.textContent = rotationLabelFromValue(v);
    if (rotation) rotation.setAttribute("aria-valuetext", rotationLabelFromValue(v));
  };
  const syncWrapLabel = () => {
    const v = Number(wrapInput?.value || 0);
    if (wrapLabel) {
      wrapLabel.textContent = v <= 0 ? "Off" : v < 35 ? "Light" : v < 70 ? "Medium" : "Strong";
    }
    if (wrapInput) wrapInput.setAttribute("aria-valuetext", `${v} percent wrap`);
  };
  const syncBodyZoomLabel = () => {
    const v = Number(bodyZoom?.value || 100);
    if (bodyZoomLabel) {
      bodyZoomLabel.textContent = v <= 100 ? "Fit whole" : `${v}%`;
    }
  };
  const applyWrapForPlacement = (key) => {
    if (!wrapInput) return;
    const def = TRYON_WRAP_DEFAULTS[key] ?? TRYON_WRAP_DEFAULTS.custom;
    wrapInput.value = String(def);
    syncWrapLabel();
  };

  const openModal = (e) => {
    if (e) e.preventDefault();
    if (!modal) return;
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    updateTryOnSteps();
    if (typeof window.trackEvent === "function") {
      window.trackEvent("try_on_open");
    }
  };
  const closeModal = () => {
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  };

  // Single delegated open — works for nav, hero, home section, footer
  document.addEventListener("click", (e) => {
    const t = e.target.closest(".open-try-on-btn, #openTryOnBtn, #footerTryOnLink, #sliderAction2");
    if (!t) return;
    openModal(e);
  });
  if (closeBtn) closeBtn.onclick = closeModal;
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  const attachToBooking = () => {
    if (!tryOnLastPreviewUrl) return;
    const container = document.getElementById("aiBookingAttachmentContainer");
    const img = document.getElementById("aiBookingAttachmentImg");
    const promptDesc = document.getElementById("aiBookingAttachmentPrompt");
    if (container && img) {
      img.src = tryOnLastPreviewUrl;
      if (promptDesc) {
        const place =
          chips?.querySelector(".try-on-chip.is-active")?.textContent?.trim() ||
          placement?.selectedOptions?.[0]?.text ||
          "Custom";
        const notes = document.getElementById("tryOnNotes")?.value?.trim() || "";
        promptDesc.textContent = `Try-on preview · Placement: ${place}${notes ? " · " + notes : ""}`;
      }
      container.style.display = "block";
      aiGeneratedTattooUrl = tryOnLastPreviewUrl;
      aiGeneratedTattooPrompt = promptDesc?.textContent || "Try-on preview";
    }
    if (typeof window.trackEvent === "function") {
      window.trackEvent("try_on_book");
    }
    closeModal();
  };

  if (bookBtn) bookBtn.addEventListener("click", attachToBooking);
  if (mobileBook) {
    mobileBook.addEventListener("click", (e) => {
      e.preventDefault();
      attachToBooking();
      const bookSec = document.getElementById("book");
      if (bookSec) bookSec.scrollIntoView({ behavior: "smooth" });
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal?.style.display === "flex") closeModal();
  });

  if (!designInput || !bodyInput || !stitchBtn || !canvas) return;

  designInput.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      tryOnDesignImg = await loadImageFromFile(file);
      previewFileInLabel(file, designPreview);
      setUploadCardFilled("tryOnDesignCard", designPreview, "tryOnDesignLabel", file.name);
      updateTryOnSteps();
      if (tryOnBodyImg) drawTryOnPreview();
    } catch (err) {
      alert(err.message);
    }
  };

  bodyInput.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      tryOnBodyImg = await loadImageFromFile(file);
      previewFileInLabel(file, bodyPreview);
      setUploadCardFilled("tryOnBodyCard", bodyPreview, "tryOnBodyLabel", file.name);
      updateTryOnSteps();
      drawTryOnPreview();
    } catch (err) {
      alert(err.message);
    }
  };

  // Placement chips
  if (chips) {
    chips.addEventListener("click", (e) => {
      const chip = e.target.closest(".try-on-chip[data-place]");
      if (!chip) return;
      chips.querySelectorAll(".try-on-chip[data-place]").forEach((c) => {
        c.classList.remove("is-active");
        c.setAttribute("aria-selected", "false");
      });
      chip.classList.add("is-active");
      chip.setAttribute("aria-selected", "true");
      const key = chip.getAttribute("data-place") || "custom";
      if (placement) placement.value = key;
      tryOnOffset = { ...(TRYON_PLACEMENT_DEFAULTS[key] || TRYON_PLACEMENT_DEFAULTS.custom) };
      applyWrapForPlacement(key);
      if (tryOnBodyImg && tryOnDesignImg) drawTryOnPreview();
    });
  }

  if (placement) {
    placement.onchange = () => {
      const key = placement.value;
      tryOnOffset = { ...(TRYON_PLACEMENT_DEFAULTS[key] || TRYON_PLACEMENT_DEFAULTS.custom) };
      chips?.querySelectorAll(".try-on-chip[data-place]").forEach((c) => {
        const on = c.getAttribute("data-place") === key;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-selected", on ? "true" : "false");
      });
      applyWrapForPlacement(key);
      if (tryOnBodyImg && tryOnDesignImg) drawTryOnPreview();
    };
  }

  if (scale) {
    syncScaleLabel();
    scale.oninput = () => {
      syncScaleLabel();
      if (tryOnBodyImg && tryOnDesignImg) drawTryOnPreview();
    };
  }
  if (scaleUp) {
    scaleUp.onclick = () => {
      setTryOnScale(Number(scale?.value || 35) + 5);
    };
  }
  if (scaleDown) {
    scaleDown.onclick = () => {
      setTryOnScale(Number(scale?.value || 35) - 5);
    };
  }

  if (rotation) {
    syncRotationLabel();
    rotation.oninput = () => {
      syncRotationLabel();
      if (tryOnBodyImg && tryOnDesignImg) drawTryOnPreview();
    };
  }
  if (rotateLeft) {
    rotateLeft.onclick = () => {
      setTryOnRotation(tryOnRotationDeg - 15);
    };
  }
  if (rotateRight) {
    rotateRight.onclick = () => {
      setTryOnRotation(tryOnRotationDeg + 15);
    };
  }
  document.querySelectorAll(".try-on-rotate-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      const deg = Number(btn.getAttribute("data-rotate") || 0);
      setTryOnRotation(deg);
    });
  });

  if (wrapInput) {
    syncWrapLabel();
    wrapInput.oninput = () => {
      syncWrapLabel();
      if (tryOnBodyImg && tryOnDesignImg) drawTryOnPreview();
    };
  }
  if (wrapUp) {
    wrapUp.onclick = () => {
      if (!wrapInput) return;
      wrapInput.value = String(clampNumber(Number(wrapInput.value) + 10, 0, 100));
      syncWrapLabel();
      if (tryOnBodyImg && tryOnDesignImg) drawTryOnPreview();
    };
  }
  if (wrapDown) {
    wrapDown.onclick = () => {
      if (!wrapInput) return;
      wrapInput.value = String(clampNumber(Number(wrapInput.value) - 10, 0, 100));
      syncWrapLabel();
      if (tryOnBodyImg && tryOnDesignImg) drawTryOnPreview();
    };
  }

  if (bodyZoom) {
    syncBodyZoomLabel();
    bodyZoom.oninput = () => {
      syncBodyZoomLabel();
      if (tryOnBodyImg) drawTryOnPreview();
    };
  }
  if (bodyZoomUp) {
    bodyZoomUp.onclick = () => {
      if (!bodyZoom) return;
      bodyZoom.value = String(clampNumber(Number(bodyZoom.value) + 10, 50, 200));
      syncBodyZoomLabel();
      if (tryOnBodyImg) drawTryOnPreview();
    };
  }
  if (bodyZoomDown) {
    bodyZoomDown.onclick = () => {
      if (!bodyZoom) return;
      bodyZoom.value = String(clampNumber(Number(bodyZoom.value) - 10, 50, 200));
      syncBodyZoomLabel();
      if (tryOnBodyImg) drawTryOnPreview();
    };
  }

  if (opacity) {
    syncOpacityLabel();
    opacity.oninput = () => {
      syncOpacityLabel();
      if (tryOnBodyImg && tryOnDesignImg) drawTryOnPreview();
    };
  }

  stitchBtn.onclick = () => {
    if (!tryOnDesignImg) {
      alert("Upload your tattoo design first (step 1).");
      designInput?.click();
      return;
    }
    if (!tryOnBodyImg) {
      alert("Upload a photo of the body area (step 2).");
      bodyInput?.click();
      return;
    }
    const key = placement?.value || "custom";
    // Keep current drag position if user already moved it
    if (!tryOnOffset || (tryOnOffset.x === 0.5 && tryOnOffset.y === 0.5)) {
      tryOnOffset = { ...(TRYON_PLACEMENT_DEFAULTS[key] || TRYON_PLACEMENT_DEFAULTS.custom) };
    }
    stitchBtn.disabled = true;
    const originalLabel = stitchBtn.textContent;
    stitchBtn.textContent = "Updating…";
    try {
      drawTryOnPreview();
      if (typeof window.trackEvent === "function") {
        window.trackEvent("try_on_preview");
      }
    } finally {
      stitchBtn.disabled = false;
      stitchBtn.textContent = originalLabel;
    }
  };

  if (resetBtn) {
    resetBtn.onclick = () => {
      tryOnDesignImg = null;
      tryOnBodyImg = null;
      tryOnLastPreviewUrl = null;
      tryOnMeta = null;
      tryOnOffset = { x: 0.5, y: 0.5 };
      tryOnRotationDeg = 0;
      tryOnDragging = false;
      if (designInput) designInput.value = "";
      if (bodyInput) bodyInput.value = "";
      if (scale) scale.value = "35";
      if (opacity) opacity.value = "88";
      if (rotation) rotation.value = "0";
      if (wrapInput) wrapInput.value = "0";
      if (bodyZoom) bodyZoom.value = "100";
      const notes = document.getElementById("tryOnNotes");
      if (notes) notes.value = "";
      clearUploadCard("tryOnDesignCard", designPreview, "tryOnDesignLabel", "Sketch, flash, or reference");
      clearUploadCard("tryOnBodyCard", bodyPreview, "tryOnBodyLabel", "Arm, chest, leg — well lit");
      syncScaleLabel();
      syncOpacityLabel();
      syncRotationLabel();
      syncWrapLabel();
      syncBodyZoomLabel();
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      document.getElementById("tryOnPlaceholder")?.classList.remove("is-hidden");
      const actions = document.getElementById("tryOnActions");
      if (actions) actions.hidden = true;
      const dragHint = document.getElementById("tryOnDragHint");
      if (dragHint) dragHint.hidden = true;
      const mobileBar = document.getElementById("tryOnMobileBar");
      if (mobileBar) mobileBar.hidden = true;
      // reset chips
      chips?.querySelectorAll(".try-on-chip").forEach((c, i) => {
        c.classList.toggle("is-active", i === 0);
        c.setAttribute("aria-selected", i === 0 ? "true" : "false");
      });
      if (placement) placement.value = "forearm";
      updateTryOnSteps();
    };
  }

  // Drag design on canvas
  const getPos = (evt) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    };
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (!tryOnDesignImg || !tryOnBodyImg) return;
    tryOnDragging = true;
    canvas.setPointerCapture?.(e.pointerId);
    tryOnOffset = getPos(e);
    drawTryOnPreview();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!tryOnDragging) return;
    tryOnOffset = getPos(e);
    drawTryOnPreview();
  });
  const endDrag = () => {
    if (tryOnDragging) {
      tryOnDragging = false;
      drawTryOnPreview();
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  const doDownload = () => {
    if (!tryOnLastPreviewUrl) {
      alert("Create a preview first — upload design + photo.");
      return;
    }
    const a = document.createElement("a");
    a.href = tryOnLastPreviewUrl;
    a.download = `diamond-tip-tattoo-preview-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (typeof window.trackEvent === "function") {
      window.trackEvent("try_on_download");
    }
  };
  if (downloadBtn) downloadBtn.onclick = doDownload;
  if (mobileDownload) mobileDownload.onclick = doDownload;

  updateTryOnSteps();

  // Home canvas demo — real body + tattoo flash, rotate + wrap via same engine
  if (typeof window.initTryonHomeDemo === "function") {
    window.initTryonHomeDemo();
  }
};

/**
 * Home-page live preview: clean forearm + real rose flash,
 * animated with the same rotate + body-wrap renderer as the try-on tool.
 */
window.initTryonHomeDemo = function initTryonHomeDemo() {
  const canvas = document.getElementById("tryonHomeCanvas");
  if (!canvas || window.__tryonHomeDemoStarted) return;
  window.__tryonHomeDemoStarted = true;

  const ctx = canvas.getContext("2d");
  const cw = canvas.width;
  const ch = canvas.height;
  const badge = document.getElementById("tryonHomeBadge");
  const stepEls = document.querySelectorAll("#tryonDemoSteps > li");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const bodyImg = new Image();
  const designImg = new Image();
  bodyImg.decoding = "async";
  designImg.decoding = "async";
  bodyImg.src = "assets/tryon/body-forearm-clean.jpg";
  designImg.src = "assets/tryon/design-rose-flash.jpg";

  const loadImg = (img) =>
    new Promise((resolve, reject) => {
      if (img.complete && img.naturalWidth) return resolve(img);
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load try-on demo asset"));
    });

  const setStep = (index) => {
    stepEls.forEach((el, i) => el.classList.toggle("is-active", i === index));
    if (badge) {
      const labels = ["1 · Design", "2 · Body photo", "3 · Rotate & wrap", "4 · Book ready"];
      badge.textContent = labels[index] || labels[0];
    }
  };

  const drawBodyContain = (img, zoom = 1) => {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, cw, ch);
    const br = img.naturalWidth / img.naturalHeight;
    const cr = cw / ch;
    let baseW, baseH;
    if (br > cr) {
      baseW = cw;
      baseH = cw / br;
    } else {
      baseH = ch;
      baseW = ch * br;
    }
    const dw = baseW * zoom;
    const dh = baseH * zoom;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  };

  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  // smoothstep between a..b
  const seg = (t, a, b) => clamp01((t - a) / (b - a));

  const renderFrame = (phase) => {
    // phase 0..1 over full loop
    drawBodyContain(bodyImg, 1.05);

    // Timeline:
    // 0.00–0.18 body only
    // 0.18–0.38 design fades in flat
    // 0.38–0.62 rotate
    // 0.62–0.82 wrap increases
    // 0.82–1.00 hold settled
    let opacity = 0;
    let scale = 0.32;
    let rotDeg = -28;
    let wrap = 0;
    let cx = 0.52 * cw;
    let cy = 0.48 * ch;
    let step = 0;

    if (phase < 0.18) {
      step = 1;
      opacity = 0;
    } else if (phase < 0.38) {
      step = 1;
      const u = easeInOut(seg(phase, 0.18, 0.38));
      opacity = u * 0.92;
      scale = 0.22 + u * 0.14;
      rotDeg = -28;
      wrap = 0;
    } else if (phase < 0.62) {
      step = 2;
      const u = easeInOut(seg(phase, 0.38, 0.62));
      opacity = 0.92;
      scale = 0.36;
      rotDeg = -28 + u * 40; // -28 → +12
      wrap = u * 0.15;
      cy = (0.48 - u * 0.02) * ch;
    } else if (phase < 0.82) {
      step = 2;
      const u = easeInOut(seg(phase, 0.62, 0.82));
      opacity = 0.92;
      scale = 0.36 + u * 0.04;
      rotDeg = 12 - u * 6; // settle toward ~6°
      wrap = 0.15 + u * 0.55; // bend around forearm
      cy = 0.46 * ch;
    } else {
      step = 3;
      opacity = 0.92;
      scale = 0.4;
      rotDeg = 6;
      wrap = 0.7;
      cy = 0.46 * ch;
    }

    setStep(step);

    if (opacity > 0.02 && designImg.naturalWidth) {
      const maxSide = Math.min(cw, ch) * scale;
      const ir = designImg.naturalWidth / designImg.naturalHeight;
      let iw, ih;
      if (ir >= 1) {
        iw = maxSide;
        ih = maxSide / ir;
      } else {
        ih = maxSide;
        iw = maxSide * ir;
      }
      const rad = (rotDeg * Math.PI) / 180;
      drawWrappedDesign(ctx, designImg, cx, cy, iw, ih, rad, wrap, opacity);
    }

    // soft vignette
    const g = ctx.createLinearGradient(0, ch * 0.55, 0, ch);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  };

  Promise.all([loadImg(bodyImg), loadImg(designImg)])
    .then(() => {
      if (reduceMotion) {
        // Static settled frame
        drawBodyContain(bodyImg, 1.05);
        const maxSide = Math.min(cw, ch) * 0.4;
        const ir = designImg.naturalWidth / designImg.naturalHeight;
        let iw, ih;
        if (ir >= 1) {
          iw = maxSide;
          ih = maxSide / ir;
        } else {
          ih = maxSide;
          iw = maxSide * ir;
        }
        drawWrappedDesign(ctx, designImg, 0.52 * cw, 0.46 * ch, iw, ih, (6 * Math.PI) / 180, 0.7, 0.92);
        setStep(3);
        return;
      }

      let start = performance.now();
      const LOOP_MS = 9000;

      const tick = (now) => {
        // Pause animation when section far off-screen
        const section = document.getElementById("see-it-on-you");
        if (section) {
          const r = section.getBoundingClientRect();
          const visible = r.bottom > 0 && r.top < (window.innerHeight || 0) + 80;
          if (!visible) {
            requestAnimationFrame(tick);
            return;
          }
        }
        const phase = ((now - start) % LOOP_MS) / LOOP_MS;
        renderFrame(phase);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })
    .catch((err) => {
      console.warn("Try-on home demo assets failed:", err);
      if (badge) badge.textContent = "Try it on";
    });
};

// =============================================
// SCROLL JOURNEY UX — progress, parallax motifs
// =============================================
window.initScrollJourneyUX = function initScrollJourneyUX() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = window.matchMedia("(max-width: 820px)").matches || window.matchMedia("(pointer: coarse)").matches;
  const progressFill = document.querySelector(".scroll-progress-fill");
  const motifs = Array.from(document.querySelectorAll(".journey-motif"));
  const journeySections = Array.from(document.querySelectorAll(".journey-section[data-journey]"));
  let ticking = false;
  let lastTheme = "";

  // Stagger delay for dynamically injected portfolio/shop cards
  const applyStagger = (container) => {
    if (!container) return;
    Array.from(container.children).forEach((child, i) => {
      // Tighter stagger on mobile so cards don't feel delayed / empty
      const step = isMobile ? 0.03 : 0.05;
      child.style.transitionDelay = `${Math.min(i * step, isMobile ? 0.25 : 0.45)}s`;
    });
  };
  applyStagger(document.getElementById("portfolioGrid"));
  applyStagger(document.getElementById("shopGrid"));
  applyStagger(document.getElementById("specialtiesGrid"));
  applyStagger(document.getElementById("artistsGrid"));

  // Re-apply when grids re-render
  const mo = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      if (m.target && m.target.id) {
        applyStagger(m.target);
        // ensure newly injected cards animate in if section already visible
        const section = m.target.closest(".section, .fade-in, .slide-up");
        if (section && (section.classList.contains("visible") || section.classList.contains("is-inview"))) {
          m.target.querySelectorAll(":scope > *").forEach((el) => {
            el.style.opacity = "1";
            el.style.transform = "none";
          });
        }
      }
    });
  });
  ["portfolioGrid", "shopGrid", "specialtiesGrid", "artistsGrid", "blogGrid"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) mo.observe(el, { childList: true });
  });

  const update = () => {
    ticking = false;
    const scrollY = window.scrollY || window.pageYOffset;
    const docH = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const pct = Math.min(100, Math.max(0, (scrollY / docH) * 100));

    if (progressFill) {
      progressFill.style.width = pct + "%";
    }

    // Activate motifs gradually along scroll depth
    motifs.forEach((motif, i) => {
      const threshold = (i / Math.max(1, motifs.length - 1)) * 85;
      if (pct >= threshold - 5) motif.classList.add("is-active");
      // Skip continuous wobble/parallax on mobile & reduced-motion — feels janky
      if (!reduceMotion && !isMobile) {
        const speed = parseFloat(motif.dataset.parallax || "0.1");
        const y = scrollY * speed;
        const wobble = Math.sin((scrollY + i * 40) * 0.004) * 6;
        motif.style.transform = `translate3d(0, ${y * 0.15 + wobble}px, 0) rotate(${wobble * 0.4}deg)`;
      }
    });

    // Theme body class from most visible journey section
    let best = null;
    let bestScore = 0;
    const vh = window.innerHeight || 1;
    journeySections.forEach((sec) => {
      const r = sec.getBoundingClientRect();
      const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (visible > bestScore) {
        bestScore = visible;
        best = sec;
      }
    });
    const theme = best?.dataset?.journey || "";
    if (theme !== lastTheme) {
      document.body.classList.remove(
        "journey-theme-roses",
        "journey-theme-skulls",
        "journey-theme-guns",
        "journey-theme-smoke",
        "journey-theme-diamonds"
      );
      if (theme) document.body.classList.add(`journey-theme-${theme}`);
      lastTheme = theme;
    }
  };

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();
};

// =============================================
// MARKETING / CONVERSION UX
// Analytics hooks, sticky CTA, artist preselect, legal modals
// =============================================

/** Fire GA4 + Meta + Vercel Analytics events when scripts are present (safe no-ops otherwise) */
window.trackEvent = function trackEvent(name, params = {}) {
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params);
    }
    if (typeof window.fbq === "function") {
      // Map key events to Meta standard names when possible
      if (name === "booking_request" || name === "generate_lead") {
        window.fbq("track", "Lead", params);
      } else if (name === "cta_click") {
        window.fbq("trackCustom", "CTAClick", params);
      } else {
        window.fbq("trackCustom", name, params);
      }
    }
    // Vercel Web Analytics custom events (from @vercel/analytics inject)
    if (typeof window.vercelTrack === "function") {
      const flat = {};
      for (const [k, v] of Object.entries(params || {})) {
        if (v == null) continue;
        // Vercel only accepts string | number | boolean | null
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          flat[k] = v;
        } else {
          flat[k] = String(v);
        }
      }
      window.vercelTrack(name, Object.keys(flat).length ? flat : undefined);
    } else if (typeof window.va === "function") {
      window.va("event", { name, data: params });
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...params });
  } catch (e) {
    /* ignore analytics errors */
  }
};

window.trackConversion = function trackConversion(name, params = {}) {
  window.trackEvent(name, { ...params, transport_type: "beacon" });
  // GA4 recommended lead event alias
  if (name === "booking_request") {
    window.trackEvent("generate_lead", params);
  }
};

window.initMarketingUX = function initMarketingUX() {
  // Optional GA4 bootstrap if measurement ID exists and gtag not already loaded
  const measurementId = "G-SXX8SXNZHD";
  if (measurementId && !window.gtag) {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", measurementId, { anonymize_ip: true });
  }

  // CTA / outbound click tracking
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-track]");
    if (!el) return;
    window.trackEvent("cta_click", {
      cta_id: el.getAttribute("data-track"),
      href: el.getAttribute("href") || null
    });
  });

  // Artist "Book with X" → preselect preferred artist
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-artist-pref]");
    if (!btn) return;
    const pref = btn.getAttribute("data-artist-pref");
    const select = document.getElementById("bookingArtist");
    if (select && pref) {
      const match = Array.from(select.options).find((o) => o.value === pref || o.value.includes(pref));
      if (match) select.value = match.value;
      else {
        // try first name match
        const first = pref.split(" ")[0];
        const m2 = Array.from(select.options).find((o) => o.value.includes(first));
        if (m2) select.value = m2.value;
      }
    }
  });

  // Sticky mobile book bar — show after scroll, hide on booking section / modals
  const sticky = document.getElementById("stickyBookBar");
  const bookSection = document.getElementById("book");
  if (sticky) {
    const updateSticky = () => {
      const scrolled = window.scrollY > 420;
      const bookVisible = bookSection && (() => {
        const r = bookSection.getBoundingClientRect();
        return r.top < window.innerHeight * 0.75 && r.bottom > 80;
      })();
      const modalOpen = document.body.classList.contains("modal-open");
      sticky.hidden = !scrolled || bookVisible || modalOpen;
    };
    window.addEventListener("scroll", updateSticky, { passive: true });
    window.addEventListener("resize", updateSticky, { passive: true });
    updateSticky();
  }

  // Booking success → book another
  const successClose = document.getElementById("bookingSuccessClose");
  if (successClose) {
    successClose.addEventListener("click", () => {
      const form = document.getElementById("bookingForm");
      const success = document.getElementById("bookingSuccess");
      if (success) success.hidden = true;
      if (form) {
        form.hidden = false;
        form.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  // Messenger handoff buttons (form data incl. email → Page chat)
  const openMessengerBtn = document.getElementById("openMessengerBtn");
  if (openMessengerBtn) {
    openMessengerBtn.addEventListener("click", async () => {
      const result = await sendFormDataToMessenger(window.__lastMessengerFormText || "", { open: true });
      updateMessengerSuccessUI({
        copied: result.copied,
        text: window.__lastMessengerFormText || ""
      });
      if (!result.opened) {
        window.location.href = STUDIO_MESSENGER_URL;
      }
    });
  }
  const copyMessengerDetailsBtn = document.getElementById("copyMessengerDetailsBtn");
  if (copyMessengerDetailsBtn) {
    copyMessengerDetailsBtn.addEventListener("click", async () => {
      const text = window.__lastMessengerFormText || "";
      const ok = text ? await copyTextToClipboard(text) : false;
      const status = document.getElementById("messengerCopyStatus");
      if (status) {
        status.textContent = ok
          ? "Copied again — paste into Facebook Messenger and send."
          : "Could not copy automatically — select the text in the box below and copy manually.";
      }
      const preview = document.getElementById("messengerMessagePreview");
      if (preview && text) {
        preview.value = text;
        preview.hidden = false;
        preview.focus();
        preview.select();
      }
    });
  }

  // Modal helpers
  const openModal = (id) => {
    const m = document.getElementById(id);
    if (!m) return;
    m.style.display = "flex";
    m.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  };
  const closeModal = (id) => {
    const m = document.getElementById(id);
    if (!m) return;
    m.style.display = "none";
    m.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  };

  const wireModal = (openIds, modalId, closeIds) => {
    (Array.isArray(openIds) ? openIds : [openIds]).forEach((oid) => {
      const o = document.getElementById(oid);
      if (o) o.addEventListener("click", (e) => { e.preventDefault(); openModal(modalId); });
    });
    (Array.isArray(closeIds) ? closeIds : [closeIds]).forEach((cid) => {
      const c = document.getElementById(cid);
      if (c) c.addEventListener("click", () => closeModal(modalId));
    });
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal(modalId);
      });
    }
  };

  wireModal("openAftercareBtn", "aftercareModal", ["closeAftercareBtn", "aftercareDoneBtn"]);
  // Full legal pages live at /legal/* — footer links navigate there (no preventDefault).
  // Keep modals for any legacy in-page triggers that still call openModal.
  wireModal([], "privacyModal", "closePrivacyBtn");
  wireModal([], "termsModal", "closeTermsBtn");

  const aftercareToShop = document.getElementById("aftercareToShop");
  if (aftercareToShop) {
    aftercareToShop.addEventListener("click", () => closeModal("aftercareModal"));
  }

  // Legacy hashes → full policy pages
  if (location.hash === "#privacy") {
    window.location.replace("legal/privacy-policy.html");
    return;
  }
  if (location.hash === "#terms") {
    window.location.replace("legal/terms-and-conditions.html");
    return;
  }
};

// Boot marketing UX after main DOM ready (module loads after parse)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => window.initMarketingUX());
} else {
  window.initMarketingUX();
}
