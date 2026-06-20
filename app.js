import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

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

document.addEventListener("DOMContentLoaded", () => {
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

    // Accordion
    const accBtns = document.querySelectorAll('.acc-btn');
    accBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            this.classList.toggle('active');
            const content = this.nextElementSibling;
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
                this.querySelector('span').textContent = '+';
            } else {
                content.style.maxHeight = content.scrollHeight + "px";
                this.querySelector('span').textContent = '-';
            }
        });
    });

    // Auth Modal Logic
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
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
            toggleModeBtn.parentElement.innerHTML = `Don't have an account? <a href="#" id="toggleAuthMode" style="color: var(--accent);">Register here</a>.`;
        } else {
            modalTitle.textContent = "Create Account";
            modalSubtitle.textContent = "Join the Diamond Tip family";
            submitBtn.textContent = "REGISTER";
            toggleModeBtn.parentElement.innerHTML = `Already have an account? <a href="#" id="toggleAuthMode" style="color: var(--accent);">Sign in here</a>.`;
        }
        
        // Re-attach event listener
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
                .then((userCredential) => {
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

    logoutBtn.onclick = () => {
        signOut(auth);
    };

    onAuthStateChanged(auth, (user) => {
        if (user) {
            loginBtn.style.display = 'none';
            logoutBtn.style.display = 'block';
        } else {
            loginBtn.style.display = 'block';
            logoutBtn.style.display = 'none';
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
});
