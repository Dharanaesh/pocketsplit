/**
 * PocketSplit - Core Logic
 */

// --- 1. STRICT IN-MEMORY AUTHENTICATION ---
window.POCKETSPLIT_AUTH = { isUnlocked: false };
const STORAGE_KEY = 'pocketsplit_data';
const PIN_KEY = 'pocketSplit_accessCode';

let state = {
    expenses: [],
    people: [],
    categories: [],
    budget: 0
};

let currentSplitType = 'equal';
let splitDataState = []; 

// Settlement UI State
let settlementView = 'expense'; 
let settlementFilter = 'all'; 
let expandedExpenses = {}; 

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    if (!localStorage.getItem(PIN_KEY)) localStorage.setItem(PIN_KEY, '1234'); 

    const savedCode = localStorage.getItem(PIN_KEY);
    if (savedCode && !window.POCKETSPLIT_AUTH.isUnlocked) {
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('app-shell').style.display = 'none';
    } else {
        unlockAppSuccess();
    }
});

// --- AUTH LOGIC ---
window.handleLogin = function(e) {
    e.preventDefault();
    const enteredCode = document.getElementById('access-code').value;
    const savedCode = localStorage.getItem(PIN_KEY);
    
    if (enteredCode === savedCode) {
        window.POCKETSPLIT_AUTH.isUnlocked = true;
        document.getElementById('login-error').style.display = 'none';
        unlockAppSuccess();
    } else {
        document.getElementById('login-error').style.display = 'block';
    }
};

function unlockAppSuccess() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('access-code').value = '';
    renderAll();
}

window.logout = function() {
    window.POCKETSPLIT_AUTH.isUnlocked = false;
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-screen').classList.add('active');
    closeAllModals();
};

// --- CORE FINANCIAL MATH ---
function roundToTwo(num) {
    return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
}

// --- STATE MANAGEMENT ---
function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed };
            state.expenses = state.expenses.map(e => ({
                ...e,
                amount: Number(e.amount),
                gpayRequestStatus: e.gpayRequestStatus || 'not_sent',
                gpayRequestSentAt: e.gpayRequestSentAt || null,
                splitData: e.splitData ? e.splitData.map(s => ({...s, share: Number(s.share)})) : null
            }));
            if (!state.categories || state.categories.length === 0) {
                state.categories = [{ id: 'c1', name: 'General', color: '#5B5FEF' }];
            }
        } else {
            state.categories = [{ id: 'c1', name: 'General', color: '#5B5FEF' }];
        }
    } catch (e) {
        console.error("Corrupted local storage. Starting fresh.");
        state.categories = [{ id: 'c1', name: 'General', color: '#5B5FEF' }];
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
}

// --- UI & NAVIGATION ---
window.switchTab = function(tabId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${tabId}`).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(n => {
        if (n.dataset.target === tabId) n.classList.add('active');
        else n.classList.remove('active');
    });
    renderAll();
};

window.toggleTheme = function() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
};

// --- MODALS ---
window.openModal = function(id) {
    document.getElementById('overlay').style.display = 'block';
    setTimeout(() => {
        document.getElementById('overlay').style.opacity = '1';
        document.getElementById(id).style.display = 'flex';
        setTimeout(() => document.getElementById(id).classList.add('show'), 10);
    }, 10);
};

window.closeAllModals = function() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
    document.getElementById('overlay').style.opacity = '0';
    setTimeout(() => {
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        document.getElementById('overlay').style.display = 'none';
    }, 300);
};

window.openExpenseModal = function() {
    document.getElementById('exp-id').value = '';
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-desc').value = '';
    document.getElementById('exp-date').value = new Date().toISOString().split('T')[0];
    
    const catSelect = document.getElementById('exp-category');
    catSelect.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    
    document.getElementById('exp-is-split').checked = false;
    document.getElementById('split-section').style.display = 'none';
    currentSplitType = 'equal';
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.seg-btn[data-type="equal"]').classList.add('active');
    
    document.getElementById('btn-delete-expense').style.display = 'none';
    openModal('modal-expense');
};

// --- SPLIT ENGINE ---
window.toggleSplitUI = function() {
    const isChecked = document.getElementById('exp-is-split').checked;
    document.getElementById('split-section').style.display = isChecked ? 'block' : 'none';
    
    if (isChecked) {
        splitDataState = [{personId: 'you', name: 'You', selected: true, share: 0}];
        state.people.forEach(p => {
            splitDataState.push({personId: p.id, name: p.name, selected: true, share: 0});
        });
        renderSplitMembers();
    }
};

window.setSplitType = function(type) {
    currentSplitType = type;
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.seg-btn[data-type="${type}"]`).classList.add('active');
    splitDataState.forEach(s => s.share = 0);
    renderSplitMembers();
};

