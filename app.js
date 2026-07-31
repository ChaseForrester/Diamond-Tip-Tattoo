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
    name: "STEVEN BENN",
    role: "Owner / Studio Master",
    image: "assets/artists/steven-benn.png",
    bio: "Owner of Diamond Tip Tattoo in Dapto. Decades of custom ink, realism, black & grey, and client-first studio craft. Known for high-impact portraits, animals, and full custom pieces.",
    tags: ["Realism", "Black & Grey", "Custom Design"]
  },
  {
    id: "scotty",
    name: "SCOTTY",
    role: "Tattooist",
    image: "assets/artists/scotty.png",
    bio: "Resident tattooist at Diamond Tip Tattoo. Clean linework, bold blackwork, and custom designs with a steady, professional studio approach.",
    tags: ["Blackwork", "Custom", "Linework"]
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
  artistsGrid.innerHTML = list.map(art => `
    <article class="artist-card artist-profile-card" data-artist="${art.id || ""}">
      <img src="${art.image}" alt="${art.name}">
      <div class="artist-info">
        <h3>${art.name}</h3>
        <p class="role">${art.role || ""}</p>
        ${art.bio ? `<p class="artist-bio">${art.bio}</p>` : ""}
        ${Array.isArray(art.tags) && art.tags.length ? `
          <ul class="artist-tags">${art.tags.map(t => `<li>${t}</li>`).join("")}</ul>
        ` : ""}
        <a href="#book" class="explore">BOOK WITH ${(art.name || "").split(" ")[0]} &rarr;</a>
      </div>
    </article>
  `).join("");
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
  if (!portfolioGrid) return;

  const normalized = (items || []).map(normalizePortfolioItem).filter(i => i.src);
  const visible = filter === "all" ? normalized : normalized.filter(i => i.category === filter);

  if (visible.length === 0) {
    portfolioGrid.innerHTML = `<p class="portfolio-empty">No pieces in this category yet.</p>`;
    return;
  }

  portfolioGrid.innerHTML = visible.map((item, index) => `
    <figure class="portfolio-item" data-category="${item.category}" style="--smoke-delay: ${(index % 6) * 0.35}s">
      <div class="portfolio-smoke" aria-hidden="true">
        <span class="p-smoke"></span>
        <span class="p-smoke"></span>
        <span class="p-smoke"></span>
      </div>
      <img src="${item.src}" alt="${item.alt}" loading="lazy">
      <figcaption class="portfolio-caption">
        <span class="portfolio-cat-tag">${portfolioCategoryLabels[item.category] || item.category}</span>
        <span class="portfolio-title">${item.alt}</span>
      </figcaption>
    </figure>
  `).join("");
}

function initPortfolioFilters() {
  const filterBar = document.getElementById("portfolioFilters");
  if (!filterBar) return;

  filterBar.querySelectorAll("[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      filterBar.querySelectorAll("[data-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activePortfolioFilter = btn.getAttribute("data-filter") || "all";
      renderPortfolioGrid(dbPortfolio, activePortfolioFilter);
    });
  });
}

const defaultFaqs = [
  { id: "faq1", question: "How do I book an appointment?", answer: "Fill out the booking form to request a consultation." },
  { id: "faq2", question: "How much will my tattoo cost?", answer: "Cost depends on size and detail. We will provide an estimate after consultation." },
  { id: "faq3", question: "How long will my tattoo take?", answer: "Sessions can vary from 1 hour to full days." },
  { id: "faq4", question: "Do you offer touch-ups?", answer: "Yes, we offer complimentary touch-ups within 6 months." },
  { id: "faq5", question: "Is the studio private?", answer: "Yes, we operate by appointment only in a private setting." }
];

