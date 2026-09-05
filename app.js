// --- INITIAL STATE ---
const DEFAULT_CATEGORIES = [
    { id: 'c1', name: 'Food', color: '#F59E0B', icon: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path>' },
    { id: 'c2', name: 'Entertainment', color: '#5B5FEF', icon: '<polygon points="5 3 19 12 5 21 5 3"></polygon>' },
    { id: 'c3', name: 'Shopping', color: '#EC4899', icon: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path>' },
    { id: 'c4', name: 'Travel', color: '#10B981', icon: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>' },
];

let state = {
    theme: 'light',
    budget: 0,
    categories: [...DEFAULT_CATEGORIES],
    people: [],
    expenses: [],
    isAuthenticated: false
};

// --- CORE UTILS ---
const formatCurrency = (amount) => '₹' + amount.toLocaleString('en-IN', { maximumFractionDigits: 0 });
const showToast = (msg) => {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
};

// --- AUTH & INIT ---
function init() {
    const saved = localStorage.getItem('pocketsplit_data');
    if (saved) {
        try { state = { ...state, ...JSON.parse(saved) }; } catch(e) {}
    }
    
    applyTheme(state.theme);
    
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('exp-date').value = today;
    document.getElementById('expense-month').value = today.substring(0, 7);

    // Global category populate so the dropdown is never empty
    populateCategoriesDropdown();

    if (state.isAuthenticated) {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('app-shell').style.display = '';
        renderAll();
    }
}

function handleLogin(e) {
    e.preventDefault();
    const code = document.getElementById('access-code').value;
    if (code === 'qwert' || code === '12345') {
        state.isAuthenticated = true;
        saveData();
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('app-shell').style.display = '';
        renderAll();
    } else {
        document.getElementById('login-error').style.display = 'block';
    }
}

function logout() {
    state.isAuthenticated = false;
    saveData();
    location.reload();
}

function saveData() {
    localStorage.setItem('pocketsplit_data', JSON.stringify(state));
    renderAll();
}

// --- THEMING ---
function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(state.theme);
    saveData();
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('meta-theme-color').setAttribute('content', theme === 'dark' ? '#0F1115' : '#F7F8FA');
}

// --- NAVIGATION ---
function switchTab(tabId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(`view-${tabId}`).classList.add('active');
    document.querySelectorAll(`.nav-item[data-target="${tabId}"]`).forEach(n => n.classList.add('active'));
    
    const titles = { 
        'home': 'Home', 
        'expenses': 'Expenses', 
        'settlements': 'Settlements', 
        'analytics': 'Analytics', 
        'settings': 'Settings',
        'categories': 'Categories'
    };
    document.getElementById('header-title').innerText = titles[tabId];
}

// --- MODALS ---
let activeModal = null;

function openModal(id) {
    document.getElementById('overlay').style.display = 'block';
    const modal = document.getElementById(id);
    modal.style.display = 'flex';
    setTimeout(() => {
        document.getElementById('overlay').style.opacity = '1';
        modal.classList.add('show');
    }, 10);
    activeModal = id;
}

function closeAllModals() {
    // Bulletproof close failsafe - hides all modals immediately
    document.querySelectorAll('.modal').forEach(m => {
        m.classList.remove('show');
        setTimeout(() => m.style.display = 'none', 300);
    });
    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 300);
    }
    activeModal = null;
}

// --- CALCULATION ENGINE ---
function getBalances() {
    let balances = {}; 
    state.people.forEach(p => balances[p.id] = 0);
    
    let monthTotalPaid = 0;
    let monthMySpend = 0;
    const currMonth = new Date().toISOString().substring(0, 7);

    state.expenses.forEach(tx => {
        const isCurrMonth = tx.date.startsWith(currMonth);
        
        if (tx.isSettlement) {
            if(balances[tx.personId] !== undefined) balances[tx.personId] -= tx.amount;
        } else {
            let myShare = tx.amount;
            
            if (tx.splits && tx.splits.length > 0) {
                let friendsShareTotal = 0;
                tx.splits.forEach(s => {
                    friendsShareTotal += s.amount;
                    if(balances[s.personId] !== undefined) balances[s.personId] += s.amount;
                });
                myShare = tx.amount - friendsShareTotal;
            }

            if (isCurrMonth) {
                monthTotalPaid += tx.amount;
                monthMySpend += myShare;
            }
        }
    });

    return { balances, monthTotalPaid, monthMySpend };
}