window.renderSplitMembers = function() {
    const list = document.getElementById('split-members-list');
    
    if (splitDataState.length <= 1) {
        list.innerHTML = `<p class="text-sm text-secondary">Please add people in the Settlements tab first.</p>`;
        calculateSplits(); 
        return;
    }
    
    list.innerHTML = splitDataState.map((s, idx) => `
        <div class="split-row flex-between align-center">
            <label class="flex-row align-center gap-sm cursor-pointer mb-0">
                <input type="checkbox" class="checkbox-custom" 
                       onchange="togglePersonSplit(${idx}, this.checked)" 
                       ${s.selected ? 'checked' : ''}>
                <span class="font-medium">${s.name}</span>
            </label>
            <div class="flex-row align-center gap-xs">
                ${currentSplitType === 'percent' ? '<span>%</span>' : (currentSplitType === 'custom' ? '<span class="text-secondary">₹</span>' : '')}
                <input type="number" class="input-standard p-sm text-right" 
                       style="width: 90px;"
                       value="${s.share}" 
                       ${currentSplitType === 'equal' || !s.selected ? 'disabled' : ''}
                       oninput="updatePersonShare(${idx}, this.value)"
                       min="0" step="any">
            </div>
        </div>
    `).join('');
    calculateSplits();
};

window.togglePersonSplit = function(idx, isChecked) {
    splitDataState[idx].selected = isChecked;
    if (!isChecked) splitDataState[idx].share = 0;
    renderSplitMembers();
};

window.updatePersonShare = function(idx, val) {
    splitDataState[idx].share = parseFloat(val) || 0;
    calculateSplits();
};

window.calculateSplits = function() {
    const isSplit = document.getElementById('exp-is-split').checked;
    if (!isSplit) return;
    
    const totalExp = roundToTwo(document.getElementById('exp-amount').value || 0);
    const selected = splitDataState.filter(s => s.selected);
    let calculatedTotal = 0;
    
    const valText = document.getElementById('split-validation-text');
    const valTotal = document.getElementById('split-total-amount');

    if (currentSplitType === 'equal') {
        if (selected.length > 0) {
            const splitAmount = roundToTwo(totalExp / selected.length);
            splitDataState.forEach(s => { s.share = s.selected ? splitAmount : 0; });
            document.querySelectorAll('.split-row input[type="number"]').forEach((input, idx) => {
                if (splitDataState[idx].selected) input.value = splitAmount;
            });
            calculatedTotal = roundToTwo(splitAmount * selected.length);
        }
        valText.innerText = "Calculated Total:";
        valTotal.innerText = formatINR(calculatedTotal);
        valTotal.className = Math.abs(totalExp - calculatedTotal) < 0.1 ? 'text-success' : 'text-danger';
        
    } else if (currentSplitType === 'percent') {
        calculatedTotal = selected.reduce((sum, s) => sum + s.share, 0);
        valText.innerText = "Total Percentage:";
        valTotal.innerText = `${roundToTwo(calculatedTotal)}%`;
        valTotal.className = roundToTwo(calculatedTotal) === 100 ? 'text-success' : 'text-danger';
        
    } else if (currentSplitType === 'custom') {
        calculatedTotal = selected.reduce((sum, s) => sum + s.share, 0);
        valText.innerText = "Calculated Total:";
        valTotal.innerText = formatINR(calculatedTotal);
        valTotal.className = roundToTwo(calculatedTotal) === totalExp ? 'text-success' : 'text-danger';
    }
};

