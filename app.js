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

let pendingSavePayload = null; // Used for the split edit warning modal

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

// --- CORE FINANCIAL MATH (PAISE BASE) ---
function toPaise(rupees) {
    return Math.round((parseFloat(rupees) + Number.EPSILON) * 100) || 0;
}

function toRupees(paise) {
    return paise / 100;
}

function formatINR(rupees) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(rupees);
}

// --- NEW TIME FORMATTING UTILITIES ---
function formatTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function getRelativeDateLabel(dateString) {
    const today = new Date();
    const targetDate = new Date(dateString); 
    
    const todayNum = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const targetNum = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    
    const diffDays = (todayNum - targetNum) / (1000 * 60 * 60 * 24);
    const formattedDate = targetDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    
    if (diffDays === 0) return `TODAY · ${formattedDate}`;
    if (diffDays === 1) return `YESTERDAY · ${formattedDate}`;
    return formattedDate;
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
                amount: parseFloat(e.amount) || 0, 
                gpayRequestStatus: e.gpayRequestStatus || 'not_sent',
                gpayRequestSentAt: e.gpayRequestSentAt || null,
                notes: e.notes || '', // Migration for missing notes
                splitData: e.splitData ? e.splitData.map(s => ({...s, share: parseFloat(s.share) || 0})) : null,
                createdAt: e.createdAt || new Date().toISOString(),
                updatedAt: e.updatedAt || e.createdAt || new Date().toISOString()
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
    document.getElementById('exp-notes').value = '';
    
    const localDate = new Date();
    const localString = new Date(localDate.getTime() - (localDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    document.getElementById('exp-date').value = localString;
    
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

// --- SPLIT ENGINE (FIXED ROUNDING BUG) ---
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
                       min="0" step="0.01">
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
    
    const totalPaise = toPaise(document.getElementById('exp-amount').value || 0);
    const selected = splitDataState.filter(s => s.selected);
    let calculatedPaiseTotal = 0;
    
    const valText = document.getElementById('split-validation-text');
    const valTotal = document.getElementById('split-total-amount');

    if (currentSplitType === 'equal') {
        if (selected.length > 0) {
            const baseSplitPaise = Math.floor(totalPaise / selected.length);
            let remainderPaise = totalPaise % selected.length;
            
            let currentSelectionIdx = 0;
            
            splitDataState.forEach((s) => { 
                if (s.selected) {
                    let sharePaise = baseSplitPaise;
                    if (remainderPaise > 0) {
                        sharePaise += 1;
                        remainderPaise -= 1;
                    }
                    s.share = toRupees(sharePaise);
                    currentSelectionIdx++;
                } else {
                    s.share = 0;
                }
            });
            
            document.querySelectorAll('.split-row input[type="number"]').forEach((input, idx) => {
                if (splitDataState[idx].selected) input.value = splitDataState[idx].share.toFixed(2);
            });
            
            calculatedPaiseTotal = totalPaise; 
        }
        valText.innerText = "Calculated Total:";
        valTotal.innerText = formatINR(toRupees(calculatedPaiseTotal));
        valTotal.className = calculatedPaiseTotal === totalPaise ? 'text-success' : 'text-danger';
        
    } else if (currentSplitType === 'percent') {
        calculatedPaiseTotal = toPaise(selected.reduce((sum, s) => sum + s.share, 0));
        valText.innerText = "Total Percentage:";
        valTotal.innerText = `${toRupees(calculatedPaiseTotal)}%`;
        valTotal.className = calculatedPaiseTotal === 10000 ? 'text-success' : 'text-danger';
        
    } else if (currentSplitType === 'custom') {
        calculatedPaiseTotal = selected.reduce((sum, s) => sum + toPaise(s.share), 0);
        valText.innerText = "Calculated Total:";
        valTotal.innerText = formatINR(toRupees(calculatedPaiseTotal));
        valTotal.className = calculatedPaiseTotal === totalPaise ? 'text-success' : 'text-danger';
    }
};

function validateSplitData(amount, type, data) {
    if (data.length === 0) throw new Error("Please select at least one person for the split.");
    
    const targetPaise = toPaise(amount);
    
    if (type === 'percent') {
        const totalPctPaise = data.reduce((sum, d) => sum + toPaise(d.rawValue), 0);
        if (totalPctPaise !== 10000) throw new Error(`Percentages must exactly equal 100% (Currently ${toRupees(totalPctPaise)}%).`);
        
        const totalSharePaise = data.reduce((sum, d) => sum + toPaise(d.share), 0);
        if (totalSharePaise !== targetPaise) {
            throw new Error(`Critical Match Error: Calculated split amount does not equal total expense.`);
        }
    } else if (type === 'custom') {
        const totalSharePaise = data.reduce((sum, d) => sum + toPaise(d.share), 0);
        if (totalSharePaise !== targetPaise) throw new Error(`Custom shares must equal the exact total expense amount.`);
    }
}

// --- EXPENSE LOGIC ---
window.saveExpense = function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; 
    
    try {
        const id = document.getElementById('exp-id').value || 'exp_' + Date.now();
        const amount = toRupees(toPaise(document.getElementById('exp-amount').value));
        const desc = document.getElementById('exp-desc').value.trim();
        const notes = document.getElementById('exp-notes').value.trim();
        const category = document.getElementById('exp-category').value;
        const dateStr = document.getElementById('exp-date').value; 
        const isSplit = document.getElementById('exp-is-split').checked;
        const currentIsoTime = new Date().toISOString();
        
        if (isNaN(amount) || amount <= 0) throw new Error("Amount must be a valid number greater than 0");
        
        const existingExp = state.expenses.find(ex => ex.id === id);
        let gpayRequestStatus = existingExp ? existingExp.gpayRequestStatus : 'not_sent';
        let gpayRequestSentAt = existingExp ? existingExp.gpayRequestSentAt : null;
        let createdAt = existingExp ? existingExp.createdAt : currentIsoTime;
        let updatedAt = currentIsoTime;

        let splitType = 'none';
        let splitData = null;

        if (isSplit) {
            splitType = currentSplitType;
            const targetPaise = toPaise(amount);
            
            let processingArray = splitDataState.filter(s => s.selected).map(s => {
                let existingSettledState = false;
                if (existingExp && existingExp.splitData) {
                    const existingShare = existingExp.splitData.find(oldS => oldS.personId === s.personId);
                    if (existingShare) existingSettledState = existingShare.isSettled;
                }
                return { personId: s.personId, share: s.share, rawValue: s.share, isSettled: existingSettledState };
            });
            
            if (splitType === 'percent') {
                let totalAllocatedPaise = 0;
                processingArray.forEach(s => {
                    const rawPct = s.rawValue; 
                    const calculatedPaise = Math.floor(targetPaise * (rawPct / 100));
                    s.share = calculatedPaise;
                    totalAllocatedPaise += calculatedPaise;
                });
                
                let remainderPaise = targetPaise - totalAllocatedPaise;
                let pIdx = 0;
                while(remainderPaise > 0) {
                    processingArray[pIdx].share += 1;
                    remainderPaise -= 1;
                    pIdx = (pIdx + 1) % processingArray.length;
                }
                
                processingArray.forEach(s => { s.share = toRupees(s.share); });
            }
            
            splitData = processingArray;
            validateSplitData(amount, splitType, splitData);
            
            // --- EDIT PROTECTION LOGIC ---
            if (existingExp && existingExp.isSplit && existingExp.splitData) {
                let hasPayments = existingExp.splitData.some(s => s.isSettled && s.personId !== 'you');
                if (hasPayments) {
                    // Check if any new share is less than what was already paid (which is illogical)
                    let invalidPayment = false;
                    splitData.forEach(newS => {
                        const oldS = existingExp.splitData.find(os => os.personId === newS.personId);
                        if (oldS && oldS.isSettled) {
                            if (newS.share < oldS.share) { // Strictly speaking, if they paid X, the new share can't be less than X
                                invalidPayment = true;
                            }
                        }
                    });

                    pendingSavePayload = { 
                        id, amount, desc, notes, category, date: dateStr, isSplit, splitType, splitData, 
                        gpayRequestStatus, gpayRequestSentAt, createdAt, updatedAt 
                    };

                    if (invalidPayment) {
                        throw new Error("You cannot lower a person's share below what they have already paid. Please unmark their payment first.");
                    } else {
                        // Warn user about editing a settled expense
                        openModal('modal-split-warning');
                        return; // Halt execution until confirmed
                    }
                }
            }
        }
        
        executeExpenseSave({ 
            id, amount, desc, notes, category, date: dateStr, isSplit, splitType, splitData, 
            gpayRequestStatus, gpayRequestSentAt, createdAt, updatedAt 
        });

    } catch (err) {
        alert(err.message);
    } finally {
        setTimeout(() => btn.disabled = false, 500);
    }
};

window.forceSaveExpense = function() {
    if (pendingSavePayload) {
        executeExpenseSave(pendingSavePayload);
        pendingSavePayload = null;
    }
};

function executeExpenseSave(expense) {
    const existingIdx = state.expenses.findIndex(ex => ex.id === expense.id);
    if (existingIdx >= 0) {
        state.expenses[existingIdx] = expense;
    } else {
        state.expenses.push(expense);
    }
    saveState();
    closeAllModals();
    showToast("Expense saved!");
}

window.editExpense = function(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (!exp) return;
    
    document.getElementById('exp-id').value = exp.id;
    document.getElementById('exp-amount').value = exp.amount;
    document.getElementById('exp-desc').value = exp.desc;
    document.getElementById('exp-notes').value = exp.notes || '';
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

// --- QUICK ADD ---
window.triggerQuickAdd = function() {
    const amount = prompt("Quick Add Expense\nEnter amount (₹):");
    if (!amount) return;
    const parsedAmount = roundToTwo(parseFloat(amount));
    if (isNaN(parsedAmount) || parsedAmount <= 0) return alert("Invalid amount.");
    
    const desc = prompt("Enter description:");
    if (!desc) return;
    
    if (state.categories.length === 0) {
        return alert("Please add at least one category in Settings first.");
    }
    
    const currentIsoTime = new Date().toISOString();
    
    // Create Date safely using local timezone offset
    const localDate = new Date();
    const localString = new Date(localDate.getTime() - (localDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    const expense = { 
        id: 'exp_' + Date.now(), 
        amount: parsedAmount, 
        desc: desc.trim(), 
        notes: '',
        category: state.categories[0].id, // Default to first category
        date: localString, 
        isSplit: false, 
        splitType: 'none', 
        splitData: null, 
        gpayRequestStatus: 'not_sent', 
        gpayRequestSentAt: null, 
        createdAt: currentIsoTime, 
        updatedAt: currentIsoTime 
    };
    
    state.expenses.push(expense);
    saveState();
    showToast(`Saved: ₹${parsedAmount.toFixed(2)} for ${desc}`);
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

window.saveBudget = function(e) { 
    e.preventDefault(); 
    state.budget = toRupees(toPaise(document.getElementById('budget-amount').value)); 
    saveState(); 
    closeAllModals(); 
};
window.removeBudget = function() { state.budget = 0; saveState(); closeAllModals(); };
window.clearAllData = function() { if(confirm("Delete ALL data?")) { localStorage.removeItem(STORAGE_KEY); window.location.reload(); } };


// --- IMPORT / EXPORT / CSV ---
window.exportCSV = function() {
    if (state.expenses.length === 0) {
        alert("No expenses to export.");
        return;
    }

    let csvContent = "Date,Time,Description,Category,Amount,Split Type,Participants,Notes,Created At,Updated At\n";
    const sorted = [...state.expenses].sort((a,b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(e => {
        const dateStr = e.date;
        const timeStr = formatTime(e.updatedAt || e.createdAt);
        
        // Escape quotes and commas
        const cleanDesc = `"${e.desc.replace(/"/g, '""')}"`;
        const cleanNotes = `"${(e.notes || '').replace(/"/g, '""')}"`;
        
        const catObj = state.categories.find(c => c.id === e.category);
        const catName = catObj ? catObj.name : 'Unknown';
        
        const amountStr = e.amount.toFixed(2);
        
        let splitTypeStr = e.isSplit ? e.splitType : 'None';
        let participantsStr = '';
        
        if (e.isSplit && e.splitData) {
            const pList = e.splitData.map(s => {
                if (s.personId === 'you') return `You (₹${s.share.toFixed(2)})`;
                const p = state.people.find(person => person.id === s.personId);
                return `${p ? p.name : 'Unknown'} (₹${s.share.toFixed(2)})`;
            });
            participantsStr = `"${pList.join(', ')}"`;
        }

        const cAt = new Date(e.createdAt).toLocaleString('en-US');
        const uAt = new Date(e.updatedAt).toLocaleString('en-US');

        csvContent += `${dateStr},${timeStr},${cleanDesc},${catName},${amountStr},${splitTypeStr},${participantsStr},${cleanNotes},"${cAt}","${uAt}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PocketSplit_Expenses_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
};

window.exportData = function() {
    const data = JSON.stringify(state);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PocketSplit_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
};

// --- IMPORT VALIDATION UTILITIES ---
function validateImportedState(parsed) {
    if (!parsed || typeof parsed !== 'object') throw new Error("File is not a valid JSON object.");
    
    // Validate Expenses
    if (parsed.expenses && !Array.isArray(parsed.expenses)) throw new Error("'expenses' must be an array.");
    if (parsed.expenses) {
        parsed.expenses.forEach((e, idx) => {
            if (!e.id) throw new Error(`Expense at index ${idx} is missing an ID.`);
            if (typeof e.amount !== 'number' || isNaN(e.amount) || !isFinite(e.amount) || e.amount < 0) throw new Error(`Expense '${e.desc || e.id}' has an invalid amount.`);
            if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error(`Expense '${e.desc || e.id}' has an invalid date format.`);
            
            if (e.isSplit && e.splitData) {
                if (!Array.isArray(e.splitData)) throw new Error(`Expense '${e.desc || e.id}' has malformed split data.`);
                const shareTotal = e.splitData.reduce((sum, s) => sum + (Number(s.share) || 0), 0);
                if (Math.abs(shareTotal - e.amount) > 0.05) { 
                    throw new Error(`Expense '${e.desc}' split shares (₹${shareTotal}) do not match the total amount (₹${e.amount}).`);
                }
            }
        });
    }

    // Validate Categories
    if (parsed.categories && !Array.isArray(parsed.categories)) throw new Error("'categories' must be an array.");
    if (parsed.categories) {
        parsed.categories.forEach((c, idx) => {
            if (!c.id || !c.name) throw new Error(`Category at index ${idx} is missing required fields.`);
        });
    }

    // Validate People
    if (parsed.people && !Array.isArray(parsed.people)) throw new Error("'people' must be an array.");
    if (parsed.people) {
        parsed.people.forEach((p, idx) => {
            if (!p.id || !p.name) throw new Error(`Person at index ${idx} is missing required fields.`);
        });
    }
}

window.importData = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            validateImportedState(parsed);
            
            state = {
                expenses: parsed.expenses || [],
                people: parsed.people || [],
                categories: parsed.categories || [],
                budget: parsed.budget || 0
            };
            saveState();
            alert("Backup imported successfully!");
            window.location.reload();
        } catch (err) {
            alert(`Import failed:\n${err.message}\n\nYour existing data has NOT been changed.`);
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

window.triggerGpayConfirm = function(expId) {
    document.getElementById('gpay-confirm-exp-id').value = expId;
    openModal('modal-gpay-confirm');
};

window.confirmGpayRequest = function() {
    const expId = document.getElementById('gpay-confirm-exp-id').value;
    const exp = state.expenses.find(e => e.id === expId);
    if (exp) {
        exp.gpayRequestStatus = 'sent';
        exp.gpayRequestSentAt = new Date().toISOString();
        saveState();
        closeAllModals();
        showToast("Marked as sent");
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
    const sorted = [...state.expenses].sort((a,b) => {
        const timeA = new Date(a.updatedAt || a.createdAt).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt).getTime();
        return timeB - timeA;
    });
    
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
            e.amount.toString().includes(searchTerm) ||
            (e.notes && e.notes.toLowerCase().includes(searchTerm))
        );
    }
    if (monthTerm) {
        filtered = filtered.filter(e => e.date.startsWith(monthTerm));
    }
    
    if (filtered.length === 0) {
        list.innerHTML = `<div class="empty-state">No expenses found.</div>`;
        return;
    }
    
    const grouped = {};
    filtered.forEach(exp => {
        if (!grouped[exp.date]) grouped[exp.date] = [];
        grouped[exp.date].push(exp);
    });
    
    const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
    
    let html = '';
    
    sortedDates.forEach(dateStr => {
        const items = grouped[dateStr].sort((a,b) => {
            const timeA = new Date(a.updatedAt || a.createdAt).getTime();
            const timeB = new Date(b.updatedAt || b.createdAt).getTime();
            return timeB - timeA;
        });
        
        const dateHeader = getRelativeDateLabel(dateStr);
        
        html += `
            <div class="mt-md mb-xs">
                <span class="text-xs font-bold text-secondary tracking-wide">${dateHeader.toUpperCase()}</span>
                <div class="border-bottom mt-xs mb-sm"></div>
            </div>
        `;
        
        html += items.map(e => {
            const timeStr = formatTime(e.updatedAt || e.createdAt);
            const notesHtml = e.notes ? `<div class="text-xs text-muted mt-xs" style="font-style: italic;">${e.notes}</div>` : '';
            
            return `
            <div class="card p-md flex-between align-center mb-sm clickable" onclick="editExpense('${e.id}')">
                <div class="expense-list-item-left">
                    <h3 class="m-0">${e.desc}</h3>
                    ${notesHtml}
                    <div class="text-xs text-secondary mt-xs">
                        ${timeStr}
                        ${e.isSplit ? '<span class="text-primary font-medium ml-sm">Split</span>' : ''}
                    </div>
                </div>
                <strong class="text-primary">${formatINR(e.amount)}</strong>
            </div>
        `}).join('');
    });
    
    list.innerHTML = html;
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
    
    displayList.sort((a,b) => new Date(b.exp.date) - new Date(a.exp.date));
    
    if (displayList.length === 0) {
        container.innerHTML = `<div class="empty-state">No splits match this filter.</div>`;
        return;
    }
    
    container.innerHTML = displayList.map(item => {
        const { exp, myShare, totalToReceive, expCollected, expPending, participantsCount, participantsData, gpaySent, isFullySettled } = item;
        const isExpanded = !!expandedExpenses[exp.id];
        
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