// Aftercare & studio supplies (Coles / Woolworths / Chemist Warehouse style stock)
const defaultShopProducts = [
  { id: "prod_spf50-sunscreen", name: "SPF 50+ Sunscreen", price: 18.50, image: "assets/products/spf50-sunscreen.jpg", description: "Broad-spectrum face & body sunscreen for healing ink. Chemist Warehouse / Coles style staple." },
  { id: "prod_nitrile-gloves", name: "Black Nitrile Gloves (Box 100)", price: 24.00, image: "assets/products/nitrile-gloves.jpg", description: "Powder-free black nitrile gloves — studio hygiene essential." },
  { id: "prod_gentle-soap", name: "Fragrance-Free Liquid Soap", price: 8.90, image: "assets/products/gentle-soap.jpg", description: "Gentle pH-balanced cleanser for washing fresh tattoos safely." },
  { id: "prod_healing-ointment", name: "Healing Ointment Tube", price: 12.50, image: "assets/products/healing-ointment.jpg", description: "Thick protective ointment for the first days of tattoo aftercare. Chemist-aisle favourite." },
  { id: "prod_aloe-vera-gel", name: "Aloe Vera Gel", price: 9.90, image: "assets/products/aloe-vera-gel.jpg", description: "Cooling pure aloe gel to soothe irritated skin during healing." },
  { id: "prod_hand-sanitizer", name: "Alcohol-Free Hand Sanitiser", price: 7.50, image: "assets/products/hand-sanitizer.jpg", description: "Moisturising hand sanitiser for clients and studio use." },
  { id: "prod_gauze-roll", name: "Sterile Gauze Roll", price: 5.50, image: "assets/products/gauze-roll.jpg", description: "Medical-grade gauze for aftercare wraps and blotting." },
  { id: "prod_moisturising-cream", name: "Fragrance-Free Moisturising Cream", price: 14.90, image: "assets/products/moisturising-cream.jpg", description: "Rich cream for dry healing skin once the tattoo has settled." },
  { id: "prod_micropore-tape", name: "Medical Micropore Tape", price: 6.20, image: "assets/products/micropore-tape.jpg", description: "Breathable paper tape for securing wraps without tearing skin." },
  { id: "prod_cotton-pads", name: "Cotton Rounds Pack", price: 4.50, image: "assets/products/cotton-pads.jpg", description: "Soft cotton pads for gentle cleansing — Coles / Woolies aisle." },
  { id: "prod_lip-balm", name: "Healing Lip Balm", price: 5.00, image: "assets/products/lip-balm.jpg", description: "Fragrance-free balm for lip tattoos and general dryness." },
  { id: "prod_antiseptic-liquid", name: "Antiseptic Liquid", price: 11.90, image: "assets/products/antiseptic-liquid.jpg", description: "Pharmacy antiseptic for studio prep and minor skin care." },
  { id: "prod_vitamin-e-cream", name: "Vitamin E Skin Cream", price: 10.50, image: "assets/products/vitamin-e-cream.jpg", description: "Vitamin E cream to support soft, hydrated healed skin." },
  { id: "prod_paper-towels", name: "Absorbent Paper Towels", price: 4.20, image: "assets/products/paper-towels.jpg", description: "Lint-conscious paper towels for studio and home aftercare." },
  { id: "prod_cling-wrap", name: "Cling Wrap Roll", price: 3.80, image: "assets/products/cling-wrap.jpg", description: "Food-grade cling wrap for initial tattoo covering after sessions." },
  { id: "prod_antibacterial-wipes", name: "Antibacterial Wipes Pack", price: 6.90, image: "assets/products/antibacterial-wipes.jpg", description: "Fragrance-aware wipes for surfaces and kit bags. Chemist style." },
  { id: "prod_liquid-bandage", name: "Liquid Bandage", price: 13.50, image: "assets/products/liquid-bandage.jpg", description: "Brush-on protective film for small healed areas needing cover." },
  { id: "prod_ink-heal-balm", name: "Ink Heal Balm Tin", price: 22.00, image: "assets/products/ink-heal-balm.jpg", description: "Studio-favourite healing balm tin — thick, clean, fragrance-free." },
  { id: "prod_saline-wound-wash", name: "Saline Wound Wash Spray", price: 9.50, image: "assets/products/saline-wound-wash.jpg", description: "Sterile saline spray for gentle rinsing of fresh work." }
];