function validateSplitData(amount, type, data) {
    if (data.length === 0) throw new Error("Please select at least one person for the split.");
    if (type === 'percent') {
        const total = roundToTwo(data.reduce((sum, d) => sum + d.share, 0));
        if (total !== 100) throw new Error(`Percentages must equal 100% (Currently ${total}%).`);
    } else if (type === 'custom') {
        const total = roundToTwo(data.reduce((sum, d) => sum + d.share, 0));
        if (total !== roundToTwo(amount)) throw new Error(`Custom shares must equal the total expense amount.`);
    }
}

// --- EXPENSE LOGIC ---
window.saveExpense = function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; 
    
    try {
        const id = document.getElementById('exp-id').value || 'exp_' + Date.now();
        const amount = roundToTwo(document.getElementById('exp-amount').value);
        const desc = document.getElementById('exp-desc').value.trim();
        const category = document.getElementById('exp-category').value;
        const dateStr = document.getElementById('exp-date').value; 
        const isSplit = document.getElementById('exp-is-split').checked;
        
        if (amount <= 0) throw new Error("Amount must be greater than 0");
        
        const existingExp = state.expenses.find(ex => ex.id === id);
        let gpayRequestStatus = existingExp ? existingExp.gpayRequestStatus : 'not_sent';
        let gpayRequestSentAt = existingExp ? existingExp.gpayRequestSentAt : null;

        let splitType = 'none';
        let splitData = null;

        if (isSplit) {
            splitType = currentSplitType;
            splitData = splitDataState.filter(s => s.selected).map(s => {
                let actualShare = s.share;
                if (currentSplitType === 'percent') {
                    actualShare = roundToTwo(amount * (s.share / 100));
                }
                
                let existingSettledState = false;
                if (existingExp && existingExp.splitData) {
                    const existingShare = existingExp.splitData.find(oldS => oldS.personId === s.personId);
                    if (existingShare) existingSettledState = existingShare.isSettled;
                }
                
                return { personId: s.personId, share: actualShare, rawValue: s.share, isSettled: existingSettledState };
            });
            validateSplitData(amount, splitType, splitDataState.filter(s=>s.selected));
        }
        
        const expense = { id, amount, desc, category, date: dateStr, isSplit, splitType, splitData, gpayRequestStatus, gpayRequestSentAt };
        
        if (existingExp) {
            const idx = state.expenses.findIndex(ex => ex.id === id);
            state.expenses[idx] = expense;
        } else {
            state.expenses.push(expense);
        }
        
        saveState();
        closeAllModals();
        showToast("Expense saved!");
    } catch (err) {
        alert(err.message);
    } finally {
        setTimeout(() => btn.disabled = false, 500);
    }
};