// --- EXPENSE LOGIC ---
let splitType = 'equal';

function setSplitType(type) {
    splitType = type;
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.seg-btn[data-type="${type}"]`).classList.add('active');
    calculateSplits();
}

function toggleSplitUI() {
    const isSplit = document.getElementById('exp-is-split').checked;
    const ui = document.getElementById('split-section');
    if (isSplit && state.people.length === 0) {
        alert("Add people in Settlements first!");
        document.getElementById('exp-is-split').checked = false;
        return;
    }
    ui.style.display = isSplit ? 'block' : 'none';
    if(isSplit) {
        renderSplitMembers();
        calculateSplits();
    }
}

function renderSplitMembers() {
    const list = document.getElementById('split-members-list');
    list.innerHTML = state.people.map(p => `
        <div class="split-row">
            <input type="checkbox" class="split-cb checkbox-custom" value="${p.id}" checked onchange="calculateSplits()">
            <span class="flex-1 font-medium">${p.name}</span>
            <input type="number" class="split-val input-standard p-0 text-right border-0" data-id="${p.id}" placeholder="0" oninput="handleManualSplit()">
        </div>
    `).join('');
}

function handleManualSplit() {
    if(splitType === 'equal') setSplitType('custom');
    else updateSplitTotal();
}

function calculateSplits() {
    const total = parseFloat(document.getElementById('exp-amount').value) || 0;
    const rows = document.querySelectorAll('.split-row');
    const checked = Array.from(rows).filter(r => r.querySelector('.split-cb').checked);
    
    if (checked.length === 0) { updateSplitTotal(); return; }

    if (splitType === 'equal') {
        const amt = (total / (checked.length + 1)).toFixed(2);
        checked.forEach(r => r.querySelector('.split-val').value = amt);
    }
    updateSplitTotal();
}

function updateSplitTotal() {
    const total = parseFloat(document.getElementById('exp-amount').value) || 0;
    let allocated = 0;
    document.querySelectorAll('.split-row').forEach(r => {
        if(r.querySelector('.split-cb').checked) {
            let val = parseFloat(r.querySelector('.split-val').value) || 0;
            if(splitType === 'percent') allocated += total * (val/100);
            else allocated += val;
        }
    });
    
    const label = document.getElementById('split-total-amount');
    label.innerText = formatCurrency(allocated);
    label.className = allocated > total ? 'text-danger font-bold' : 'text-primary font-bold';
}

function populateCategoriesDropdown() {
    const el = document.getElementById('exp-category');
    if (el) {
        const currentVal = el.value;
        el.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        if (currentVal) el.value = currentVal;
    }
}

function openExpenseModal(id = null) {
    const form = document.getElementById('form-expense');
    form.reset();
    document.getElementById('exp-id').value = id || '';
    document.getElementById('modal-expense-title').innerText = id ? 'Edit Expense' : 'Add Expense';
    
    populateCategoriesDropdown();
    document.getElementById('split-section').style.display = 'none';

    if (id) {
        const tx = state.expenses.find(t => t.id === id);
        if (tx) {
            document.getElementById('exp-amount').value = tx.amount;
            document.getElementById('exp-desc').value = tx.desc;
            document.getElementById('exp-category').value = tx.categoryId;
            document.getElementById('exp-date').value = tx.date;
            
            if (tx.splits && tx.splits.length > 0) {
                document.getElementById('exp-is-split').checked = true;
                document.getElementById('split-section').style.display = 'block';
                setSplitType('custom');
                renderSplitMembers();
                
                document.querySelectorAll('.split-cb').forEach(cb => cb.checked = false);
                tx.splits.forEach(s => {
                    const inp = document.querySelector(`.split-val[data-id="${s.personId}"]`);
                    if(inp) {
                        inp.value = s.amount;
                        inp.previousElementSibling.previousElementSibling.checked = true;
                    }
                });
                updateSplitTotal();
            }
        }
    } else {
        document.getElementById('exp-date').value = new Date().toISOString().split('T')[0];
        setSplitType('equal');
    }
    openModal('modal-expense');
}

function saveExpense(e) {
    e.preventDefault();
    const id = document.getElementById('exp-id').value || 'tx_' + Date.now();
    const amount = parseFloat(document.getElementById('exp-amount').value);
    
    let splits = [];
    if(document.getElementById('exp-is-split').checked) {
        document.querySelectorAll('.split-row').forEach(r => {
            if(r.querySelector('.split-cb').checked) {
                const pId = r.querySelector('.split-val').dataset.id;
                let val = parseFloat(r.querySelector('.split-val').value) || 0;
                if(splitType === 'percent') val = amount * (val/100);
                splits.push({ personId: pId, amount: val });
            }
        });
    }

    const allocated = splits.reduce((sum, s) => sum + s.amount, 0);
    if(allocated > amount) return alert("Splits cannot exceed total expense.");

    const tx = {
        id, amount,
        desc: document.getElementById('exp-desc').value,
        categoryId: document.getElementById('exp-category').value,
        date: document.getElementById('exp-date').value,
        splits,
        isSettlement: false
    };

    const idx = state.expenses.findIndex(t => t.id === id);
    if(idx > -1) state.expenses[idx] = tx;
    else state.expenses.push(tx);

    closeAllModals();
    saveData();
    showToast("Expense saved");
}

function deleteExpense(id) {
    if(confirm("Delete this expense permanently?")) {
        state.expenses = state.expenses.filter(t => t.id !== id);
        saveData();
        showToast("Expense deleted");
    }
}

// --- PEOPLE & SETTLEMENTS ---
function savePerson(e) {
    e.preventDefault();
    state.people.push({ id: 'p_' + Date.now(), name: document.getElementById('person-name').value });
    closeAllModals();
    saveData();
    showToast("Person added");
}

function deletePerson(id) {
    if(confirm("Archive this person?")) {
        state.people = state.people.filter(p => p.id !== id);
        saveData();
        showToast("Person removed");
    }
}

function openSettleModal(pId) {
    document.getElementById('settle-friend-id').value = pId;
    const balances = getBalances().balances;
    document.getElementById('settle-outstanding').innerText = formatCurrency(balances[pId] || 0);
    document.getElementById('settle-amount').value = '';
    openModal('modal-settle');
}

function saveSettlement(e) {
    e.preventDefault();
    const pId = document.getElementById('settle-friend-id').value;
    const amount = parseFloat(document.getElementById('settle-amount').value);
    
    state.expenses.push({
        id: 'tx_set_' + Date.now(),
        amount, desc: "Settlement", categoryId: null,
        date: new Date().toISOString().split('T')[0],
        personId: pId, isSettlement: true
    });
    
    closeAllModals();
    saveData();
    showToast("Settlement recorded");
}

// --- CATEGORIES & BUDGET ---
function addCategory(e) {
    e.preventDefault();
    state.categories.push({
        id: 'c_' + Date.now(),
        name: document.getElementById('new-cat-name').value,
        color: document.getElementById('new-cat-color').value,
        icon: '<circle cx="12" cy="12" r="10"></circle>'
    });
    document.getElementById('new-cat-name').value = '';
    saveData();
}

function deleteCategory(id) {
    if(confirm("Delete category?")) {
        state.categories = state.categories.filter(c => c.id !== id);
        saveData();
    }
}

function saveBudget(e) {
    e.preventDefault();
    state.budget = parseFloat(document.getElementById('budget-amount').value) || 0;
    closeAllModals();
    saveData();
    showToast("Budget updated");
}

function removeBudget() {
    state.budget = 0;
    closeAllModals();
    saveData();
    showToast("Budget removed");
}

// --- RENDERING ---
function renderAll() {
    const stats = getBalances();
    renderHome(stats);
    renderExpenses();
    renderSettlements(stats.balances);
    renderAnalytics(stats);
    renderManageCategories();
}

function renderHome(stats) {
    document.getElementById('home-my-spend').innerText = formatCurrency(stats.monthMySpend);
    document.getElementById('home-total-paid').innerText = formatCurrency(stats.monthTotalPaid);
    
    let toReceive = 0;
    Object.values(stats.balances).forEach(v => { if(v > 0) toReceive += v; });
    document.getElementById('home-to-receive').innerText = formatCurrency(toReceive);
    
    let remBudget = state.budget > 0 ? state.budget - stats.monthMySpend : 0;
    document.getElementById('home-budget-left').innerText = state.budget > 0 ? formatCurrency(remBudget) : '-';

    // Recent Expenses
    const recent = [...state.expenses].reverse().slice(0, 4);
    const container = document.getElementById('recent-expenses-list');
    if(recent.length === 0) {
        container.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><p>No expenses yet</p></div>`;
    } else {
        container.innerHTML = recent.map(tx => buildExpenseRow(tx)).join('');
    }
}

