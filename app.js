// --- STATE MANAGEMENT ---
const DEFAULT_CATEGORIES = [
    { id: 'c_food', name: 'Food & Dining', color: '#FF9500', icon: '<circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>' },
    { id: 'c_trans', name: 'Transport', color: '#007AFF', icon: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>' },
    { id: 'c_shop', name: 'Shopping', color: '#AF52DE', icon: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path>' },
    { id: 'c_ent', name: 'Entertainment', color: '#FF2D55', icon: '<polygon points="5 3 19 12 5 21 5 3"></polygon>' },
    { id: 'c_home', name: 'Home/Bills', color: '#34C759', icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>' }
];

let state = {
    theme: 'light',
    budget: 0,
    categories: [...DEFAULT_CATEGORIES],
    people: [],
    transactions: [] // format: { id, amount, desc, categoryId, date, paidBy (id|'me'), splits: [{personId, amount}], gpayStatus ('pending'|'done'|'ignore'), isSettlement: false }
};

// --- INIT & PERSISTENCE ---
function init() {
    const saved = localStorage.getItem('pocketsplit_state');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed };
        } catch(e) { console.error("Could not parse saved data", e); }
    }
    
    applyTheme(state.theme);
    
    // Set default dates in inputs
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('exp-date').value = today;
    
    const monthStr = today.substring(0, 7);
    document.getElementById('expense-month-filter').value = monthStr;

    // Build UI
    renderAll();
}

function saveData() {
    localStorage.setItem('pocketsplit_state', JSON.stringify(state));
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
    const metaTheme = document.getElementById('meta-theme-color');
    metaTheme.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff');
}

// --- NAVIGATION ---
function switchTab(tabId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(`view-${tabId}`).classList.add('active');
    document.querySelector(`.nav-item[data-target="${tabId}"]`).classList.add('active');
    
    const titles = { 'home': 'Home', 'expenses': 'Expenses', 'settlements': 'People & Settlements', 'budget': 'Budget', 'more': 'Settings' };
    document.getElementById('header-title').innerText = titles[tabId];
}

// --- MODALS ---
let activeModal = null;
function openModal(id) {
    document.getElementById('modal-backdrop').style.display = 'block';
    const modal = document.getElementById(id);
    modal.style.display = 'flex';
    // slight delay for animation
    setTimeout(() => {
        document.getElementById('modal-backdrop').style.opacity = '1';
        modal.classList.add('show');
    }, 10);
    activeModal = id;
}

function closeAllModals() {
    if (!activeModal) return;
    const modal = document.getElementById(activeModal);
    modal.classList.remove('show');
    document.getElementById('modal-backdrop').style.opacity = '0';
    
    setTimeout(() => {
        modal.style.display = 'none';
        document.getElementById('modal-backdrop').style.display = 'none';
        activeModal = null;
    }, 300); // match css transition
}

// --- CORE CALCULATION ENGINE ---
function calculateBalances() {
    // Reset balances
    let balances = {}; // { personId: netAmountOwedToMe }
    state.people.forEach(p => balances[p.id] = 0);
    
    let totalMySpendThisMonth = 0;
    let totalPaidThisMonth = 0;
    
    const currentMonthFilter = document.getElementById('expense-month-filter').value || new Date().toISOString().substring(0, 7);

    state.transactions.forEach(tx => {
        const isCurrentMonth = tx.date.startsWith(currentMonthFilter);
        
        if (tx.isSettlement) {
            // It's a payment. if paidBy='me', split[0].personId=friend (I paid friend -> friend owes me)
            const amount = tx.amount;
            if (tx.paidBy === 'me') {
                if(balances[tx.splits[0].personId] !== undefined) balances[tx.splits[0].personId] += amount;
            } else {
                if(balances[tx.paidBy] !== undefined) balances[tx.paidBy] -= amount;
            }
        } else {
            // Normal expense
            let myShare = 0;
            let iPaid = tx.paidBy === 'me';
            
            // Calculate my share. Total - sum(friends shares) = my share
            let totalFriendsShare = 0;
            tx.splits.forEach(s => {
                totalFriendsShare += s.amount;
                // If I paid, they owe me their share
                if (iPaid) {
                    if(balances[s.personId] !== undefined) balances[s.personId] += s.amount;
                } else {
                    // If a friend paid, and I am NOT in the split list... wait.
                    // The split list defines who owes the payer. 
                    // If Friend A paid, and the split has 'me' (represented implicitly if totalFriendsShare < totalAmount), I owe them.
                    // Let's formalize: splits array only contains FRIENDS. 
                    // If friend paid, their portion is implicitly (total - sum(splits)).
                    // Actually, if friend paid, the splits array defines who owes that friend.
                    // If I owe that friend, there should be an entry for me?
                    // To keep it simple: splits array only holds friends.
                    // If paidBy == friendId, and totalFriendsShare < tx.amount, the remainder is MY share (I owe them).
                }
            });
            
            myShare = tx.amount - totalFriendsShare;
            
            if (!iPaid) {
                // friend paid. I owe them myShare.
                if(balances[tx.paidBy] !== undefined) balances[tx.paidBy] -= myShare;
                
                // If another friend B is in the split, friend B owes friend A. We don't track friend-to-friend balances in this simple app, only User-to-Friend.
            }

            if (isCurrentMonth && !tx.isSettlement) {
                totalMySpendThisMonth += myShare;
                totalPaidThisMonth += tx.amount;
            }
        }
    });

    return { balances, totalMySpendThisMonth, totalPaidThisMonth };
}