window.editExpense = function(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (!exp) return;
    
    document.getElementById('exp-id').value = exp.id;
    document.getElementById('exp-amount').value = exp.amount;
    document.getElementById('exp-desc').value = exp.desc;
    document.getElementById('exp-date').value = exp.date;
    
    const catSelect = document.getElementById('exp-category');
    catSelect.innerHTML = state.categories.map(c => `<option value="${c.id}" ${c.id === exp.category ? 'selected' : ''}>${c.name}</option>`).join('');
    
    const splitCheck = document.getElementById('exp-is-split');
    splitCheck.checked = !!exp.isSplit;
    document.getElementById('split-section').style.display = exp.isSplit ? 'block' : 'none';
    
    if (exp.isSplit) {
        currentSplitType = exp.splitType || 'equal';
        document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.seg-btn[data-type="${currentSplitType}"]`).classList.add('active');
        
        splitDataState = [{personId: 'you', name: 'You', selected: false, share: 0}];
        state.people.forEach(p => splitDataState.push({personId: p.id, name: p.name, selected: false, share: 0}));
        
        exp.splitData.forEach(saved => {
            const target = splitDataState.find(s => s.personId === saved.personId);
            if (target) {
                target.selected = true;
                target.share = exp.splitType === 'percent' && saved.rawValue ? saved.rawValue : saved.share;
            }
        });
        renderSplitMembers();
    }
    
    document.getElementById('btn-delete-expense').style.display = 'block';
    openModal('modal-expense');
};

window.deleteExpenseFromModal = function() {
    const id = document.getElementById('exp-id').value;
    state.expenses = state.expenses.filter(e => e.id !== id);
    saveState();
    closeAllModals();
    showToast("Expense deleted");
};

// --- PEOPLE & CATEGORIES ---
window.savePerson = function(e) {
    e.preventDefault();
    const name = document.getElementById('person-name').value.trim();
    if (!name) return;
    state.people.push({ id: 'p_' + Date.now(), name });
    document.getElementById('person-name').value = '';
    saveState();
    closeAllModals();
};

window.deletePerson = function(id) {
    const inUse = state.expenses.some(e => e.isSplit && e.splitData && e.splitData.some(s => s.personId === id));
    if (inUse) {
        alert("Cannot delete this person. They are part of existing expenses.");
        return;
    }
    state.people = state.people.filter(p => p.id !== id);
    saveState();
};

window.addCategory = function(e) {
    e.preventDefault();
    const name = document.getElementById('new-cat-name').value.trim();
    const color = document.getElementById('new-cat-color').value;
    if (!name) return;
    state.categories.push({ id: 'c_' + Date.now(), name, color });
    document.getElementById('new-cat-name').value = '';
    saveState();
};

window.deleteCategory = function(id) {
    const inUse = state.expenses.some(e => e.category === id);
    if (inUse) {
        alert("Cannot delete this category. It is used by existing expenses.");
        return;
    }
    state.categories = state.categories.filter(c => c.id !== id);
    saveState();
};

window.saveBudget = function(e) { e.preventDefault(); state.budget = roundToTwo(document.getElementById('budget-amount').value); saveState(); closeAllModals(); };
window.removeBudget = function() { state.budget = 0; saveState(); closeAllModals(); };
window.clearAllData = function() { if(confirm("Delete ALL data?")) { localStorage.removeItem(STORAGE_KEY); window.location.reload(); } };

// --- IMPORT / EXPORT ---
window.exportData = function() {
    const data = JSON.stringify(state);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PocketSplit_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
};

window.importData = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!parsed.expenses || !parsed.categories) throw new Error("Invalid schema");
            state = parsed;
            saveState();
            alert("Import successful!");
            window.location.reload();
        } catch (err) {
            alert("Import failed.");
        }
    };
    reader.readAsText(file);
};

// --- AGGREGATION ENGINE ---
function getSettlementData() {
    let toReceiveTotal = 0;
    let collectedTotal = 0;
    let personalSpend = 0;
    let totalPaid = 0;
    
    let peopleBalances = {}; 
    state.people.forEach(p => {
        peopleBalances[p.id] = { name: p.name, owes: 0, paid: 0 };
    });

    state.expenses.forEach(exp => {
        if (!exp.isSplit) {
            personalSpend += exp.amount;
            totalPaid += exp.amount;
        } else {
            totalPaid += exp.amount; 
            
            const myShareObj = exp.splitData.find(s => s.personId === 'you');
            if (myShareObj) {
                personalSpend += myShareObj.share;
            }

            exp.splitData.forEach(s => {
                if (s.personId !== 'you' && peopleBalances[s.personId]) {
                    if (s.isSettled) {
                        peopleBalances[s.personId].paid += s.share;
                        collectedTotal += s.share;
                    } else {
                        peopleBalances[s.personId].owes += s.share;
                        toReceiveTotal += s.share;
                    }
                }
            });
        }
    });

    return { 
        personalSpend, 
        totalPaid, 
        toReceiveTotal,
        collectedTotal, 
        peopleBalances 
    };
}

// --- SETTLEMENTS UI LOGIC ---
window.setSettlementView = function(view) {
    settlementView = view;
    document.querySelectorAll('#view-settlements .seg-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-view-${view}`).classList.add('active');
    
    const filters = document.getElementById('settlement-filters');
    const topSummary = document.getElementById('settlements-top-summary');
    
    if (view === 'person') {
        filters.style.display = 'none';
        topSummary.style.display = 'none';
    } else {
        filters.style.display = 'flex';
        topSummary.style.display = 'grid';
    }
    
    renderSettlementsTab();
};

