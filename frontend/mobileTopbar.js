(function () {
    function parseJwt(token) {
        if (!token || typeof token !== 'string') return {};
        const parts = token.split('.');
        if (parts.length !== 3) return {};
        try {
            return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        } catch {
            return {};
        }
    }

    function initialsFrom(u) {
        const nome = (u && u.nome ? String(u.nome) : '').trim();
        const cognome = (u && u.cognome ? String(u.cognome) : '').trim();
        if (nome || cognome) {
            return `${nome.charAt(0)}${cognome.charAt(0)}`.toUpperCase();
        }
        const email = (u && u.email ? String(u.email) : '').trim();
        if (email) return email.charAt(0).toUpperCase();
        return 'U';
    }

    function isMobile() {
        return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    }

    function buildMenuHtml(isLogged) {
        const primary = `
            <div class="site-mobile-menu-section">
                <div class="site-mobile-menu-title">Menu</div>
                <a class="site-mobile-menu-item" href="/"><i class="fas fa-house"></i><span>Home</span></a>
                <a class="site-mobile-menu-item" href="/chi-siamo"><i class="fas fa-users"></i><span>Chi siamo</span></a>
                <a class="site-mobile-menu-item" href="/calcola"><i class="fas fa-calculator"></i><span>Calcola</span></a>
                <a class="site-mobile-menu-item" href="/norme"><i class="fas fa-book"></i><span>Norme</span></a>
            </div>
        `;

        const account = isLogged
            ? `
            <div class="site-mobile-menu-section">
                <div class="site-mobile-menu-title">Gestione Account</div>
                <a class="site-mobile-menu-item" href="/dashboard?view=profile"><i class="fas fa-id-card"></i><span>Informazioni Personali</span></a>
                <a class="site-mobile-menu-item" href="/dashboard?view=professional"><i class="fas fa-briefcase"></i><span>Dati Professionali</span></a>
                <a class="site-mobile-menu-item" href="/dashboard?view=security"><i class="fas fa-shield-halved"></i><span>Sicurezza</span></a>
                <a class="site-mobile-menu-item" href="/dashboard?view=calculations"><i class="fas fa-clock-rotate-left"></i><span>I miei Calcoli</span></a>
                <a class="site-mobile-menu-item" href="/dashboard?view=subscription"><i class="fas fa-credit-card"></i><span>Abbonamento</span></a>
                <button class="site-mobile-menu-item danger" type="button" data-action="logout"><i class="fas fa-right-from-bracket"></i><span>Esci / Logout</span></button>
            </div>
            `
            : `
            <div class="site-mobile-menu-section">
                <div class="site-mobile-menu-title">Account</div>
                <a class="site-mobile-menu-item" href="/?login=1"><i class="fas fa-right-to-bracket"></i><span>Login</span></a>
                <a class="site-mobile-menu-item" href="/?register=1"><i class="fas fa-user-plus"></i><span>Registrati</span></a>
            </div>
            `;

        return primary + account;
    }

    function setMenuOpen(open, drawer, backdrop, toggle) {
        if (open) {
            drawer.classList.add('open');
            backdrop.classList.add('open');
            document.body.classList.add('site-mobile-menu-open');
            toggle.setAttribute('aria-expanded', 'true');
        } else {
            drawer.classList.remove('open');
            backdrop.classList.remove('open');
            document.body.classList.remove('site-mobile-menu-open');
            toggle.setAttribute('aria-expanded', 'false');
        }
    }

    function init() {
        if (!isMobile()) return;

        if (document.body && document.body.classList && document.body.classList.contains('account-page')) {
            return;
        }

        if (document.querySelector('.site-mobile-bar')) return;

        const token = localStorage.getItem('authToken');
        const user = parseJwt(token);
        const isLogged = !!token && (!!user.sub || !!user.id || !!user.email);

        document.body.classList.add('has-site-mobile-bar');

        const bar = document.createElement('div');
        bar.className = 'site-mobile-bar';
        bar.setAttribute('aria-label', 'Menu mobile');
        bar.innerHTML = `
            <button class="site-mobile-hamburger" type="button" aria-label="Apri menu" aria-expanded="false">
                <span></span><span></span><span></span>
            </button>
            <div class="site-mobile-brand" role="button" tabindex="0">
                <img src="/img/logo2.png" alt="equo compenso" class="site-mobile-logo">
            </div>
            <div class="site-mobile-user" aria-label="Utente">
                <span class="site-mobile-avatar"><span class="site-mobile-initials">${initialsFrom(user)}</span></span>
            </div>
        `;

        const drawer = document.createElement('div');
        drawer.className = 'site-mobile-drawer';
        drawer.setAttribute('aria-label', 'Menu');
        drawer.innerHTML = buildMenuHtml(isLogged);

        const backdrop = document.createElement('div');
        backdrop.className = 'site-mobile-backdrop';

        document.body.insertBefore(bar, document.body.firstChild);
        document.body.appendChild(backdrop);
        document.body.appendChild(drawer);

        const toggle = bar.querySelector('.site-mobile-hamburger');
        const brand = bar.querySelector('.site-mobile-brand');

        if (brand) {
            brand.addEventListener('click', () => (window.location.href = '/'));
            brand.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') window.location.href = '/';
            });
        }

        if (toggle) {
            toggle.addEventListener('click', () => {
                const open = drawer.classList.contains('open');
                setMenuOpen(!open, drawer, backdrop, toggle);
            });
        }

        if (backdrop) {
            backdrop.addEventListener('click', () => setMenuOpen(false, drawer, backdrop, toggle));
        }

        drawer.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('[data-action="logout"]') : null;
            if (btn) {
                localStorage.removeItem('authToken');
                window.location.href = '/';
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') setMenuOpen(false, drawer, backdrop, toggle);
        });

        window.addEventListener('resize', () => {
            if (!isMobile()) setMenuOpen(false, drawer, backdrop, toggle);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