// --- EXPENSE ENTRY LOGIC ---
let currentSplitType = 'equal';

function setSplitType(type) {
    currentSplitType = type;
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.seg-btn[data-type="${type}"]`).classList.add('active');
    calculateSplits();
}

function toggleSplitUI() {
    const isSplit = document.getElementById('exp-is-split').checked;
    document.getElementById('split-ui').style.display = isSplit ? 'block' : 'none';
    if(isSplit && state.people.length === 0) {
        alert("Please add people in the Settlements tab first!");
        document.getElementById('exp-is-split').checked = false;
        document.getElementById('split-ui').style.display = 'none';
    } else {
        renderSplitMembers();
        calculateSplits();
    }
}

function renderSplitMembers() {
    const container = document.getElementById('split-members-list');
    container.innerHTML = '';
    state.people.forEach(p => {
        container.innerHTML += `
            <div class="split-person-row">
                <input type="checkbox" class="split-check" value="${p.id}" checked onchange="calculateSplits()">
                <span class="flex-1 font-medium">${p.name}</span>
                <input type="number" class="split-val" data-id="${p.id}" placeholder="0" min="0" step="0.01" oninput="handleManualSplitInput()">
            </div>
        `;
    });
}

function handleManualSplitInput() {
    if (currentSplitType === 'equal') {
        // user manually typing overrides equal, switch to custom
        setSplitType('custom');
        return;
    }
    updateSplitTotal();
}

function calculateSplits() {
    const total = parseFloat(document.getElementById('exp-amount').value) || 0;
    const rows = document.querySelectorAll('.split-person-row');
    const checkedRows = Array.from(rows).filter(r => r.querySelector('.split-check').checked);
    
    if (checkedRows.length === 0) {
        document.getElementById('split-total-check').innerText = `₹0.00`;
        return;
    }

    if (currentSplitType === 'equal') {
        // Equal includes ME implicitly if I'm involved. Let's assume splitting equally among checked friends + ME.
        const splitAmount = (total / (checkedRows.length + 1)).toFixed(2); 
        checkedRows.forEach(r => {
            r.querySelector('.split-val').value = splitAmount;
        });
    } else if (currentSplitType === 'percent') {
        // In percent mode, inputs represent percentages.
        // We calculate total allocated based on the percentages they typed.
        checkedRows.forEach(r => {
            const pct = parseFloat(r.querySelector('.split-val').value) || 0;
            // visually we don't update the input because they are typing the %, we just calculate the background total
        });
    }
    
    updateSplitTotal();
}

function updateSplitTotal() {
    const total = parseFloat(document.getElementById('exp-amount').value) || 0;
    let allocated = 0;
    
    document.querySelectorAll('.split-person-row').forEach(r => {
        if(r.querySelector('.split-check').checked) {
            let val = parseFloat(r.querySelector('.split-val').value) || 0;
            if (currentSplitType === 'percent') {
                allocated += total * (val / 100);
            } else {
                allocated += val;
            }
        }
    });
    
    const displayVal = currentSplitType === 'percent' ? `(Percentages used) Approx ₹${allocated.toFixed(2)}` : `₹${allocated.toFixed(2)}`;
    document.getElementById('split-total-check').innerText = displayVal;
    document.getElementById('split-total-check').className = allocated > total ? 'text-danger font-medium' : 'text-primary font-medium';
}

function openExpenseModal(id = null) {
    const form = document.getElementById('form-expense');
    form.reset();
    document.getElementById('exp-id').value = id || '';
    document.getElementById('modal-expense-title').innerText = id ? 'Edit Expense' : 'Add Expense';
    
    // Populate dropdowns
    const catSelect = document.getElementById('exp-category');
    catSelect.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    
    const payerSelect = document.getElementById('exp-paid-by');
    payerSelect.innerHTML = `<option value="me">Me</option>` + state.people.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    
    document.getElementById('split-ui').style.display = 'none';

    if (id) {
        const tx = state.transactions.find(t => t.id === id);
        if (tx) {
            document.getElementById('exp-amount').value = tx.amount;
            document.getElementById('exp-desc').value = tx.desc;
            document.getElementById('exp-category').value = tx.categoryId;
            document.getElementById('exp-date').value = tx.date;
            document.getElementById('exp-paid-by').value = tx.paidBy;
            
            if (tx.splits && tx.splits.length > 0) {
                document.getElementById('exp-is-split').checked = true;
                document.getElementById('split-ui').style.display = 'block';
                setSplitType('custom');
                renderSplitMembers();
                
                // Uncheck all first
                document.querySelectorAll('.split-check').forEach(cb => cb.checked = false);
                
                // Fill data
                tx.splits.forEach(s => {
                    const row = document.querySelector(`.split-val[data-id="${s.personId}"]`);
                    if(row) {
                        row.value = s.amount;
                        row.closest('.split-person-row').querySelector('.split-check').checked = true;
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

let tempGPayExpenseId = null;

function saveExpense(e) {
    e.preventDefault();
    const id = document.getElementById('exp-id').value || 'tx_' + Date.now();
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const paidBy = document.getElementById('exp-paid-by').value;
    const isSplit = document.getElementById('exp-is-split').checked;
    
    let splits = [];
    if (isSplit) {
        document.querySelectorAll('.split-person-row').forEach(r => {
            if(r.querySelector('.split-check').checked) {
                const pId = r.querySelector('.split-val').dataset.id;
                let val = parseFloat(r.querySelector('.split-val').value) || 0;
                if (currentSplitType === 'percent') {
                    val = amount * (val / 100);
                }
                splits.push({ personId: pId, amount: val });
            }
        });
    }

    // Validation
    const allocated = splits.reduce((sum, s) => sum + s.amount, 0);
    if (allocated > amount) {
        alert("Split total cannot exceed expense amount!");
        return;
    }

    // Keep existing gpay status if editing
    let gpayStatus = 'ignore';
    const existing = state.transactions.find(t => t.id === id);
    if (existing) {
        gpayStatus = existing.gpayStatus || 'ignore';
    }

    const tx = {
        id,
        amount,
        desc: document.getElementById('exp-desc').value,
        categoryId: document.getElementById('exp-category').value,
        date: document.getElementById('exp-date').value,
        paidBy,
        splits,
        gpayStatus,
        isSettlement: false
    };

    if (existing) {
        const idx = state.transactions.findIndex(t => t.id === id);
        state.transactions[idx] = tx;
    } else {
        state.transactions.push(tx);
    }
    
    closeAllModals();
    saveData();

    // Trigger GPay reminder if I paid and split it with friends, and it's new
    if (!existing && paidBy === 'me' && splits.length > 0) {
        tempGPayExpenseId = id;
        document.getElementById('gpay-prompt-amount').innerText = `₹${amount}`;
        setTimeout(() => openModal('modal-gpay'), 400); // slight delay after closing previous
    }
}

function handleGPayAction(action) {
    if(!tempGPayExpenseId) return;
    const tx = state.transactions.find(t => t.id === tempGPayExpenseId);
    if(tx) {
        if (action === 'now') {
            tx.gpayStatus = 'done';
            // In a real app, use Web Share API or deep link: window.open('upi://pay?...')
            alert("Opening GPay... (Simulation)");
        } else if (action === 'later') {
            tx.gpayStatus = 'pending';
        } else {
            tx.gpayStatus = 'ignore';
        }
        saveData();
    }
    closeAllModals();
}

function deleteExpense(id) {
    if(confirm("Delete this transaction?")) {
        state.transactions = state.transactions.filter(t => t.id !== id);
        saveData();
    }
}

// --- PEOPLE & SETTLEMENTS ---
function savePerson(e) {
    e.preventDefault();
    const id = document.getElementById('person-id').value || 'p_' + Date.now();
    const name = document.getElementById('person-name').value;
    
    const existing = state.people.find(p => p.id === id);
    if(existing) existing.name = name;
    else state.people.push({ id, name });
    
    closeAllModals();
    saveData();
}

function deletePerson(id) {
    if(confirm("Remove this person? Their history will remain in transactions but might look weird.")) {
        state.people = state.people.filter(p => p.id !== id);
        saveData();
    }
}

function openSettleModal(friendId) {
    document.getElementById('settle-friend-id').value = friendId;
    document.getElementById('settle-amount').value = '';
    const friend = state.people.find(p => p.id === friendId);
    document.getElementById('settle-desc').innerText = `Record a settlement with ${friend.name}.`;
    openModal('modal-settle');
}

function saveSettlement(e) {
    e.preventDefault();
    const fId = document.getElementById('settle-friend-id').value;
    const amount = parseFloat(document.getElementById('settle-amount').value);
    const direction = document.getElementById('settle-direction').value;
    
    // Create a settlement transaction
    const tx = {
        id: 'tx_set_' + Date.now(),
        amount: amount,
        desc: "Settlement",
        categoryId: null,
        date: new Date().toISOString().split('T')[0],
        paidBy: direction === 'paid' ? 'me' : fId,
        splits: [{ personId: direction === 'paid' ? fId : fId, amount: amount }], // Formatting to fit the calculation logic
        isSettlement: true
    };
    
    state.transactions.push(tx);
    closeAllModals();
    saveData();
}

// --- CATEGORIES ---
function saveCategory(e) {
    e.preventDefault();
    const name = document.getElementById('new-cat-name').value;
    const color = document.getElementById('new-cat-color').value;
    state.categories.push({
        id: 'c_' + Date.now(),
        name, color,
        icon: '<circle cx="12" cy="12" r="10"></circle>' // generic icon
    });
    document.getElementById('new-cat-name').value = '';
    saveData();
    renderManageCategories();
}

function deleteCategory(id) {
    if(confirm("Delete category?")) {
        state.categories = state.categories.filter(c => c.id !== id);
        saveData();
        renderManageCategories();
    }
}

// --- BUDGET ---
function saveBudget(e) {
    e.preventDefault();
    state.budget = parseFloat(document.getElementById('budget-amount').value) || 0;
    closeAllModals();
    saveData();
}
function clearBudget() {
    state.budget = 0;
    closeAllModals();
    saveData();
}

// --- RENDERING ---
function renderAll() {
    const calc = calculateBalances();
    renderHome(calc);
    renderExpenses();
    renderSettlements(calc.balances);
    renderBudget(calc.totalMySpendThisMonth);
}

function renderHome(calc) {
    document.getElementById('home-total-spend').innerText = `₹${calc.totalMySpendThisMonth.toFixed(2)}`;
    
    let remBudget = state.budget > 0 ? (state.budget - calc.totalMySpendThisMonth) : 0;
    document.getElementById('home-budget-left').innerText = state.budget > 0 ? `₹${remBudget.toFixed(0)}` : 'N/A';
    
    let owedToMe = 0;
    let iOwe = 0;
    Object.values(calc.balances).forEach(b => {
        if(b > 0) owedToMe += b;
        else if (b < 0) iOwe += Math.abs(b);
    });
    
    document.getElementById('home-owed-to-me').innerText = `₹${owedToMe.toFixed(0)}`;
    
    // GPay Reminders
    const pendingGpay = state.transactions.filter(t => t.gpayStatus === 'pending');
    const gpaySec = document.getElementById('gpay-reminders-section');
    const gpayList = document.getElementById('gpay-reminders-list');
    if (pendingGpay.length > 0) {
        gpaySec.style.display = 'block';
        gpayList.innerHTML = pendingGpay.map(tx => `
            <div class="list-item bg-primary-light border-0">
                <div class="item-content">
                    <div class="item-title text-primary">${tx.desc}</div>
                    <div class="item-subtitle">Request ₹${tx.amount}</div>
                </div>
                <div class="flex-row gap-xs">
                    <button class="btn-sm btn-primary" onclick="tempGPayExpenseId='${tx.id}'; handleGPayAction('now')">Done</button>
                    <button class="icon-btn" onclick="tempGPayExpenseId='${tx.id}'; handleGPayAction('ignore')"><svg width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                </div>
            </div>
        `).join('');
    } else {
        gpaySec.style.display = 'none';
    }

    // Recent
    const recent = [...state.transactions].reverse().slice(0, 5);
    const recentContainer = document.getElementById('home-recent-expenses');
    if (recent.length === 0) {
        recentContainer.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke-width="2"></circle><line x1="12" y1="8" x2="12" y2="12" stroke-width="2"></line><line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2"></line></svg><p>No expenses yet. Add one!</p></div>`;
    } else {
        recentContainer.innerHTML = recent.map(tx => buildExpenseHTML(tx)).join('');
    }
}