window.setSettlementFilter = function(filter) {
    settlementFilter = filter;
    document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.remove('active'));
    document.querySelector(`.filter-chip[data-filter="${filter}"]`).classList.add('active');
    renderSettlementsTab();
};

window.toggleExpenseExpand = function(expId) {
    expandedExpenses[expId] = !expandedExpenses[expId];
    renderSettlementsTab();
};

// FIX: Allow toggling Request Sent status back and forth
window.toggleGpayRequest = function(expId) {
    const exp = state.expenses.find(e => e.id === expId);
    if (exp) {
        if (exp.gpayRequestStatus === 'sent') {
            exp.gpayRequestStatus = 'not_sent';
            exp.gpayRequestSentAt = null;
            showToast("Request marked as Not Sent");
        } else {
            exp.gpayRequestStatus = 'sent';
            exp.gpayRequestSentAt = new Date().toISOString();
            showToast("Request marked as Sent");
        }
        saveState();
    }
};

window.toggleParticipantPaid = function(expId, personId) {
    const exp = state.expenses.find(e => e.id === expId);
    if (exp && exp.splitData) {
        const share = exp.splitData.find(s => s.personId === personId);
        if (share) {
            share.isSettled = !share.isSettled;
            saveState();
        }
    }
};

// --- RENDERERS ---
function renderAll() {
    renderHome();
    renderExpensesListFull();
    renderCategoriesModal();
    if (document.getElementById('view-settlements').classList.contains('active')) {
        renderSettlementsTab();
    }
    if (document.getElementById('view-analytics').classList.contains('active')) {
        renderAnalytics();
    }
}

function renderHome() {
    const data = getSettlementData();
    const currentMonth = new Date().toISOString().slice(0,7); 
    let monthPersonalSpend = 0;
    
    state.expenses.forEach(exp => {
        if (exp.date.startsWith(currentMonth)) {
            if (!exp.isSplit) {
                monthPersonalSpend += exp.amount;
            } else {
                const myShareObj = exp.splitData.find(s => s.personId === 'you');
                if (myShareObj) monthPersonalSpend += myShareObj.share;
            }
        }
    });
    
    document.getElementById('home-my-spend').innerText = formatINR(monthPersonalSpend);
    document.getElementById('home-total-paid').innerText = formatINR(data.totalPaid);
    document.getElementById('home-to-receive').innerText = formatINR(data.toReceiveTotal); 
    
    if (state.budget > 0) {
        const left = state.budget - monthPersonalSpend;
        document.getElementById('home-budget-left').innerText = formatINR(left);
        document.getElementById('home-budget-left').className = left < 0 ? 'mt-xs text-danger' : 'mt-xs text-primary';
    } else {
        document.getElementById('home-budget-left').innerText = 'Not Set';
    }
    
    renderRecentExpenses();
}

