/**
 * PocketSplit - Fully Repaired Core Logic
 * Incorporates all UI bindings + Strict Security & Financial fixes.
 */

// --- 1. STRICT IN-MEMORY AUTHENTICATION ---
window.POCKETSPLIT_AUTH = { isUnlocked: false };
const STORAGE_KEY = 'pocketsplit_data';
const PIN_KEY = 'pocketSplit_accessCode';

let state = {
    expenses: [],
    people: [],
    categories: [{ id: 'c1', name: 'General', color: '#5B5FEF' }],
    budget: 0
};

// Split Engine State
let currentSplitType = 'equal';
let splitDataState = []; // Holds {personId, name, selected, share}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    
    // Set a default PIN for testing if none exists
    if (!localStorage.getItem(PIN_KEY)) {
        localStorage.setItem(PIN_KEY, '1234'); 
    }

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
        }
    } catch (e) {
        console.error("Corrupted local storage. Starting fresh.");
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
    
    // Reset Split UI
    document.getElementById('exp-is-split').checked = false;
    document.getElementById('split-section').style.display = 'none';
    currentSplitType = 'equal';
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.seg-btn[data-type="equal"]').classList.add('active');
    
    document.getElementById('btn-delete-expense').style.display = 'none';
    openModal('modal-expense');
};

// --- SPLIT ENGINE (The Bug Fix) ---
window.toggleSplitUI = function() {
    const isChecked = document.getElementById('exp-is-split').checked;
    document.getElementById('split-section').style.display = isChecked ? 'block' : 'none';
    
    if (isChecked) {
        // Initialize list
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
    
    // Reset shares when switching types
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
    renderSplitMembers(); // Re-render to handle disabled states properly
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
            splitDataState.forEach(s => {
                s.share = s.selected ? splitAmount : 0;
            });
            // Update inputs without losing focus
            document.querySelectorAll('.split-row input[type="number"]').forEach((input, idx) => {
                if (splitDataState[idx].selected) input.value = splitAmount;
            });
            calculatedTotal = roundToTwo(splitAmount * selected.length);
        }
        valText.innerText = "Calculated Total:";
        valTotal.innerText = formatINR(calculatedTotal);
        // Allow a few pennies margin of error for division (e.g. 100/3)
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
        
        let splitType = 'none';
        let splitData = null;

        if (isSplit) {
            splitType = currentSplitType;
            splitData = splitDataState.filter(s => s.selected).map(s => ({
                personId: s.personId,
                share: s.share
            }));
            validateSplitData(amount, splitType, splitData);
        }
        
        const expense = { id, amount, desc, category, date: dateStr, isSplit, splitType, splitData };
        
        const existingIdx = state.expenses.findIndex(ex => ex.id === id);
        if (existingIdx >= 0) state.expenses[existingIdx] = expense;
        else state.expenses.push(expense);
        
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
    
    // Load Split Data
    const splitCheck = document.getElementById('exp-is-split');
    splitCheck.checked = !!exp.isSplit;
    document.getElementById('split-section').style.display = exp.isSplit ? 'block' : 'none';
    
    if (exp.isSplit) {
        currentSplitType = exp.splitType || 'equal';
        document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.seg-btn[data-type="${currentSplitType}"]`).classList.add('active');
        
        // Restore members
        splitDataState = [{personId: 'you', name: 'You', selected: false, share: 0}];
        state.people.forEach(p => splitDataState.push({personId: p.id, name: p.name, selected: false, share: 0}));
        
        exp.splitData.forEach(saved => {
            const target = splitDataState.find(s => s.personId === saved.personId);
            if (target) {
                target.selected = true;
                target.share = saved.share;
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

// --- PEOPLE & SETTLEMENTS ---
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
        alert("Cannot delete this person. They are part of existing expenses. Please delete the expenses first.");
        return;
    }
    state.people = state.people.filter(p => p.id !== id);
    saveState();
};

// --- CATEGORIES ---
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

// --- BUDGET ---
window.saveBudget = function(e) {
    e.preventDefault();
    state.budget = roundToTwo(document.getElementById('budget-amount').value);
    saveState();
    closeAllModals();
};
window.removeBudget = function() {
    state.budget = 0;
    saveState();
    closeAllModals();
};

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
            alert("Import failed: The file is invalid. Your data was not changed.");
        }
    };
    reader.readAsText(file);
};

window.clearAllData = function() {
    if(confirm("Are you sure you want to delete ALL data? This cannot be undone.")) {
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
    }
}

// --- RENDERERS ---
function renderAll() {
    renderHome();
    renderExpensesList();
    renderCategoriesModal();
    renderPeopleList();
}

function renderHome() {
    const totalSpend = state.expenses.reduce((sum, e) => sum + e.amount, 0);
    document.getElementById('home-my-spend').innerText = formatINR(totalSpend);
    
    if (state.budget > 0) {
        const left = state.budget - totalSpend;
        document.getElementById('home-budget-left').innerText = formatINR(left);
        document.getElementById('home-budget-left').className = left < 0 ? 'mt-xs text-danger' : 'mt-xs text-primary';
    } else {
        document.getElementById('home-budget-left').innerText = 'Not Set';
    }
    
    document.getElementById('analytics-total').innerText = formatINR(totalSpend);
}

function renderExpensesList() {
    const list = document.getElementById('expenses-list');
    const recent = document.getElementById('recent-expenses-list');
    
    if (state.expenses.length === 0) {
        list.innerHTML = `<div class="empty-state">No expenses yet.</div>`;
        recent.innerHTML = `<div class="empty-state text-sm p-md">No expenses yet.</div>`;
        return;
    }
    
    const sorted = [...state.expenses].sort((a,b) => new Date(b.date) - new Date(a.date));
    const html = sorted.map(e => `
        <div class="card p-md flex-between align-center clickable" onclick="editExpense('${e.id}')">
            <div>
                <h3 class="m-0">${e.desc}</h3>
                <span class="text-xs text-secondary">${e.date}</span>
                ${e.isSplit ? '<span class="text-xs text-primary ml-sm">Split</span>' : ''}
            </div>
            <strong class="text-primary">${formatINR(e.amount)}</strong>
        </div>
    `).join('');
    
    list.innerHTML = html;
    recent.innerHTML = sorted.slice(0, 3).map(e => `
        <div class="list-item p-sm clickable border-bottom" onclick="editExpense('${e.id}')">
            <span>${e.desc} ${e.isSplit ? '🔄' : ''}</span>
            <strong class="text-primary">${formatINR(e.amount)}</strong>
        </div>
    `).join('');
}

function renderCategoriesModal() {
    const list = document.getElementById('category-manage-list');
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

function renderPeopleList() {
    const list = document.getElementById('people-list');
    document.getElementById('settlements-count').innerText = `${state.people.length} people`;
    
    if (state.people.length === 0) {
        list.innerHTML = `<div class="empty-state">No people added yet.</div>`;
        return;
    }
    
    list.innerHTML = state.people.map(p => `
        <div class="card p-md flex-between align-center">
            <span class="font-medium">${p.name}</span>
            <button class="btn-action-small text-danger" onclick="deletePerson('${p.id}')">Remove</button>
        </div>
    `).join('');
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}