function renderExpenses() {
    const search = document.getElementById('expense-search').value.toLowerCase();
    const month = document.getElementById('expense-month-filter').value;
    
    let filtered = [...state.transactions].reverse().filter(tx => {
        const matchSearch = tx.desc.toLowerCase().includes(search);
        const matchMonth = month ? tx.date.startsWith(month) : true;
        return matchSearch && matchMonth;
    });
    
    const container = document.getElementById('expense-list-container');
    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke-width="2"></circle><line x1="21" y1="21" x2="16.65" y2="16.65" stroke-width="2"></line></svg><p>No matches found</p></div>`;
    } else {
        container.innerHTML = filtered.map(tx => buildExpenseHTML(tx)).join('');
    }
}

function buildExpenseHTML(tx) {
    if (tx.isSettlement) {
        return `
            <div class="list-item">
                <div class="icon-box bg-light text-success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg></div>
                <div class="item-content">
                    <div class="item-title">Settlement</div>
                    <div class="item-subtitle">${tx.date}</div>
                </div>
                <div class="item-right">
                    <div class="item-amount text-success">₹${tx.amount.toFixed(2)}</div>
                </div>
                <button class="icon-btn text-danger" onclick="deleteExpense('${tx.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
        `;
    }

    const cat = state.categories.find(c => c.id === tx.categoryId) || { name: 'Other', color: '#888', icon: '<circle cx="12" cy="12" r="10"></circle>' };
    
    let subTxt = tx.date;
    if (tx.splits.length > 0) {
        subTxt += ` • Split`;
    }

    return `
        <div class="list-item" onclick="openExpenseModal('${tx.id}')">
            <div class="icon-box" style="background-color: ${cat.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${cat.icon}</svg></div>
            <div class="item-content">
                <div class="item-title">${tx.desc}</div>
                <div class="item-subtitle">${subTxt}</div>
            </div>
            <div class="item-right">
                <div class="item-amount">₹${tx.amount.toFixed(2)}</div>
            </div>
        </div>
    `;
}

function renderSettlements(balances) {
    const container = document.getElementById('people-list-container');
    
    let netTotal = 0;
    Object.values(balances).forEach(v => netTotal += v);
    
    const banner = document.getElementById('settlements-net-amount');
    banner.innerText = `₹${Math.abs(netTotal).toFixed(0)}`;
    banner.className = netTotal > 0 ? 'text-success' : (netTotal < 0 ? 'text-danger' : '');
    document.getElementById('settlements-net-banner').style.display = state.people.length > 0 ? 'block' : 'none';

    if (state.people.length === 0) {
        container.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke-width="2"></path><circle cx="9" cy="7" r="4" stroke-width="2"></circle></svg><p>No friends added yet.</p></div>`;
        return;
    }

    container.innerHTML = state.people.map(p => {
        const bal = balances[p.id] || 0;
        let balStr = "Settled up";
        let balClass = "text-secondary";
        if (bal > 0) { balStr = `Owes you ₹${bal.toFixed(0)}`; balClass = "text-success"; }
        else if (bal < 0) { balStr = `You owe ₹${Math.abs(bal).toFixed(0)}`; balClass = "text-danger"; }

        return `
            <div class="card flex-row align-center gap-md">
                <div class="icon-box bg-primary-light text-primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>
                <div class="item-content">
                    <div class="item-title">${p.name}</div>
                    <div class="item-subtitle font-medium ${balClass}">${balStr}</div>
                </div>
                <div class="flex-row gap-xs">
                    <button class="btn-sm btn-secondary" onclick="openSettleModal('${p.id}')">Settle</button>
                    <button class="icon-btn text-danger" onclick="deletePerson('${p.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                </div>
            </div>
        `;
    }).join('');
}