function renderRecentExpenses() {
    const recent = document.getElementById('recent-expenses-list');
    if (state.expenses.length === 0) {
        recent.innerHTML = `<div class="empty-state text-sm p-md">No expenses yet.</div>`;
        return;
    }
    // FIX: Reverse chron sort
    const sorted = [...state.expenses].sort((a,b) => new Date(b.date) - new Date(a.date));
    recent.innerHTML = sorted.slice(0, 3).map(e => `
        <div class="list-item p-sm clickable border-bottom" onclick="editExpense('${e.id}')">
            <div class="expense-list-item-left">
                <h3 class="m-0">${e.desc}</h3>
                <span class="text-xs text-secondary">${e.date} ${e.isSplit ? '• Split' : ''}</span>
            </div>
            <strong class="text-primary">${formatINR(e.amount)}</strong>
        </div>
    `).join('');
}

window.renderExpensesListFull = function() {
    const list = document.getElementById('expenses-list');
    if (!list) return;
    
    const searchInput = document.getElementById('expense-search');
    const monthInput = document.getElementById('expense-month');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const monthTerm = monthInput ? monthInput.value : '';
    
    let filtered = state.expenses;
    
    if (searchTerm) {
        filtered = filtered.filter(e => 
            e.desc.toLowerCase().includes(searchTerm) || 
            e.amount.toString().includes(searchTerm)
        );
    }
    if (monthTerm) {
        filtered = filtered.filter(e => e.date.startsWith(monthTerm));
    }
    
    if (filtered.length === 0) {
        list.innerHTML = `<div class="empty-state">No expenses found.</div>`;
        return;
    }
    
    // FIX: Reverse chron sort
    const sorted = [...filtered].sort((a,b) => new Date(b.date) - new Date(a.date));
    list.innerHTML = sorted.map(e => `
        <div class="card p-md flex-between align-center clickable" onclick="editExpense('${e.id}')">
            <div class="expense-list-item-left">
                <h3 class="m-0">${e.desc}</h3>
                <span class="text-xs text-secondary">${e.date}</span>
                ${e.isSplit ? '<span class="text-xs text-primary ml-sm">Split</span>' : ''}
            </div>
            <strong class="text-primary">${formatINR(e.amount)}</strong>
        </div>
    `).join('');
}

function renderCategoriesModal() {
    const list = document.getElementById('category-manage-list');
    if (!list) return;
    list.innerHTML = state.categories.map(c => `
        <div class="list-item p-sm border-bottom flex-between">
            <div class="flex-row align-center gap-sm">
                <div style="width:16px;height:16px;border-radius:4px;background:${c.color}"></div>
                <span>${c.name}</span>
            </div>
            <button class="btn-ghost text-danger text-xs" onclick="deleteCategory('${c.id}')">Delete</button>
        </div>
    `).join('');
}

function renderSettlementsTab() {
    const container = document.getElementById('settlements-list-container');
    if (!container) return;
    
    if (settlementView === 'person') {
        renderSettlementByPerson(container);
    } else {
        renderSettlementByExpense(container);
    }
}