function renderShopGrid(products) {
  const shopGrid = document.getElementById("shopGrid");
  if (!shopGrid) return;

  if (!products || products.length === 0) {
    shopGrid.innerHTML = `<p style="color: var(--text-secondary);">Check back soon for studio aftercare and merchandise!</p>`;
    return;
  }

  shopGrid.innerHTML = products.map(prod => `
    <div class="shop-card">
      <div class="product-image-wrap">
        <img src="${prod.image || "assets/products/ink-heal-balm.jpg"}" alt="${prod.name}" loading="lazy">
      </div>
      <div class="shop-card-content">
        <h3>${prod.name}</h3>
        <p>${prod.description || ""}</p>
        <div class="shop-price">$${Number(prod.price).toFixed(2)}</div>
        <a href="#portal/browse-shop" class="btn btn-solid" style="width: 100%; display: block; text-align: center;">ORDER FOR PICKUP</a>
      </div>
    </div>
  `).join("");
}

function shopHasCuratedProducts(items) {
  return Array.isArray(items) && items.some(p =>
    typeof (p.image || "") === "string" && (p.image || "").includes("assets/products/")
  );
}

document.addEventListener("DOMContentLoaded", () => {
    // Intro Loader Dismissal
    const loader = document.getElementById('introLoader');
    if (loader) {
        setTimeout(() => {
            loader.classList.add('fade-out');
            document.body.classList.add('page-ready');
            setTimeout(() => {
                loader.style.display = 'none';
            }, 800);
        }, 3000);
    }

    // Mobile Hamburger Menu Toggle
    const menuToggle = document.getElementById('menuToggleBtn');
    const navLinks = document.getElementById('navbarLinks');
    if (menuToggle && navLinks) {
        menuToggle.onclick = () => {
            menuToggle.classList.toggle('open');
            navLinks.classList.toggle('open');
        };

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                menuToggle.classList.remove('open');
                navLinks.classList.remove('open');
            });
        });

        // Close drawer when action buttons are clicked
        navLinks.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                menuToggle.classList.remove('open');
                navLinks.classList.remove('open');
            });
        });
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
        title: "EXPERT TATTOOS<br>& PIERCINGS",
        bgText: "TATTOOS",
        mainImg: "assets/tattoo_model_main.png",
        teaserImg: "assets/tattoo_model_secondary.png",
        location: "Diamond Tip Tattoo, Dapto",
        actionText1: "SCHEDULE AN APPOINTMENT",
        actionText2: "OUR SERVICES",
        actionLink1: "#book",
        actionLink2: "#specialties"
      },
      {
        title: "FINE LINE<br>& REALISM",
        bgText: "FINE LINE",
        mainImg: "assets/portfolio/realism/realism_bear-wolf-landscape.jpg",
        teaserImg: "assets/portfolio/fineline/fineline_butterfly-florals.jpg",
        location: "Masters of Fine Line",
        actionText1: "MEET OUR ARTISTS",
        actionText2: "VIEW PORTFOLIO",
        actionLink1: "#artists",
        actionLink2: "#portfolio"
      },
      {
        title: "CUSTOM INK<br>& DESIGNS",
        bgText: "CUSTOM INK",
        mainImg: "assets/portfolio/custom/custom_neotrad-oni.jpg",
        teaserImg: "assets/portfolio/custom/custom_japanese-pagoda.jpg",
        location: "Unique To You",
        actionText1: "BOOK CONSULTATION",
        actionText2: "READ OUR PROCESS",
        actionLink1: "#book",
        actionLink2: "#process"
      },
      {
        title: "UNCOMPROMISING<br>QUALITY",
        bgText: "STUDIO",
        mainImg: "assets/portfolio/realism/realism_joker-clown-faces.jpg",
        teaserImg: "assets/portfolio/blackgrey/blackgrey_skull-backpiece.jpg",
        location: "Diamond Tip Tattoo",
        actionText1: "SHOP AFTERCARE",
        actionText2: "VISIT OUR BLOG",
        actionLink1: "#shop",
        actionLink2: "#blog"
      }
    ];

    let currentSlideIndex = 0;
    let isTransitioning = false;
    let sliderTimer = null;

    function initSlider() {
        if (!homeHeader) return;
        
        // Trigger initial slide reveal transition after page load
        setTimeout(() => {
            homeHeader.classList.add('slide-in');
        }, 3100); // Trigger after intro loader fades out

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
                sliderAction1.href = slide.actionLink1;
            }
            if (sliderAction2) {
                sliderAction2.textContent = slide.actionText2;
                sliderAction2.href = slide.actionLink2;
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


    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-in, .slide-up').forEach((el) => observer.observe(el));

    // Show curated specialties + portfolio + artists immediately (before Firebase responds)
    renderSpecialtiesGrid(defaultSpecialties);
    renderArtistsGrid(defaultArtists);
    dbPortfolio = defaultPortfolio;
    renderPortfolioGrid(dbPortfolio, activePortfolioFilter);
    initPortfolioFilters();
    initTattooTryOn();

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

            if (!date || !time) {
                alert("Please select a preferred date and available time slot on the calendar.");
                bookingSubmitBtn.disabled = false;
                bookingSubmitBtn.textContent = "REQUEST CONSULTATION";
                return;
            }

            try {
                // 1. Create a Booking ID first
                const bookingRef = doc(collection(db, "bookings"));
                const bookingId = bookingRef.id;

                const uploadedUrls = [];

                // Attach AI generated tattoo if present
                if (aiGeneratedTattooUrl) {
                    uploadedUrls.push(aiGeneratedTattooUrl);
                }

                // 2. Upload Reference Images to Storage
                if (selectedBookingFiles.length > 0) {
                    uploadProgressContainer.style.display = 'block';
                    let totalBytes = selectedBookingFiles.reduce((acc, f) => acc + f.size, 0);
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
                                    const percent = Math.min(Math.round((uploadedBytes / totalBytes) * 100), 99);
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
                }

                // 3. Save booking details to Firestore
                const bookingData = {
                    id: bookingId,
                    name,
                    email,
                    phone,
                    date,
                    time,
                    style,
                    idea,
                    referenceImages: uploadedUrls,
                    createdAt: new Date().toISOString(),
                    status: "Pending",
                    assignedArtist: "Unassigned",
                    internalNotes: "",
                    userId: currentUser ? currentUser.uid : null
                };

                await setDoc(bookingRef, bookingData);

                // Success State
                alert("Thank you! Your private consultation request has been submitted. We will review and contact you shortly.");
                bookingForm.reset();
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
                alert("Failed to submit booking: " + err.message);
            } finally {
                bookingSubmitBtn.disabled = false;
                bookingSubmitBtn.textContent = "REQUEST CONSULTATION";
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
            const adminEmails = [
                'stormychaseforrester@gmail.com',
                'stormyforrester@gmail.com',
                'chaseforrester@gmail.com',
                'hello@diamondtiptattoo.com'
            ];
            if (adminDoc.exists() || adminEmails.includes(user.email.toLowerCase())) {
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
    const tryOnEl = document.getElementById('try-on');
    if (tryOnEl) tryOnEl.style.display = 'none';
    const findUsEl = document.getElementById('find-us');
    if (findUsEl) findUsEl.style.display = 'none';
    document.getElementById('info').style.display = 'none';
    document.querySelector('footer').style.display = 'none';
    document.querySelector('.features-bar').style.display = 'none';
    document.querySelector('.sterilization-bar').style.display = 'none';

    // Hide navbar elements
    const navLinks = document.getElementById('navbarLinks');
    if (navLinks) navLinks.style.display = 'none';
    const bookNavBtn = document.getElementById('bookNavBtn');
    if (bookNavBtn) bookNavBtn.style.display = 'none';

    // Show Portal
    document.getElementById('portalSection').style.display = 'block';
    
    // Default tab
    switchPortalTab('my-bookings');
}

function exitPortal() {
    // Show standard site sections
    document.getElementById('home').style.display = 'block';
    document.getElementById('specialties').style.display = 'block';
    document.getElementById('artists').style.display = 'block';
    document.getElementById('portfolio').style.display = 'block';
    document.getElementById('process').style.display = 'block';
    const blogEl = document.getElementById('blog');
    if (blogEl) blogEl.style.display = 'block';
    const shopEl = document.getElementById('shop');
    if (shopEl) shopEl.style.display = 'block';
    const tryOnEl = document.getElementById('try-on');
    if (tryOnEl) tryOnEl.style.display = 'block';
    const findUsEl = document.getElementById('find-us');
    if (findUsEl) findUsEl.style.display = 'block';
    document.getElementById('info').style.display = 'grid';
    document.querySelector('footer').style.display = 'block';
    document.querySelector('.features-bar').style.display = 'flex';
    document.querySelector('.sterilization-bar').style.display = 'flex';

    // Show navbar elements
    const navLinks = document.getElementById('navbarLinks');
    if (navLinks) navLinks.style.display = 'flex';
    const bookNavBtn = document.getElementById('bookNavBtn');
    if (bookNavBtn) bookNavBtn.style.display = 'block';

    // Hide Portal
    document.getElementById('portalSection').style.display = 'none';
}

window.switchPortalTab = function(tabId) {
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

            // Seed Admin emails
            await setDoc(doc(db, "admins", "stormychaseforrester@gmail.com"), { role: "super_admin" });
            await setDoc(doc(db, "admins", "stormyforrester@gmail.com"), { role: "super_admin" });
            await setDoc(doc(db, "admins", "chaseforrester@gmail.com"), { role: "super_admin" });
            await setDoc(doc(db, "admins", "hello@diamondtiptattoo.com"), { role: "super_admin" });

            // Seed Default Blogs
            const defaultBlogs = [
                {
                    title: "Aftercare: How to Heal Your Tattoo Perfectly",
                    author: "Steven Benn",
                    image: "assets/tattoo_workspace_1781911831357.png",
                    content: "Taking care of your new tattoo is just as important as the tattooing process itself. Keep it clean, use premium vegan aftercare cream, avoid long soaking in water, and protect it from direct sunlight. Your skin notes are valuable here!",
                    createdAt: new Date().toISOString()
                },
                {
                    title: "Tattoo Placements: Finding the Perfect Spot",
                    author: "Scotty",
                    image: "assets/tattoo_artist_1781911870037.png",
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
                btn.onclick = function() {
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

window.selectCalendarDate = function(dateString) {
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

window.openBookingModal = function(bookingId) {
    const booking = dbBookings.find(b => b.id === bookingId);
    if (!booking) return;

    activeBookingId = bookingId;

    document.getElementById('modalBookingClient').textContent = booking.name;
    document.getElementById('modalBookingId').textContent = `ID: ${booking.id}`;
    document.getElementById('mBookingEmail').textContent = booking.email;
    document.getElementById('mBookingPhone').textContent = booking.phone || 'Not provided';
    document.getElementById('mBookingDate').textContent = booking.date || 'Flexible';
    document.getElementById('mBookingStyle').textContent = booking.style;
    document.getElementById('mBookingIdea').textContent = booking.idea;

    const imagesGrid = document.getElementById('mBookingImagesGrid');
    const container = document.getElementById('mBookingImagesContainer');
    
    if (booking.referenceImages && booking.referenceImages.length > 0) {
        container.style.display = 'block';
        imagesGrid.innerHTML = booking.referenceImages.map(img => `
            <div class="file-preview-item" style="cursor: pointer;" onclick="window.open('${img}', '_blank')">
                <img src="${img}" alt="Reference Work">
            </div>
        `).join('');
    } else {
        container.style.display = 'none';
        imagesGrid.innerHTML = '';
    }

    // Set dropdown selections
    document.getElementById('mBookingStatusSelect').value = booking.status;
    document.getElementById('mBookingArtistSelect').value = booking.assignedArtist;
    document.getElementById('mBookingNotes').value = booking.internalNotes || '';

    // Show modal
    document.getElementById('bookingModal').style.display = 'flex';
}

window.closeBookingModal = function() {
    document.getElementById('bookingModal').style.display = 'none';
    activeBookingId = null;
}

// Update Booking details in Firestore
window.saveBookingDetails = async function() {
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
window.deleteCMSPortfolioImage = async function(index) {
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

window.openFaqModal = function(faqId = null) {
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

window.closeFaqModal = function() {
    document.getElementById('faqModal').style.display = 'none';
    activeFaqId = null;
}

// Save FAQ (Create or Update)
window.saveFaqItem = async function() {
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
window.deleteFaqItem = async function() {
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

window.handleRouting = function() {
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
    let titleText = "Diamond Tip Tattoo | Private Tattoo Studio Dapto";
    let descText = "Private tattoo studio for custom work of uncompromising quality. Fine art on skin, crafted to last a lifetime in Dapto.";
    let keywordsText = "tattoo, Dapto, fine line, realism, custom design";

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

    document.title = titleText;
    const titleEl = document.getElementById('seoTitle');
    if (titleEl) titleEl.textContent = titleText;
    const descMeta = document.getElementById('seoDesc');
    if (descMeta) descMeta.setAttribute('content', descText);
    const keywordsMeta = document.getElementById('seoKeywords');
    if (keywordsMeta) keywordsMeta.setAttribute('content', keywordsText);
}

// Client Skin Notes
window.loadClientSkinNotes = async function() {
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

window.saveSkinNotes = async function() {
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

window.setupGiftCardForm = function() {
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

window.loadClientGiftCards = async function() {
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

window.loadClientShopProducts = async function() {
    const portalShopGrid = document.getElementById('portalShopGrid');
    if (!portalShopGrid) return;

    const renderPortal = (products) => {
        window.dbProducts = products.map(p => ({ ...p }));
        if (!products.length) {
            portalShopGrid.innerHTML = `<p style="color: var(--text-secondary);">No shop products found.</p>`;
            return;
        }
        portalShopGrid.innerHTML = products.map(prod => {
            const id = prod.id || prod.name;
            const safeName = String(prod.name || "").replace(/'/g, "\\'");
            return `
                <div class="shop-card">
                    <div class="product-image-wrap">
                        <img src="${prod.image || "assets/products/ink-heal-balm.jpg"}" alt="${prod.name}">
                    </div>
                    <div class="shop-card-content">
                        <h3>${prod.name}</h3>
                        <p>${prod.description || ""}</p>
                        <div class="shop-price">$${Number(prod.price).toFixed(2)}</div>
                        <button class="btn btn-solid" style="width: 100%;" onclick="buyProductSimulated('${id}', '${safeName}')">BUY NOW</button>
                    </div>
                </div>
            `;
        }).join("");
    };

    renderPortal(defaultShopProducts);

    try {
        const snap = await getDocs(collection(db, "products"));
        const cmsProducts = [];
        snap.forEach(d => cmsProducts.push({ id: d.id, ...d.data() }));
        if (shopHasCuratedProducts(cmsProducts) && cmsProducts.length >= 8) {
            renderPortal(cmsProducts);
        }
    } catch (e) {
        console.error(e);
    }
}

window.buyProductSimulated = function(prodId, prodName) {
    alert(`Simulated Order Registered!\nYou have purchased: ${prodName}.\nYour order is ready for in-studio pickup.`);
}

window.loadShopWebsite = async function() {
    const shopGrid = document.getElementById('shopGrid');
    if (!shopGrid) return;

    // Show curated local shop immediately
    renderShopGrid(defaultShopProducts);

    try {
        const snap = await getDocs(collection(db, "products"));
        const cmsProducts = [];
        snap.forEach(d => cmsProducts.push({ id: d.id, ...d.data() }));

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
    }
}

// Blog Articles Website
window.dbBlogs = [];

window.loadBlogWebsite = async function() {
    const blogGrid = document.getElementById('blogGrid');
    if (!blogGrid) return;

    try {
        const snap = await getDocs(query(collection(db, "blogs"), orderBy("createdAt", "desc")));
        window.dbBlogs = [];
        if (snap.empty) {
            blogGrid.innerHTML = `<p style="color: var(--text-secondary);">Check back soon for updates and stories from Diamond Tip.</p>`;
            return;
        }

        let html = '';
        snap.forEach(d => {
            const blog = d.data();
            window.dbBlogs.push({ id: d.id, ...blog });
            const dateStr = new Date(blog.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            
            html += `
                <div class="blog-card">
                    <img src="${blog.image || 'assets/tattoo_workspace_1781911831357.png'}" alt="${blog.title}">
                    <div class="blog-card-content">
                        <div class="blog-meta">${dateStr} | BY ${blog.author}</div>
                        <h3>${blog.title}</h3>
                        <p>${blog.content.substring(0, 120)}...</p>
                        <a href="#blog" class="explore" onclick="alert('Article:\\n\\n' + \`${blog.title}\\n\\n\` + \`${blog.content}\`); return false;">READ MORE &rarr;</a>
                    </div>
                </div>
            `;
        });
        blogGrid.innerHTML = html;
    } catch (e) {
        console.error(e);
    }
}

// Live Chat real-time sync (Client-side)
window.chatUnsubscribe = null;
window.chatSessionId = null;
window.chatSessionName = null;
window.chatSessionEmail = null;

window.setupLiveChat = function() {
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

window.loadChatCrm = async function() {
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

window.selectAdminChatThread = function(chatId) {
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

window.sendAdminReply = async function() {
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

window.loadClientDatabase = async function() {
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

window.selectClientForDbView = async function(clientId) {
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

window.saveAdminClientNotes = async function(clientId) {
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
window.renderCMSBlogs = function() {
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

window.openBlogModal = function(blogId = null) {
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

window.closeBlogModal = function() {
    document.getElementById('blogModal').style.display = 'none';
    window.activeBlogId = null;
}

window.saveBlogItem = async function() {
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

window.deleteBlogItem = async function() {
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
window.renderCMSProducts = function() {
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

window.openProductModal = function(prodId = null) {
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

window.closeProductModal = function() {
    document.getElementById('productModal').style.display = 'none';
    window.activeProductId = null;
}

window.saveProductItem = async function() {
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

window.deleteProductItem = async function() {
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
window.loadSeoSettings = async function() {
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

window.saveSeoItem = async function(e) {
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

window.fetchCMSDataCache = async function() {
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
window.initPublicBookingCalendar = function() {
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

window.renderPublicBookingCalendar = function() {
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
    today.setHours(0,0,0,0);
    
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

window.selectPublicCalendarDate = function(dateString) {
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

window.renderPublicTimeSlots = async function(dateString) {
    const slotsGrid = document.getElementById('pubTimeSlotsGrid');
    if (!slotsGrid) return;
    
    slotsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 1rem;">
            <div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
            <span style="font-size: 0.85rem; color: var(--text-secondary);">Checking availability...</span>
        </div>
    `;
    
    const slots = ["10:00 AM", "11:30 AM", "1:00 PM", "2:30 PM", "4:00 PM", "5:30 PM"];
    
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

window.selectPublicTimeSlot = function(timeString) {
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
window.initAiTattooStudio = function() {
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
let tryOnLastPreviewUrl = null;

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

function drawTryOnPreview() {
  const canvas = document.getElementById("tryOnCanvas");
  if (!canvas || !tryOnBodyImg) return;
  const ctx = canvas.getContext("2d");
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);

  // Fit body photo cover-style
  const br = tryOnBodyImg.width / tryOnBodyImg.height;
  const cr = cw / ch;
  let dw, dh, dx, dy;
  if (br > cr) {
    dh = ch;
    dw = ch * br;
    dx = (cw - dw) / 2;
    dy = 0;
  } else {
    dw = cw;
    dh = cw / br;
    dx = 0;
    dy = (ch - dh) / 2;
  }
  ctx.drawImage(tryOnBodyImg, dx, dy, dw, dh);

  if (tryOnDesignImg) {
    const scalePct = Number(document.getElementById("tryOnScale")?.value || 35) / 100;
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
    const cx = tryOnOffset.x * cw;
    const cy = tryOnOffset.y * ch;

    ctx.save();
    // Soft blend so ink sits on skin
    ctx.globalAlpha = 0.88;
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(tryOnDesignImg, cx - iw / 2, cy - ih / 2, iw, ih);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.35;
    ctx.drawImage(tryOnDesignImg, cx - iw / 2, cy - ih / 2, iw, ih);
    ctx.restore();

    // Placement ring guide
    ctx.save();
    ctx.strokeStyle = "rgba(230,57,70,0.55)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(cx - iw / 2 - 4, cy - ih / 2 - 4, iw + 8, ih + 8);
    ctx.restore();
  }

  const placeholder = document.getElementById("tryOnPlaceholder");
  const actions = document.getElementById("tryOnActions");
  if (placeholder) placeholder.style.display = "none";
  if (actions) actions.hidden = false;
  tryOnLastPreviewUrl = canvas.toDataURL("image/png");
}

window.initTattooTryOn = function initTattooTryOn() {
  const designInput = document.getElementById("tryOnDesignFile");
  const bodyInput = document.getElementById("tryOnBodyFile");
  const designPreview = document.getElementById("tryOnDesignPreview");
  const bodyPreview = document.getElementById("tryOnBodyPreview");
  const placement = document.getElementById("tryOnPlacement");
  const scale = document.getElementById("tryOnScale");
  const stitchBtn = document.getElementById("tryOnStitchBtn");
  const downloadBtn = document.getElementById("tryOnDownloadBtn");
  const canvas = document.getElementById("tryOnCanvas");

  if (!designInput || !bodyInput || !stitchBtn || !canvas) return;

  designInput.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      tryOnDesignImg = await loadImageFromFile(file);
      previewFileInLabel(file, designPreview);
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
      drawTryOnPreview();
    } catch (err) {
      alert(err.message);
    }
  };

  if (placement) {
    placement.onchange = () => {
      const key = placement.value;
      tryOnOffset = { ...(TRYON_PLACEMENT_DEFAULTS[key] || TRYON_PLACEMENT_DEFAULTS.custom) };
      if (tryOnBodyImg && tryOnDesignImg) drawTryOnPreview();
    };
  }

  if (scale) {
    scale.oninput = () => {
      if (tryOnBodyImg && tryOnDesignImg) drawTryOnPreview();
    };
  }

  stitchBtn.onclick = async () => {
    if (!tryOnDesignImg) {
      alert("Please upload your tattoo idea / design image first.");
      return;
    }
    if (!tryOnBodyImg) {
      alert("Please upload a photo of the body area where you want the tattoo.");
      return;
    }
    const key = placement?.value || "custom";
    tryOnOffset = { ...(TRYON_PLACEMENT_DEFAULTS[key] || TRYON_PLACEMENT_DEFAULTS.custom) };
    stitchBtn.disabled = true;
    const originalLabel = stitchBtn.textContent;
    stitchBtn.textContent = "STITCHING...";

    try {
      // Optional AI placement tip via Gemini (non-blocking if it fails)
      const notes = document.getElementById("tryOnNotes")?.value?.trim() || "";
      try {
        if (geminiModel && notes) {
          // soft nudge only — visual stitch is canvas-based
          console.log("Try-on notes for consultation:", notes, "placement:", key);
        }
      } catch (_) { /* ignore */ }

      drawTryOnPreview();
    } finally {
      stitchBtn.disabled = false;
      stitchBtn.textContent = originalLabel;
    }
  };

  // Drag design on canvas
  const getPos = (evt) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
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
  const endDrag = () => { tryOnDragging = false; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  if (downloadBtn) {
    downloadBtn.onclick = () => {
      if (!tryOnLastPreviewUrl) {
        alert("Create a preview first.");
        return;
      }
      const a = document.createElement("a");
      a.href = tryOnLastPreviewUrl;
      a.download = `diamond-tip-tattoo-preview-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
  }

  // Attach preview to booking when using Book With This Idea
  const bookLink = document.querySelector('#tryOnActions a[href="#book"]');
  if (bookLink) {
    bookLink.addEventListener("click", () => {
      if (!tryOnLastPreviewUrl) return;
      const container = document.getElementById("aiBookingAttachmentContainer");
      const img = document.getElementById("aiBookingAttachmentImg");
      const promptDesc = document.getElementById("aiBookingAttachmentPrompt");
      if (container && img) {
        img.src = tryOnLastPreviewUrl;
        if (promptDesc) {
          const place = document.getElementById("tryOnPlacement")?.selectedOptions?.[0]?.text || "Custom";
          const notes = document.getElementById("tryOnNotes")?.value?.trim() || "";
          promptDesc.textContent = `Try-on preview · Placement: ${place}${notes ? " · " + notes : ""}`;
        }
        container.style.display = "block";
        aiGeneratedTattooUrl = tryOnLastPreviewUrl;
        aiGeneratedTattooPrompt = promptDesc?.textContent || "Try-on preview";
      }
    });
  }
};
