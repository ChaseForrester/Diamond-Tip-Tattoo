import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { 
  getFirestore, doc, setDoc, addDoc, getDoc, getDocs, collection, query, where, orderBy, updateDoc, deleteDoc, onSnapshot 
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { 
  getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject 
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

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

// Global Variables
let currentUser = null;
let isAdmin = false;
let selectedBookingFiles = [];
let dbBookings = [];
let dbFaqs = [];
let dbPortfolio = [];

// Static/Fallback Data
const defaultSpecialties = [
  { id: "fineline", title: "FINE LINE", description: "Delicate detail. Lasting elegance.", image: "assets/style_fineline_1781912087176.png" },
  { id: "blackgrey", title: "BLACK & GREY", description: "Depth. Contrast. Timeless impact.", image: "assets/style_blackgrey_1781912097975.png" },
  { id: "realism", title: "REALISM", description: "Photorealistic artistry. True to life.", image: "assets/style_realism_1781912108842.png" },
  { id: "custom", title: "CUSTOM DESIGN", description: "Your vision. Our craft.", image: "assets/style_custom_1781912121519.png" }
];

const defaultArtists = [
  { id: "adrian", name: "ADRIAN V.", role: "Founder / Lead Artist", image: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=300&q=80" },
  { id: "luna", name: "LUNA M.", role: "Fine Line Specialist", image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=300&q=80" },
  { id: "marcus", name: "MARCUS D.", role: "Custom Design Artist", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80" },
  { id: "isabella", name: "ISABELLA R.", role: "Realism Specialist", image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80" }
];

const defaultPortfolio = [
  "assets/style_fineline_1781912087176.png",
  "assets/style_blackgrey_1781912097975.png",
  "assets/style_realism_1781912108842.png",
  "assets/style_custom_1781912121519.png",
  "assets/tattoo_chest_1781911844150.png"
];

const defaultFaqs = [
  { id: "faq1", question: "How do I book an appointment?", answer: "Fill out the booking form to request a consultation." },
  { id: "faq2", question: "How much will my tattoo cost?", answer: "Cost depends on size and detail. We will provide an estimate after consultation." },
  { id: "faq3", question: "How long will my tattoo take?", answer: "Sessions can vary from 1 hour to full days." },
  { id: "faq4", question: "Do you offer touch-ups?", answer: "Yes, we offer complimentary touch-ups within 6 months." },
  { id: "faq5", question: "Is the studio private?", answer: "Yes, we operate by appointment only in a private setting." }
];

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
        }, 2500);
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
    }

    // Scroll effects
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.style.borderBottom = "1px solid var(--accent)";
        } else {
            navbar.style.borderBottom = "1px solid var(--border)";
        }
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-in, .slide-up').forEach((el) => observer.observe(el));

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
                content = `<span style="font-size: 1.5rem;">📄</span><span style="font-size: 0.6rem; color: var(--text-secondary); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; display: block;">${file.name}</span>`;
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
            const style = document.getElementById('bookingStyle').value;
            const idea = document.getElementById('bookingIdea').value;

            try {
                // 1. Create a Booking ID first
                const bookingRef = doc(collection(db, "bookings"));
                const bookingId = bookingRef.id;

                const uploadedUrls = [];

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
                previewGrid.innerHTML = '';
                uploadProgressContainer.style.display = 'none';

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
    } else if (tabId === 'buy-giftcards') {
        activeNavLi = document.getElementById('navBuyGiftCards');
        activeTabDiv = document.getElementById('tabBuyGiftCards');
        loadClientGiftCards();
    } else if (tabId === 'browse-shop') {
        activeNavLi = document.getElementById('navBrowseShop');
        activeTabDiv = document.getElementById('tabBrowseShop');
        loadClientShopProducts();
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
    } else if (tabId === 'cms') {
        activeNavLi = document.getElementById('navCMS');
        activeTabDiv = document.getElementById('tabCMS');
        renderCMSPortfolio();
        renderCMSFaqs();
        renderCMSBlogs();
        renderCMSProducts();
    } else if (tabId === 'seo') {
        activeNavLi = document.getElementById('navSEO');
        activeTabDiv = document.getElementById('tabSEO');
        loadSeoSettings();
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
                    author: "Adrian V.",
                    image: "assets/tattoo_workspace_1781911831357.png",
                    content: "Taking care of your new tattoo is just as important as the tattooing process itself. Keep it clean, use premium vegan aftercare cream, avoid long soaking in water, and protect it from direct sunlight. Your skin notes are valuable here!",
                    createdAt: new Date().toISOString()
                },
                {
                    title: "Tattoo Placements: Finding the Perfect Spot",
                    author: "Luna M.",
                    image: "assets/tattoo_artist_1781911870037.png",
                    content: "Tattoo placement can make or break a design. Fine line work looks gorgeous on wrists and collarbones, whereas large realism designs require larger canvases like sleeves or chests. Let's consult and design something custom.",
                    createdAt: new Date().toISOString()
                }
            ];
            for (const b of defaultBlogs) {
                await setDoc(doc(db, "blogs", `blog_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`), b);
            }

            // Seed Default Products
            const defaultProducts = [
                {
                    name: "Premium Ink Balm",
                    price: 19.99,
                    image: "assets/tattoo_front_desk_1781911857115.png",
                    description: "All-natural, vegan tattoo aftercare balm to soothe, hydrate, and preserve color vibrance."
                },
                {
                    name: "Gentle Soap Cleanser",
                    price: 14.50,
                    image: "assets/tattoo_workspace_1781911831357.png",
                    description: "Fragrance-free foaming soap, specially formulated for washing fresh tattoos safely."
                }
            ];
            for (const p of defaultProducts) {
                await setDoc(doc(db, "products", `product_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`), p);
            }

            // Seed Default SEO
            const defaultSeo = {
                home: {
                    title: "Diamond Tip Tattoo | Private Tattoo Atelier Dapto",
                    description: "Private tattoo atelier for custom work of uncompromising quality. Fine art on skin, crafted to last a lifetime in Dapto.",
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
        // 1. Specialties
        const specialtiesSnap = await getDoc(doc(db, "content", "specialties"));
        const specialties = specialtiesSnap.exists() ? specialtiesSnap.data().items : defaultSpecialties;
        const specialtiesGrid = document.getElementById('specialtiesGrid');
        if (specialtiesGrid) {
            specialtiesGrid.innerHTML = specialties.map(spec => `
                <div class="card spec-card">
                    <img src="${spec.image}" alt="${spec.title}">
                    <div class="card-content">
                        <h3>${spec.title}</h3>
                        <p>${spec.description}</p>
                        <a href="#book" class="explore">BOOK NOW &rarr;</a>
                    </div>
                </div>
            `).join('');
        }

        // 2. Artists
        const artistsSnap = await getDoc(doc(db, "content", "artists"));
        const artists = artistsSnap.exists() ? artistsSnap.data().items : defaultArtists;
        const artistsGrid = document.getElementById('artistsGrid');
        if (artistsGrid) {
            artistsGrid.innerHTML = artists.map(art => `
                <div class="artist-card">
                    <img src="${art.image}" alt="${art.name}">
                    <div class="artist-info">
                        <h3>${art.name}</h3>
                        <p class="role">${art.role}</p>
                        <a href="#book" class="explore">BOOK WITH ${art.name.split(' ')[0]} &rarr;</a>
                    </div>
                </div>
            `).join('');
        }

        // 3. Portfolio
        const portfolioSnap = await getDoc(doc(db, "content", "portfolio"));
        const portfolio = portfolioSnap.exists() ? portfolioSnap.data().items : defaultPortfolio;
        dbPortfolio = portfolio;
        const portfolioGrid = document.getElementById('portfolioGrid');
        if (portfolioGrid) {
            portfolioGrid.innerHTML = portfolio.map(imgUrl => `
                <img src="${imgUrl}" alt="Tattoo Portfolio Work">
            `).join('');
        }

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

    cmsGrid.innerHTML = dbPortfolio.map((imgUrl, index) => `
        <div class="cms-portfolio-item">
            <img src="${imgUrl}" alt="Portfolio Work ${index + 1}">
            <button class="cms-delete-btn" onclick="deleteCMSPortfolioImage(${index})">DELETE</button>
        </div>
    `).join('');
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
        dbPortfolio.push(downloadURL);
        await updateDoc(doc(db, "content", "portfolio"), {
            items: dbPortfolio
        });

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

    const imgUrl = dbPortfolio[index];

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
        loadDynamicContent(); // Refresh main gallery

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
    let titleText = "Diamond Tip Tattoo | Private Tattoo Atelier Dapto";
    let descText = "Private tattoo atelier for custom work of uncompromising quality. Fine art on skin, crafted to last a lifetime in Dapto.";
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

    try {
        const snap = await getDocs(collection(db, "products"));
        window.dbProducts = [];
        if (snap.empty) {
            portalShopGrid.innerHTML = `<p style="color: var(--text-secondary);">No shop products found.</p>`;
            return;
        }

        let html = '';
        snap.forEach(d => {
            const prod = d.data();
            window.dbProducts.push({ id: d.id, ...prod });
            html += `
                <div class="shop-card">
                    <img src="${prod.image || 'assets/tattoo_front_desk_1781911857115.png'}" alt="${prod.name}">
                    <div class="shop-card-content">
                        <h3>${prod.name}</h3>
                        <p>${prod.description}</p>
                        <div class="shop-price">$${prod.price}</div>
                        <button class="btn btn-solid" style="width: 100%;" onclick="buyProductSimulated('${d.id}', '${prod.name}')">BUY NOW</button>
                    </div>
                </div>
            `;
        });
        portalShopGrid.innerHTML = html;
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

    try {
        const snap = await getDocs(collection(db, "products"));
        if (snap.empty) {
            shopGrid.innerHTML = `<p style="color: var(--text-secondary);">Check back soon for studio aftercare and merchandise!</p>`;
            return;
        }

        let html = '';
        snap.forEach(d => {
            const prod = d.data();
            html += `
                <div class="shop-card">
                    <img src="${prod.image || 'assets/tattoo_front_desk_1781911857115.png'}" alt="${prod.name}">
                    <div class="shop-card-content">
                        <h3>${prod.name}</h3>
                        <p>${prod.description}</p>
                        <div class="shop-price">$${prod.price}</div>
                        <a href="#portal/browse-shop" class="btn btn-solid" style="width: 100%; display: block; text-align: center;">ORDER FOR PICKUP</a>
                    </div>
                </div>
            `;
        });
        shopGrid.innerHTML = html;
    } catch (e) {
        console.error(e);
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
        authorInput.value = 'Adrian V.';
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
    let descText = "Private tattoo atelier for custom work.";
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