function renderSettlementByExpense(container) {
    const data = getSettlementData();
    
    document.getElementById('settlements-total').innerText = formatINR(data.toReceiveTotal + data.collectedTotal);
    document.getElementById('settlements-collected').innerText = formatINR(data.collectedTotal);
    document.getElementById('settlements-pending').innerText = formatINR(data.toReceiveTotal);
    
    let splitExps = state.expenses.filter(e => e.isSplit && e.splitData);
    let displayList = [];
    
    splitExps.forEach(exp => {
        let expCollected = 0;
        let expPending = 0;
        let myShare = 0;
        let participantsCount = 0;
        let participantsData = [];
        
        exp.splitData.forEach(s => {
            if (s.personId === 'you') {
                myShare = s.share;
            } else {
                participantsCount++;
                const pInfo = state.people.find(p => p.id === s.personId);
                const pName = pInfo ? pInfo.name : 'Unknown';
                participantsData.push({ id: s.personId, name: pName, share: s.share, isSettled: s.isSettled });
                
                if (s.isSettled) expCollected += s.share;
                else expPending += s.share;
            }
        });
        
        const totalToReceive = expCollected + expPending;
        if (totalToReceive === 0) return; 
        
        const gpaySent = exp.gpayRequestStatus === 'sent';
        const isFullySettled = expPending === 0;
        
        let keep = false;
        if (settlementFilter === 'all') keep = true;
        else if (settlementFilter === 'need_request') keep = !isFullySettled && !gpaySent;
        else if (settlementFilter === 'request_sent') keep = !isFullySettled && gpaySent && expCollected === 0;
        else if (settlementFilter === 'partially_paid') keep = !isFullySettled && expCollected > 0 && expPending > 0;
        else if (settlementFilter === 'settled') keep = isFullySettled;
        
        if (keep) {
            displayList.push({
                exp, myShare, totalToReceive, expCollected, expPending, participantsCount, participantsData, gpaySent, isFullySettled
            });
        }
    });
    
    // FIX: Sort Date Descending (most recent first)
    displayList.sort((a,b) => new Date(b.exp.date) - new Date(a.exp.date));
    
    if (displayList.length === 0) {
        container.innerHTML = `<div class="empty-state">No splits match this filter.</div>`;
        return;
    }
    
    container.innerHTML = displayList.map(item => {
        const { exp, myShare, totalToReceive, expCollected, expPending, participantsCount, participantsData, gpaySent, isFullySettled } = item;
        const isExpanded = !!expandedExpenses[exp.id];
        
        // FIX: Removed Paid/Pending, just shows Name and Amount
        const participantsHtml = participantsData.map(p => `
            <div class="flex-between align-center py-sm border-bottom" style="padding-top: 8px; padding-bottom: 8px;">
                <div class="font-medium text-sm">${p.name}</div>
                <div class="text-primary font-bold">${formatINR(p.share)}</div>
            </div>
        `).join('');
        
        return `
        <div class="card p-0 mb-md overflow-hidden">
            <div class="p-md">
                <div class="flex-between align-center mb-sm">
                    <div class="expense-list-item-left">
                        <h3 class="m-0">${exp.desc}</h3>
                        <span class="text-xs text-secondary">${exp.date}</span>
                    </div>
                    <strong class="text-primary">${formatINR(exp.amount)}</strong>
                </div>
                
                <div class="flex-between align-center text-sm mb-xs">
                    <span class="text-secondary">Paid by You</span>
                    <span>Your share: <strong class="text-primary">${formatINR(myShare)}</strong></span>
                </div>
                <div class="flex-between align-center text-sm mb-md pb-md border-bottom">
                    <span class="text-secondary">To receive</span>
                    <strong class="text-success">${formatINR(totalToReceive)}</strong>
                </div>

                <div class="flex-between align-center mb-sm">
                    <div>
                        <div class="text-xs font-bold text-secondary mb-xs">GPay Group Request</div>
                        ${gpaySent 
                            ? `<span class="text-sm font-medium text-success">✓ Request Sent</span>` 
                            : `<span class="text-sm font-medium text-warning">● Not Sent</span>`
                        }
                    </div>
                    <!-- FIX: Button now toggles state back and forth directly -->
                    <button class="btn-action-small" onclick="toggleGpayRequest('${exp.id}')">
                        ${gpaySent ? 'Mark Not Sent' : 'Mark Request Sent'}
                    </button>
                </div>
                
                <div class="flex-between align-center mt-md">
                    <span class="text-xs text-secondary">${participantsCount} people • ${formatINR(expPending)} pending</span>
                    <button class="btn-ghost text-primary text-sm p-0 font-medium" onclick="toggleExpenseExpand('${exp.id}')">${isExpanded ? 'Hide Split' : 'View Split'}</button>
                </div>
            </div>

            ${isExpanded ? `
                <div class="border-top p-md bg-secondary">
                    <div class="text-xs font-bold text-secondary mb-xs">SPLIT BREAKDOWN</div>
                    ${participantsHtml}
                </div>
            ` : ''}
        </div>
        `;
    }).join('');
}