function renderBudget(spent) {
    const card = document.getElementById('budget-overview-card');
    
    if (state.budget <= 0) {
        card.innerHTML = `<div class="empty-state border-0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg><p>No monthly budget set.</p></div>`;
        document.getElementById('analytics-pie').style.background = 'var(--border)';
        document.getElementById('analytics-legend').innerHTML = '';
        return;
    }

    const pct = Math.min((spent / state.budget) * 100, 100);
    const pClass = pct > 90 ? 'danger' : (pct > 75 ? 'warning' : '');
    
    card.innerHTML = `
        <div class="flex-between mb-xs">
            <span class="text-sm text-secondary">Monthly Budget</span>
            <span class="font-medium">₹${state.budget}</span>
        </div>
        <div class="progress-container">
            <div class="progress-bar ${pClass}" style="width: ${pct}%"></div>
        </div>
        <div class="flex-between mt-xs">
            <span class="text-sm">₹${spent.toFixed(0)} spent</span>
            <span class="text-sm text-secondary">${(100 - pct).toFixed(1)}% remaining</span>
        </div>
    `;

    // Analytics Calculation (Current Month)
    const currentMonthFilter = new Date().toISOString().substring(0, 7);
    let catTotals = {};
    
    state.transactions.forEach(tx => {
        if (!tx.isSettlement && tx.date.startsWith(currentMonthFilter)) {
            // approximate my share for analytics
            let totalFriendsShare = 0;
            tx.splits.forEach(s => totalFriendsShare += s.amount);
            let myShare = tx.amount - totalFriendsShare;
            
            if(!catTotals[tx.categoryId]) catTotals[tx.categoryId] = 0;
            catTotals[tx.categoryId] += myShare;
        }
    });

    const pie = document.getElementById('analytics-pie');
    const leg = document.getElementById('analytics-legend');
    
    if(spent === 0) {
        pie.style.background = 'var(--border)';
        leg.innerHTML = '<p class="text-center text-sm text-secondary">No personal spend this month.</p>';
        return;
    }

    let grad = '';
    let start = 0;
    leg.innerHTML = '';

    Object.keys(catTotals).forEach(cId => {
        const cat = state.categories.find(c => c.id === cId) || { name:'Other', color:'#888'};
        const amt = catTotals[cId];
        if (amt <= 0) return;
        
        const p = (amt / spent) * 100;
        const end = start + p;
        grad += `${cat.color} ${start}% ${end}%, `;
        start = end;

        leg.innerHTML += `
            <div class="flex-between align-center p-sm card mb-xs" style="box-shadow:none;">
                <div class="flex-row align-center gap-sm">
                    <span class="legend-color" style="background-color: ${cat.color};"></span>
                    <span>${cat.name}</span>
                </div>
                <strong>₹${amt.toFixed(0)}</strong>
            </div>
        `;
    });
    
    pie.style.background = `conic-gradient(${grad.slice(0, -2)})`;
}

function renderManageCategories() {
    const list = document.getElementById('manage-category-list');
    list.innerHTML = state.categories.map(c => `
        <div class="list-group-item">
            <div class="flex-row align-center gap-sm">
                <span class="legend-color" style="background-color: ${c.color};"></span>
                <span>${c.name}</span>
            </div>
            <button class="icon-btn text-danger" onclick="deleteCategory('${c.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
        </div>
    `).join('');
}

// Ensure category management modal populates on open
document.querySelector('[onclick="openModal(\'modal-categories\')"]').addEventListener('click', renderManageCategories);


// --- DATA UTILS ---
function exportData() {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PocketSplit_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (parsed.transactions) {
                state = { ...state, ...parsed };
                saveData();
                alert("Data imported successfully!");
            }
        } catch (err) { alert("Invalid backup file."); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function clearData() {
    if(confirm("DANGER! This will delete ALL data. Proceed?")) {
        localStorage.removeItem('pocketsplit_state');
        location.reload();
    }
}

// Start app
window.onload = init;
