document.addEventListener('DOMContentLoaded', () => {
    
    const menuFindWork = document.getElementById('menu-find-work');
    const menuMyApps = document.getElementById('menu-my-apps');
    const viewFindWork = document.getElementById('view-find-work');
    const viewMyApps = document.getElementById('view-my-apps');
    const catFilterSection = document.getElementById('category-filter-section');
    
    const jobsContainer = document.getElementById('jobs-container');
    const myAppsList = document.getElementById('my-apps-list');
    const categoryList = document.getElementById('category-list');
    
    // Modal
    const applyModal = document.getElementById('apply-modal');
    const btnCloseModal = document.querySelector('.btn-close');
    const btnCancelModal = document.querySelector('.btn-cancel');
    const applyForm = document.getElementById('apply-form');

    let currentCategory = 'All';

    // UI Switching
    function switchView(activeMenu, activeView) {
        [menuFindWork, menuMyApps].forEach(el => el.classList.remove('active'));
        [viewFindWork, viewMyApps].forEach(el => el.style.display = 'none');
        activeMenu.classList.add('active');
        activeView.style.display = 'block';
        catFilterSection.style.display = activeMenu === menuFindWork ? 'block' : 'none';
    }

    menuFindWork.addEventListener('click', () => { switchView(menuFindWork, viewFindWork); loadOpenJobs(); });
    menuMyApps.addEventListener('click', () => { 
        switchView(menuMyApps, viewMyApps); 
        loadMyApps();
    });

    // Categories
    categoryList.addEventListener('click', (e) => {
        const item = e.target.closest('.filter-item');
        if (!item) return;
        categoryList.querySelectorAll('.filter-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        currentCategory = item.dataset.cat;
        loadOpenJobs();
    });

    // Jobs loader
    async function loadOpenJobs() {
        jobsContainer.innerHTML = '<div class="empty-state">Loading opportunities...</div>';
        try {
            let ep = '/api/jobs?status=open';
            if (currentCategory !== 'All') {
                ep += `&category=${encodeURIComponent(currentCategory)}`;
            }
            const res = await fetch(ep);
            const jobs = await res.json();
            
            if (jobs.length === 0) {
                jobsContainer.innerHTML = '<div class="empty-state">No open jobs found in this category.</div>';
                return;
            }

            jobsContainer.innerHTML = jobs.map(job => `
                <div class="job-item">
                    <div class="job-main">
                        <div class="job-title">${escape(job.title)}</div>
                        <div class="job-meta">
                            <span><span class="badge badge-blue">${escape(job.category)}</span></span>
                            <span>📍 ${escape(job.location)}</span>
                            <span>💰 <strong>${escape(job.budget)}</strong></span>
                        </div>
                        <div class="job-desc">${escape(job.description)}</div>
                    </div>
                    <div class="job-actions" style="margin-left: 1rem; align-items:flex-start;">
                        <button class="btn btn-primary btn-apply" data-id="${job.id}" data-title="${escape(job.title)}" data-budget="${escape(job.budget)}">
                            Submit Proposal
                        </button>
                    </div>
                </div>
            `).join('');

            jobsContainer.querySelectorAll('.btn-apply').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const tgt = e.target.closest('.btn-apply');
                    openApplyModal(tgt.dataset.id, tgt.dataset.title, tgt.dataset.budget);
                });
            });

        } catch (e) {
            jobsContainer.innerHTML = '<div class="empty-state">Error loading jobs.</div>';
        }
    }

    // Modal Handlers
    function openApplyModal(id, title, budget) {
        document.getElementById('apply-job-id').value = id;
        document.getElementById('apply-job-title').innerText = title;
        document.getElementById('apply-job-budget').innerText = "Client budget: " + budget;
        applyForm.reset();
        document.getElementById('apply-job-id').value = id; // restore after reset
        applyModal.classList.add('active');
    }

    const closeModal = () => applyModal.classList.remove('active');
    btnCloseModal.addEventListener('click', closeModal);
    btnCancelModal.addEventListener('click', closeModal);

    applyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            job_id: parseInt(document.getElementById('apply-job-id').value),
            expected_rate: document.getElementById('worker-rate').value,
            message: document.getElementById('worker-message').value
        };

        const btn = applyForm.querySelector('button[type="submit"]');
        const ogText = btn.innerText;
        btn.innerText = 'Submitting...'; btn.disabled = true;

        try {
            const res = await fetch('/api/applications', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                closeModal();
                showToast('Application submitted successfully!', 'success');
                loadOpenJobs();
            } else {
                const data = await res.json();
                showToast(data.error || 'Failed to submit application.', 'error');
            }
        } catch(err) {
            showToast('Network error. Please try again.', 'error');
        } finally {
            btn.innerText = ogText; btn.disabled = false;
        }
    });

    // Load applications via session (no localStorage workaround needed)
    async function loadMyApps() {
        myAppsList.innerHTML = '<div class="empty-state">Loading your applications...</div>';
        try {
            const res = await fetch('/api/applications');
            if (res.status === 403) {
                myAppsList.innerHTML = '<div class="empty-state">Session expired. Please <a href="/auth">log in again</a>.</div>';
                return;
            }
            const apps = await res.json();

            if (apps.length === 0) {
                myAppsList.innerHTML = '<div class="empty-state">You haven\'t applied to any jobs yet.<br><br><a href="#" id="go-find-work" class="btn btn-primary">Browse Available Jobs</a></div>';
                document.getElementById('go-find-work')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    switchView(menuFindWork, viewFindWork);
                    loadOpenJobs();
                });
                return;
            }

            myAppsList.innerHTML = apps.map(app => `
                <div class="job-item" style="flex-direction: column;">
                    <div style="display:flex; justify-content:space-between; width:100%; margin-bottom:1rem;">
                        <div>
                            <div class="job-title">${escape(app.job_title)}</div>
                            <div style="font-size:0.875rem; color:var(--text-muted);">Proposed Rate: ${escape(app.expected_rate)}</div>
                        </div>
                        <div>
                            ${statusBadge(app.status)}
                        </div>
                    </div>
                    <div class="job-desc" style="background:var(--surface-alt); padding:1rem; border-radius:4px; border:1px solid var(--border);">${escape(app.message)}</div>
                </div>
            `).join('');

        } catch (e) {
            myAppsList.innerHTML = '<div class="empty-state">Error loading applications.</div>';
        }
    }

    // Toast notification
    function showToast(message, type = 'success') {
        const existing = document.getElementById('toast-notification');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.cssText = `
            position: fixed; bottom: 2rem; right: 2rem; z-index: 9999;
            padding: 0.875rem 1.5rem; border-radius: 8px; font-size: 0.875rem; font-weight: 500;
            background: ${type === 'success' ? 'var(--success)' : 'var(--danger)'}; color: white;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2); animation: slideIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    // Utils
    function escape(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str; return d.innerHTML;
    }
    
    function statusBadge(st) {
        if (st === 'accepted') return '<span class="badge badge-green" style="padding:0.25rem 0.75rem; font-size:0.875rem;">✓ Accepted</span>';
        if (st === 'rejected') return '<span class="badge badge-red" style="padding:0.25rem 0.75rem; font-size:0.875rem;">✗ Rejected</span>';
        return '<span class="badge badge-yellow" style="padding:0.25rem 0.75rem; font-size:0.875rem;">⏳ Pending</span>';
    }

    // Init
    loadOpenJobs();
});