function renderExpenses() {
    const search = document.getElementById('expense-search').value.toLowerCase();
    const month = document.getElementById('expense-month').value;
    
    let filtered = [...state.expenses].reverse().filter(tx => {
        return tx.desc.toLowerCase().includes(search) && (!month || tx.date.startsWith(month));
    });
    
    const container = document.getElementById('expenses-list');
    if(filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><p>No expenses found</p></div>`;
    } else {
        container.innerHTML = filtered.map(tx => buildExpenseRow(tx, true)).join('');
    }
}

function buildExpenseRow(tx, showEdit = false) {
    if (tx.isSettlement) {
        const p = state.people.find(x => x.id === tx.personId) || {name: 'Unknown'};
        return `
            <div class="list-item card m-0 border-0 shadow-sm">
                <div class="flex-row align-center gap-sm">
                    <div class="icon-container bg-success-light text-success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg></div>
                    <div>
                        <div class="font-medium text-primary">Settlement from ${p.name}</div>
                        <div class="text-sm text-secondary">${tx.date}</div>
                    </div>
                </div>
                <div class="flex-col align-end">
                    <span class="font-bold text-success">+${formatCurrency(tx.amount)}</span>
                    ${showEdit ? `<button class="text-btn text-danger p-0 mt-xs" onclick="deleteExpense('${tx.id}')">Delete</button>` : ''}
                </div>
            </div>`;
    }

    const cat = state.categories.find(c => c.id === tx.categoryId) || {name: 'Other', color: '#888', icon: '<circle cx="12" cy="12" r="10"></circle>'};
    const splitBadge = (tx.splits && tx.splits.length > 0) ? `<span class="item-status text-primary font-medium" style="background:var(--primary-light); padding: 2px 6px; border-radius:4px; font-size:11px;">Split</span>` : '';

    return `
        <div class="list-item card m-0 border-0 shadow-sm ${showEdit ? 'clickable' : ''}" ${showEdit ? `onclick="openExpenseModal('${tx.id}')"` : ''}>
            <div class="flex-row align-center gap-sm">
                <div class="icon-container" style="background-color: ${cat.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${cat.icon}</svg></div>
                <div>
                    <div class="font-medium">${tx.desc}</div>
                    <div class="text-sm text-secondary">${cat.name} • ${tx.date} ${splitBadge}</div>
                </div>
            </div>
            <div class="font-bold">${formatCurrency(tx.amount)}</div>
        </div>`;
}

function renderSettlements(balances) {
    const list = document.getElementById('people-list');
    let totalOwed = 0;
    
    if(state.people.length === 0) {
        list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke-width="2"></path><circle cx="9" cy="7" r="4" stroke-width="2"></circle></svg><p>No friends added.</p></div>`;
        document.getElementById('settlements-total').innerText = '₹0';
        document.getElementById('settlements-count').innerText = '0 people';
        return;
    }

    list.innerHTML = state.people.map(p => {
        const bal = balances[p.id] || 0;
        if(bal > 0) totalOwed += bal;
        
        let status = bal === 0 ? '<span class="text-secondary font-medium">Settled</span>' : 
                    (bal > 0 ? `<span class="text-success font-medium">Owes you ${formatCurrency(bal)}</span>` : 
                               `<span class="text-danger font-medium">You owe ${formatCurrency(Math.abs(bal))}</span>`);

        return `
            <div class="card p-md shadow-sm">
                <div class="flex-between align-center mb-sm">
                    <div class="flex-row align-center gap-sm">
                        <div class="icon-container bg-light text-primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>
                        <span class="font-bold" style="font-size:1.1rem;">${p.name}</span>
                    </div>
                    ${status}
                </div>
                <div class="flex-row gap-sm border-top pt-sm">
                    <button class="btn btn-secondary flex-1 py-sm text-sm" onclick="openSettleModal('${p.id}')">Record Payment</button>
                    <button class="btn-ghost text-danger text-sm" onclick="deletePerson('${p.id}')">Remove</button>
                </div>
            </div>`;
    }).join('');

    document.getElementById('settlements-total').innerText = formatCurrency(totalOwed);
    document.getElementById('settlements-count').innerText = `${state.people.length} people`;
}