function renderSettlementByPerson(container) {
    const data = getSettlementData();
    
    if (state.people.length === 0) {
        container.innerHTML = `<div class="empty-state">No people added yet.</div>`;
        return;
    }
    
    container.innerHTML = Object.keys(data.peopleBalances).map(personId => {
        const p = data.peopleBalances[personId];
        const totalOwed = p.owes + p.paid;
        
        return `
        <div class="card mb-sm">
            <div class="flex-between align-center mb-sm">
                <span class="font-medium">${p.name}</span>
                <button class="btn-ghost text-danger text-xs p-0" onclick="deletePerson('${personId}')">Remove</button>
            </div>
            <div class="flex-between text-sm border-top pt-sm mt-sm">
                <span class="text-secondary">Total Owed</span>
                <strong>${formatINR(totalOwed)}</strong>
            </div>
            <div class="flex-between text-sm mt-xs">
                <span class="text-secondary">Paid</span>
                <strong class="text-success">${formatINR(p.paid)}</strong>
            </div>
            <div class="flex-between text-sm mt-xs">
                <span class="text-secondary">Pending</span>
                <strong class="text-danger">${formatINR(p.owes)}</strong>
            </div>
        </div>
        `;
    }).join('');
}

function renderAnalytics() {
    const currentMonth = new Date().toISOString().slice(0,7); 
    let monthSpend = 0;
    let categoryTotals = {};
    
    state.categories.forEach(c => categoryTotals[c.id] = { name: c.name, color: c.color, amount: 0 });

    state.expenses.forEach(exp => {
        if (exp.date.startsWith(currentMonth)) {
            let myCost = exp.amount;
            if (exp.isSplit && exp.splitData) {
                const myShareObj = exp.splitData.find(s => s.personId === 'you');
                myCost = myShareObj ? myShareObj.share : 0;
            }
            monthSpend += myCost;
            if (categoryTotals[exp.category]) {
                categoryTotals[exp.category].amount += myCost;
            }
        }
    });

    const totalEl = document.getElementById('analytics-total');
    if (totalEl) totalEl.innerText = formatINR(monthSpend);

    const pieChart = document.getElementById('pie-chart');
    const pieLegend = document.getElementById('pie-legend');
    if (!pieChart || !pieLegend) return;

    if (monthSpend === 0) {
        pieChart.style.background = 'var(--border)';
        pieLegend.innerHTML = '<p class="text-center text-secondary text-sm mt-md">No spending this month.</p>';
        return;
    }

    let gradientStr = [];
    let currentAngle = 0;
    let legendHtml = '';

    const catArr = Object.values(categoryTotals).filter(c => c.amount > 0).sort((a,b) => b.amount - a.amount);

    catArr.forEach(c => {
        const percentage = (c.amount / monthSpend) * 100;
        const angle = (percentage / 100) * 360;
        gradientStr.push(`${c.color} ${currentAngle}deg ${currentAngle + angle}deg`);
        currentAngle += angle;

        legendHtml += `
            <div class="flex-between align-center border-bottom py-sm">
                <div class="flex-row align-center gap-sm">
                    <span class="legend-dot" style="background-color: ${c.color}"></span>
                    <span class="text-sm font-medium">${c.name}</span>
                </div>
                <div class="flex-col" style="align-items: flex-end;">
                    <span class="font-bold text-sm">${formatINR(c.amount)}</span>
                    <span class="text-xs text-secondary">${percentage.toFixed(1)}%</span>
                </div>
            </div>
        `;
    });

    pieChart.style.background = `conic-gradient(${gradientStr.join(', ')})`;
    pieLegend.innerHTML = legendHtml;
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}
