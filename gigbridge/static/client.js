document.addEventListener('DOMContentLoaded', () => {
    // Menu
    const menuDashboard = document.getElementById('menu-dashboard');
    const menuPostJob = document.getElementById('menu-post-job');
    const menuMyJobs = document.getElementById('menu-my-jobs');
    
    // Views
    const viewDashboard = document.getElementById('view-dashboard');
    const viewPostJob = document.getElementById('view-post-job');
    const viewMyJobs = document.getElementById('view-my-jobs');
    
    // Elements
    const postJobForm = document.getElementById('post-job-form');
    const myJobsList = document.getElementById('my-jobs-list');
    const recentJobsList = document.getElementById('recent-jobs');
    const statusFilter = document.getElementById('status-filter');
    
    const applicantsModal = document.getElementById('applicants-modal');
    const applicantsList = document.getElementById('applicants-list');
    const modalJobTitle = document.getElementById('modal-job-title');

    function switchView(activeMenu, activeView) {
        [menuDashboard, menuPostJob, menuMyJobs].forEach(el => el.classList.remove('active'));
        [viewDashboard, viewPostJob, viewMyJobs].forEach(el => el.style.display = 'none');
        activeMenu.classList.add('active');
        activeView.style.display = 'block';
    }

    menuDashboard.addEventListener('click', () => {
        switchView(menuDashboard, viewDashboard);
        loadStats();
    });
    menuPostJob.addEventListener('click', () => switchView(menuPostJob, viewPostJob));
    menuMyJobs.addEventListener('click', () => {
        switchView(menuMyJobs, viewMyJobs);
        loadMyJobs();
    });

    // Modals
    document.querySelector('#applicants-modal .btn-close').addEventListener('click', () => {
        applicantsModal.classList.remove('active');
        loadMyJobs();
        loadStats();
    });

    // Data Loaders
    async function loadStats() {
        try {
            const res = await fetch('/api/stats/client');
            if (res.status === 403) {
                window.location.href = '/auth';
                return;
            }
            const stats = await res.json();
            animateCount('stat-total', stats.total_jobs);
            animateCount('stat-open', stats.open_jobs);
            animateCount('stat-apps', stats.total_apps);

            // Load client's own recent jobs for dashboard (client_only=true)
            const jobsRes = await fetch('/api/jobs?client_only=true');
            const jobs = await jobsRes.json();
            renderJobsList(jobs.slice(0, 3), recentJobsList, false);
        } catch (e) {
            console.error('Stats error:', e);
        }
    }

    // Animated number counter
    function animateCount(elementId, target) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const start = 0;
        const duration = 800;
        const startTime = performance.now();
        const step = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            el.textContent = Math.round(eased * (target - start) + start);
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    async function loadMyJobs() {
        const fil = statusFilter.value;
        // Always use client_only=true so only this client's jobs are shown
        let endpoint = '/api/jobs?client_only=true';
        if (fil !== 'All') endpoint += `&status=${fil}`;

        try {
            myJobsList.innerHTML = '<div class="empty-state">Loading...</div>';
            const res = await fetch(endpoint);
            if (res.status === 403) {
                window.location.href = '/auth';
                return;
            }
            const jobs = await res.json();
            renderJobsList(jobs, myJobsList, true);
        } catch (e) {
            myJobsList.innerHTML = '<div class="empty-state">Failed to load.</div>';
        }
    }

    statusFilter.addEventListener('change', loadMyJobs);

    // Job Posting
    postJobForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            title: document.getElementById('job-title').value,
            category: document.getElementById('job-category').value,
            budget: document.getElementById('job-budget').value,
            location: document.getElementById('job-location').value,
            description: document.getElementById('job-desc').value
        };

        const btn = postJobForm.querySelector('button');
        const ogText = btn.innerText;
        btn.innerText = 'Publishing...'; btn.disabled = true;

        try {
            const res = await fetch('/api/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                postJobForm.reset();
                showToast('Job posted successfully!', 'success');
                switchView(menuMyJobs, viewMyJobs);
                loadMyJobs();
            } else {
                const data = await res.json();
                showToast(data.error || 'Failed to post job.', 'error');
            }
        } catch(err) {
            showToast('Network error. Please try again.', 'error');
        } finally {
            btn.innerText = ogText; btn.disabled = false;
        }
    });

    // Render logic
    function renderJobsList(jobs, container, showActions) {
        if (jobs.length === 0) {
            container.innerHTML = '<div class="empty-state">No jobs found. <span style="display:block;margin-top:0.5rem;font-size:0.8rem;">Post a new job to get started.</span></div>';
            return;
        }
        
        container.innerHTML = jobs.map(job => `
            <div class="job-item">
                <div class="job-main">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div class="job-title">${escape(job.title)}</div>
                        ${job.status === 'open' 
                            ? '<span class="badge badge-green">Open</span>' 
                            : '<span class="badge badge-gray">Closed</span>'}
                    </div>
                    <div class="job-meta">
                        <span><span class="badge badge-blue">${escape(job.category)}</span></span>
                        <span>📍 ${escape(job.location)}</span>
                        <span>💰 ${escape(job.budget)}</span>
                        <span>Apps: <strong>${job.app_count}</strong></span>
                    </div>
                </div>
                ${showActions ? `
                <div class="job-actions" style="margin-left: 1rem;">
                    <button class="btn btn-secondary view-btn" data-id="${job.id}" data-title="${escape(job.title)}">
                        View Applicants
                    </button>
                </div>
                ` : ''}
            </div>
        `).join('');

        if (showActions) {
            container.querySelectorAll('.view-btn').forEach(b => {
                b.addEventListener('click', (e) => {
                    const btn = e.target.closest('.view-btn');
                    openApplicantsModal(btn.dataset.id, btn.dataset.title);
                });
            });
        }
    }

    // Modal Logistics
    async function openApplicantsModal(jobId, jobTitle) {
        modalJobTitle.innerText = `Applicants for "${jobTitle}"`;
        applicantsModal.classList.add('active');
        applicantsList.innerHTML = '<div class="empty-state">Loading applicants...</div>';

        try {
            const res = await fetch(`/api/applications/${jobId}`);
            const apps = await res.json();
            
            if (apps.length === 0) {
                applicantsList.innerHTML = '<div class="empty-state">No applications yet.</div>';
                return;
            }

            applicantsList.innerHTML = apps.map(app => `
                <div class="app-card">
                    <div class="app-header">
                        <div>
                            <div class="app-name">${escape(app.worker_name)}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">${formatDate(app.created_at)}</div>
                        </div>
                        <div style="text-align: right;">
                            <div class="app-rate">Rate: ${escape(app.expected_rate)}</div>
                            ${statusBadge(app.status)}
                        </div>
                    </div>
                    <div class="app-msg">${escape(app.message)}</div>
                    ${app.status === 'pending' ? `
                    <div class="app-actions">
                        <button class="btn btn-sm btn-success accept-btn" data-id="${app.id}">✓ Accept</button>
                        <button class="btn btn-sm btn-danger reject-btn" data-id="${app.id}">✗ Reject</button>
                    </div>
                    ` : ''}
                </div>
            `).join('');

            applicantsList.querySelectorAll('.accept-btn').forEach(btn => {
                btn.addEventListener('click', (e) => updateAppStatus(e.target.dataset.id, 'accepted', jobId, jobTitle));
            });
            applicantsList.querySelectorAll('.reject-btn').forEach(btn => {
                btn.addEventListener('click', (e) => updateAppStatus(e.target.dataset.id, 'rejected', jobId, jobTitle));
            });

        } catch (e) {
            applicantsList.innerHTML = '<div class="empty-state">Error loading applicants.</div>';
        }
    }

    async function updateAppStatus(appId, status, jobId, jobTitle) {
        if (status === 'accepted' && !confirm('Accepting an applicant will close the job and reject all other applicants. Continue?')) return;

        try {
            const res = await fetch(`/api/applications/${appId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            if (res.ok) {
                showToast(status === 'accepted' ? 'Applicant accepted! Job is now closed.' : 'Applicant rejected.', 
                          status === 'accepted' ? 'success' : 'info');
                openApplicantsModal(jobId, jobTitle);
            }
        } catch(e) {
            console.error('Update failed', e);
        }
    }

    // Toast notification
    function showToast(message, type = 'success') {
        const existing = document.getElementById('toast-notification');
        if (existing) existing.remove();

        const colors = { success: 'var(--success)', error: 'var(--danger)', info: 'var(--accent)' };
        const toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.cssText = `
            position: fixed; bottom: 2rem; right: 2rem; z-index: 9999;
            padding: 0.875rem 1.5rem; border-radius: 8px; font-size: 0.875rem; font-weight: 500;
            background: ${colors[type] || colors.success}; color: white;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2); animation: toastIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    // Helpers
    function escape(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str; return d.innerHTML;
    }
    function statusBadge(st) {
        if (st === 'accepted') return '<span class="badge badge-green" style="margin-top:4px;">✓ Accepted</span>';
        if (st === 'rejected') return '<span class="badge badge-red" style="margin-top:4px;">✗ Rejected</span>';
        return '<span class="badge badge-yellow" style="margin-top:4px;">⏳ Pending</span>';
    }
    function formatDate(ds) {
        if (!ds) return '';
        const d = new Date(ds + " UTC");
        return d.toLocaleDateString();
    }

    // Init
    loadStats();
});