function renderAnalytics(stats) {
    document.getElementById('analytics-total').innerText = formatCurrency(stats.monthMySpend);
    
    const currMonth = new Date().toISOString().substring(0, 7);
    let catTotals = {};
    
    state.expenses.forEach(tx => {
        if (!tx.isSettlement && tx.date.startsWith(currMonth)) {
            let myShare = tx.amount;
            if(tx.splits) tx.splits.forEach(s => myShare -= s.amount);
            if(myShare > 0) {
                if(!catTotals[tx.categoryId]) catTotals[tx.categoryId] = 0;
                catTotals[tx.categoryId] += myShare;
            }
        }
    });

    const pie = document.getElementById('pie-chart');
    const leg = document.getElementById('pie-legend');
    
    if(stats.monthMySpend === 0) {
        pie.style.background = 'var(--border)';
        leg.innerHTML = '<p class="text-center text-muted">No data this month.</p>';
        return;
    }

    let grad = '', start = 0;
    leg.innerHTML = '';
    
    Object.keys(catTotals).sort((a,b) => catTotals[b] - catTotals[a]).forEach(cId => {
        const cat = state.categories.find(c => c.id === cId) || {name:'Other', color:'#888'};
        const amt = catTotals[cId];
        const pct = (amt / stats.monthMySpend) * 100;
        
        grad += `${cat.color} ${start}% ${start + pct}%, `;
        start += pct;

        leg.innerHTML += `
            <div class="flex-between align-center p-sm card m-0 shadow-sm border-0">
                <div class="flex-row align-center gap-sm">
                    <span class="legend-dot" style="background:${cat.color}"></span>
                    <span class="text-sm font-medium">${cat.name}</span>
                </div>
                <span class="font-bold">${formatCurrency(amt)}</span>
            </div>`;
    });
    
    pie.style.background = `conic-gradient(${grad.slice(0, -2)})`;
}

function renderManageCategories() {
    populateCategoriesDropdown(); // Ensure global dropdown is synced
    const list = document.getElementById('category-manage-list');
    list.innerHTML = state.categories.map(c => `
        <div class="list-item">
            <div class="flex-row align-center gap-sm">
                <span class="legend-dot" style="background:${c.color}"></span>
                <span class="font-medium">${c.name}</span>
            </div>
            <button class="icon-btn text-danger" onclick="deleteCategory('${c.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
        </div>
    `).join('');
}

// --- DATA ---
function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `PocketSplit_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast("Backup exported");
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            state = { ...state, ...JSON.parse(e.target.result) };
            saveData();
            showToast("Data imported");
        } catch (err) { alert("Invalid backup file"); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

function clearAllData() {
    if(confirm("DANGER! This will permanently delete ALL data. Are you absolutely sure?")) {
        localStorage.removeItem('pocketsplit_data');
        location.reload();
    }
}

// Boot
window.onload = init;
