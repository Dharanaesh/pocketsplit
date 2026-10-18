/**
 * PocketSplit Life - Complete Management Module
 */

window.POCKETSPLIT_AUTH = { isUnlocked: false };
const STORAGE_KEY = 'pocketsplit_data';
const PIN_KEY = 'pocketSplit_accessCode';

// Complete State Model
let state = {
    expenses: [],
    people: [],
    categories: [],
    budget: 0,
    projects: [], // [{ id, name, targetBudget, startDate, status, transactions: [] }]
    fitnessTargets: { steps: 10000, water: 3, protein: 120 },
    fitnessLogs: {}, // { '2026-10-18': { steps: true, water: false, protein: true } }
    tasks: [], // [{ id, title, dueDate, completed }]
    notes: [] // [{ id, title, content, updatedAt }]
};

let currentSplitType = 'equal';
let splitDataState = []; 
let currentProjectViewId = null;
let settlementView = 'expense'; 
let settlementFilter = 'all'; 
let expandedExpenses = {}; 
let pendingSavePayload = null; 

document.addEventListener('DOMContentLoaded', () => {
    loadState();
    
    // Automatically set expense month input to current month if it exists and is empty
    const mInput = document.getElementById('expense-month');
    if (mInput && !mInput.value) {
        mInput.value = getLocalISODate().slice(0, 7);
    }
    
    if (!localStorage.getItem(PIN_KEY)) localStorage.setItem(PIN_KEY, '1234'); 
    const savedCode = localStorage.getItem(PIN_KEY);
    if (savedCode && !window.POCKETSPLIT_AUTH.isUnlocked) {
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('app-shell').style.display = 'none';
    } else {
        unlockAppSuccess();
    }
});

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

function roundToTwo(num) { return Math.round((Number(num) + Number.EPSILON) * 100) / 100; }
function toPaise(rupees) { return Math.round((parseFloat(rupees) + Number.EPSILON) * 100) || 0; }
function toRupees(paise) { return paise / 100; }
function formatINR(rupees) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(rupees); }
function formatTime(isoString) { return new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }

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
                ...e, amount: parseFloat(e.amount) || 0, gpayRequestStatus: e.gpayRequestStatus || 'not_sent',
                gpayRequestSentAt: e.gpayRequestSentAt || null, paidBy: e.paidBy || 'you', notes: e.notes || '', tags: e.tags || '', 
                splitData: e.splitData ? e.splitData.map(s => ({...s, share: parseFloat(s.share) || 0})) : null,
                createdAt: e.createdAt || new Date().toISOString(), updatedAt: e.updatedAt || e.createdAt || new Date().toISOString()
            }));
            state.projects = state.projects || [];
            
            // Migrate old fitness array to new habit dict if needed
            if (Array.isArray(state.fitness)) {
                state.fitnessLogs = {};
                state.fitnessTargets = { steps: 10000, water: 3, protein: 120 };
                state.fitness = undefined; // Drop old format
            } else {
                state.fitnessLogs = state.fitnessLogs || {};
                state.fitnessTargets = state.fitnessTargets || { steps: 10000, water: 3, protein: 120 };
            }
            
            state.tasks = state.tasks || [];
            state.notes = state.notes || [];
            if (!state.categories || state.categories.length === 0) {
                state.categories = [{ id: 'c1', name: 'General', color: '#5B5FEF' }];
            }
        }
    } catch (e) {
        state.categories = [{ id: 'c1', name: 'General', color: '#5B5FEF' }];
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
}

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

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

function getLocalISODate(offsetDays = 0) {
    const localDate = new Date();
    localDate.setDate(localDate.getDate() + offsetDays);
    return new Date(localDate.getTime() - (localDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
}

// --- MODULE: EXPENSE TRACKER ---
window.openExpenseModal = function() {
    document.getElementById('exp-id').value = '';
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-desc').value = '';
    document.getElementById('exp-notes').value = '';
    document.getElementById('exp-tags').value = '';
    document.getElementById('exp-date').value = getLocalISODate();
    
    const catSelect = document.getElementById('exp-category');
    catSelect.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    
    const payerSelect = document.getElementById('exp-paid-by');
    payerSelect.innerHTML = `<option value="you">You</option>` + state.people.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    payerSelect.value = 'you';
    
    document.getElementById('exp-is-split').checked = false;
    document.getElementById('split-section').style.display = 'none';
    currentSplitType = 'equal';
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.seg-btn[data-type="equal"]').classList.add('active');
    document.getElementById('btn-delete-expense').style.display = 'none';
    openModal('modal-expense');
};

window.toggleSplitUI = function() {
    const isChecked = document.getElementById('exp-is-split').checked;
    document.getElementById('split-section').style.display = isChecked ? 'block' : 'none';
    if (isChecked) {
        splitDataState = [{personId: 'you', name: 'You', selected: true, share: 0}];
        state.people.forEach(p => { splitDataState.push({personId: p.id, name: p.name, selected: true, share: 0}); });
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
        calculateSplits(); return;
    }
    list.innerHTML = splitDataState.map((s, idx) => `
        <div class="split-row flex-between align-center">
            <label class="flex-row align-center gap-sm cursor-pointer mb-0">
                <input type="checkbox" class="checkbox-custom" onchange="togglePersonSplit(${idx}, this.checked)" ${s.selected ? 'checked' : ''}>
                <span class="font-medium">${s.name}</span>
            </label>
            <div class="flex-row align-center gap-xs">
                ${currentSplitType === 'percent' ? '<span>%</span>' : (currentSplitType === 'custom' ? '<span class="text-secondary">₹</span>' : '')}
                <input type="number" class="input-standard p-sm text-right" style="width: 90px;" value="${s.share}" 
                       ${currentSplitType === 'equal' || !s.selected ? 'disabled' : ''}
                       oninput="updatePersonShare(${idx}, this.value)" min="0" step="0.01">
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
    if (!document.getElementById('exp-is-split').checked) return;
    const totalPaise = toPaise(document.getElementById('exp-amount').value || 0);
    const selected = splitDataState.filter(s => s.selected);
    let calculatedPaiseTotal = 0;
    const valText = document.getElementById('split-validation-text');
    const valTotal = document.getElementById('split-total-amount');

    if (currentSplitType === 'equal') {
        if (selected.length > 0) {
            const baseSplitPaise = Math.floor(totalPaise / selected.length);
            let remainderPaise = totalPaise % selected.length;
            splitDataState.forEach(s => { 
                if (s.selected) {
                    let sharePaise = baseSplitPaise;
                    if (remainderPaise > 0) { sharePaise += 1; remainderPaise -= 1; }
                    s.share = toRupees(sharePaise);
                } else { s.share = 0; }
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
    if (data.length === 0) throw new Error("Please select at least one person.");
    const targetPaise = toPaise(amount);
    if (type === 'percent') {
        const totalPctPaise = data.reduce((sum, d) => sum + toPaise(d.rawValue), 0);
        if (totalPctPaise !== 10000) throw new Error(`Percentages must equal 100%.`);
        const totalSharePaise = data.reduce((sum, d) => sum + toPaise(d.share), 0);
        if (totalSharePaise !== targetPaise) throw new Error(`Calculated split amount does not equal total expense.`);
    } else if (type === 'custom') {
        const totalSharePaise = data.reduce((sum, d) => sum + toPaise(d.share), 0);
        if (totalSharePaise !== targetPaise) throw new Error(`Custom shares must equal exact total expense.`);
    }
}

window.saveExpense = function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; 
    try {
        const id = document.getElementById('exp-id').value || 'exp_' + Date.now();
        const amount = roundToTwo(parseFloat(document.getElementById('exp-amount').value));
        const desc = document.getElementById('exp-desc').value.trim();
        const notes = document.getElementById('exp-notes').value.trim();
        const tags = document.getElementById('exp-tags').value.trim();
        const category = document.getElementById('exp-category').value;
        const paidBy = document.getElementById('exp-paid-by').value;
        const dateStr = document.getElementById('exp-date').value; 
        let isSplit = document.getElementById('exp-is-split').checked;
        const currentIsoTime = new Date().toISOString();
        
        if (isNaN(amount) || amount <= 0) throw new Error("Invalid amount");
        
        const existingExp = state.expenses.find(ex => ex.id === id);
        let gpayRequestStatus = existingExp ? existingExp.gpayRequestStatus : 'not_sent';
        let gpayRequestSentAt = existingExp ? existingExp.gpayRequestSentAt : null;
        let createdAt = existingExp ? existingExp.createdAt : currentIsoTime;
        let updatedAt = currentIsoTime;
        let splitType = 'none';
        let splitData = null;

        if (!isSplit && paidBy !== 'you') {
            isSplit = true; splitType = 'custom';
            splitData = [
                { personId: 'you', share: amount, rawValue: amount, isSettled: false },
                { personId: paidBy, share: 0, rawValue: 0, isSettled: true }
            ];
        } else if (isSplit) {
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
                    const calculatedPaise = Math.floor(targetPaise * (s.rawValue / 100));
                    s.share = calculatedPaise; totalAllocatedPaise += calculatedPaise;
                });
                let remainderPaise = targetPaise - totalAllocatedPaise;
                let pIdx = 0;
                while(remainderPaise > 0) {
                    processingArray[pIdx].share += 1; remainderPaise -= 1;
                    pIdx = (pIdx + 1) % processingArray.length;
                }
                processingArray.forEach(s => { s.share = toRupees(s.share); });
            }
            splitData = processingArray;
            validateSplitData(amount, splitType, splitData);
            
            if (existingExp && existingExp.isSplit && existingExp.splitData) {
                let hasPayments = existingExp.splitData.some(s => s.isSettled && s.personId !== 'you');
                if (hasPayments) {
                    let invalidPayment = false;
                    splitData.forEach(newS => {
                        const oldS = existingExp.splitData.find(os => os.personId === newS.personId);
                        if (oldS && oldS.isSettled && newS.share < oldS.share) invalidPayment = true;
                    });
                    pendingSavePayload = { id, amount, desc, notes, tags, category, paidBy, date: dateStr, isSplit, splitType, splitData, gpayRequestStatus, gpayRequestSentAt, createdAt, updatedAt };
                    if (invalidPayment) throw new Error("Cannot lower share below what is paid.");
                    else { openModal('modal-split-warning'); return; }
                }
            }
        }
        executeExpenseSave({ id, amount, desc, notes, tags, category, paidBy, date: dateStr, isSplit, splitType, splitData, gpayRequestStatus, gpayRequestSentAt, createdAt, updatedAt });
    } catch (err) { alert(err.message); } 
    finally { setTimeout(() => btn.disabled = false, 500); }
};

window.forceSaveExpense = function() {
    if (pendingSavePayload) { executeExpenseSave(pendingSavePayload); pendingSavePayload = null; }
};

function executeExpenseSave(expense) {
    const existingIdx = state.expenses.findIndex(ex => ex.id === expense.id);
    if (existingIdx >= 0) state.expenses[existingIdx] = expense;
    else state.expenses.push(expense);
    saveState(); closeAllModals(); showToast("Saved!");
}

window.editExpense = function(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (!exp) return;
    document.getElementById('exp-id').value = exp.id;
    document.getElementById('exp-amount').value = exp.amount;
    document.getElementById('exp-desc').value = exp.desc;
    document.getElementById('exp-notes').value = exp.notes || '';
    document.getElementById('exp-tags').value = exp.tags || '';
    document.getElementById('exp-date').value = exp.date;
    
    const catSelect = document.getElementById('exp-category');
    catSelect.innerHTML = state.categories.map(c => `<option value="${c.id}" ${c.id === exp.category ? 'selected' : ''}>${c.name}</option>`).join('');
    
    const payerSelect = document.getElementById('exp-paid-by');
    payerSelect.innerHTML = `<option value="you">You</option>` + state.people.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    payerSelect.value = exp.paidBy || 'you';
    
    const splitCheck = document.getElementById('exp-is-split');
    if (exp.isSplit && exp.splitType === 'custom' && exp.paidBy !== 'you' && exp.splitData.length === 2 && exp.splitData[0].personId === 'you' && exp.splitData[0].share === exp.amount) {
        splitCheck.checked = false; document.getElementById('split-section').style.display = 'none';
    } else {
        splitCheck.checked = !!exp.isSplit; document.getElementById('split-section').style.display = exp.isSplit ? 'block' : 'none';
        if (exp.isSplit) {
            currentSplitType = exp.splitType || 'equal';
            document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
            document.querySelector(`.seg-btn[data-type="${currentSplitType}"]`).classList.add('active');
            splitDataState = [{personId: 'you', name: 'You', selected: false, share: 0}];
            state.people.forEach(p => splitDataState.push({personId: p.id, name: p.name, selected: false, share: 0}));
            exp.splitData.forEach(saved => {
                const target = splitDataState.find(s => s.personId === saved.personId);
                if (target) { target.selected = true; target.share = exp.splitType === 'percent' && saved.rawValue ? saved.rawValue : saved.share; }
            });
            renderSplitMembers();
        }
    }
    document.getElementById('btn-delete-expense').style.display = 'block'; openModal('modal-expense');
};

window.deleteExpenseFromModal = function() {
    const id = document.getElementById('exp-id').value;
    state.expenses = state.expenses.filter(e => e.id !== id);
    saveState(); closeAllModals(); showToast("Deleted");
};

window.triggerQuickAdd = function() {
    const amount = prompt("Quick Add Expense\nEnter amount (₹):");
    if (!amount) return;
    const parsedAmount = roundToTwo(parseFloat(amount));
    if (isNaN(parsedAmount) || parsedAmount <= 0) return alert("Invalid amount.");
    const desc = prompt("Enter description:");
    if (!desc) return;
    if (state.categories.length === 0) return alert("Add a category first.");
    
    const currentIsoTime = new Date().toISOString();
    const expense = { 
        id: 'exp_' + Date.now(), amount: parsedAmount, desc: desc.trim(), notes: '', tags: '', paidBy: 'you',
        category: state.categories[0].id, date: getLocalISODate(), isSplit: false, splitType: 'none', splitData: null, 
        gpayRequestStatus: 'not_sent', gpayRequestSentAt: null, createdAt: currentIsoTime, updatedAt: currentIsoTime 
    };
    state.expenses.push(expense); saveState(); showToast(`Saved: ₹${parsedAmount.toFixed(2)}`);
};

// --- MODULE: PROJECTS & GOALS ---
window.openProjectModal = function(id = '') {
    const p = state.projects.find(x => x.id === id);
    document.getElementById('proj-id').value = id;
    document.getElementById('proj-name').value = p ? p.name : '';
    document.getElementById('proj-budget').value = p ? p.targetBudget : '';
    document.getElementById('proj-date').value = p ? p.startDate : getLocalISODate();
    document.getElementById('proj-status').value = p ? p.status : 'Active';
    document.getElementById('btn-delete-project').style.display = p ? 'block' : 'none';
    openModal('modal-project');
};

window.saveProject = function(e) {
    e.preventDefault();
    const id = document.getElementById('proj-id').value || 'proj_' + Date.now();
    const name = document.getElementById('proj-name').value.trim();
    const targetBudget = roundToTwo(parseFloat(document.getElementById('proj-budget').value) || 0);
    const startDate = document.getElementById('proj-date').value;
    const status = document.getElementById('proj-status').value;
    
    const proj = { id, name, targetBudget, startDate, status, transactions: [] };
    const existingIdx = state.projects.findIndex(x => x.id === id);
    
    if (existingIdx >= 0) {
        proj.transactions = state.projects[existingIdx].transactions; // Preserve tx
        state.projects[existingIdx] = proj;
    } else {
        state.projects.push(proj);
    }
    saveState(); closeAllModals(); showToast("Project saved");
    if(currentProjectViewId === id) openProjectDetail(id);
};

window.deleteProject = function() {
    const id = document.getElementById('proj-id').value;
    state.projects = state.projects.filter(p => p.id !== id);
    saveState(); closeAllModals(); switchTab('projects');
};

window.openProjectDetail = function(id) {
    currentProjectViewId = id;
    const p = state.projects.find(x => x.id === id);
    if(!p) return;
    
    document.getElementById('pd-title').innerText = p.name;
    const totalSpent = p.transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    document.getElementById('pd-amounts').innerText = `${formatINR(totalSpent)} / ${formatINR(p.targetBudget)}`;
    
    let pct = 0;
    if (p.targetBudget > 0) pct = Math.min(100, (totalSpent / p.targetBudget) * 100);
    
    const fill = document.getElementById('pd-progress');
    fill.style.width = `${pct}%`;
    fill.className = `progress-fill ${pct > 90 ? 'danger' : 'success'}`;
    document.getElementById('pd-pct').innerText = `${pct.toFixed(1)}%`;
    
    switchTab('project-detail');
    renderProjectTransactions(id);
};

window.openProjectTxModal = function(txId = '') {
    if(!currentProjectViewId) return;
    const p = state.projects.find(x => x.id === currentProjectViewId);
    const tx = p.transactions.find(x => x.id === txId);
    
    document.getElementById('ptx-id').value = txId;
    document.getElementById('ptx-type').value = tx ? tx.type : 'expense';
    document.getElementById('ptx-amount').value = tx ? tx.amount : '';
    document.getElementById('ptx-desc').value = tx ? tx.desc : '';
    document.getElementById('ptx-date').value = tx ? tx.date : getLocalISODate();
    document.getElementById('btn-delete-ptx').style.display = tx ? 'block' : 'none';
    
    openModal('modal-project-tx');
};

window.saveProjectTx = function(e) {
    e.preventDefault();
    if(!currentProjectViewId) return;
    const pIdx = state.projects.findIndex(x => x.id === currentProjectViewId);
    if(pIdx < 0) return;
    
    const id = document.getElementById('ptx-id').value || 'ptx_' + Date.now();
    const type = document.getElementById('ptx-type').value;
    const amount = roundToTwo(parseFloat(document.getElementById('ptx-amount').value) || 0);
    const desc = document.getElementById('ptx-desc').value.trim();
    const date = document.getElementById('ptx-date').value;
    
    const tx = { id, type, amount, desc, date };
    const txIdx = state.projects[pIdx].transactions.findIndex(x => x.id === id);
    if(txIdx >= 0) state.projects[pIdx].transactions[txIdx] = tx;
    else state.projects[pIdx].transactions.push(tx);
    
    saveState(); closeAllModals(); openProjectDetail(currentProjectViewId);
};

window.deleteProjectTx = function() {
    if(!currentProjectViewId) return;
    const pIdx = state.projects.findIndex(x => x.id === currentProjectViewId);
    const txId = document.getElementById('ptx-id').value;
    state.projects[pIdx].transactions = state.projects[pIdx].transactions.filter(x => x.id !== txId);
    saveState(); closeAllModals(); openProjectDetail(currentProjectViewId);
};

// --- MODULE: FITNESS HABITS ---
window.saveFitnessTargets = function(e) {
    e.preventDefault();
    state.fitnessTargets.steps = parseInt(document.getElementById('fit-tgt-steps').value) || 0;
    state.fitnessTargets.water = parseFloat(document.getElementById('fit-tgt-water').value) || 0;
    state.fitnessTargets.protein = parseInt(document.getElementById('fit-tgt-protein').value) || 0;
    saveState(); closeAllModals(); showToast("Targets updated");
};

window.toggleFitnessHabit = function(dateStr, habitType) {
    if (!state.fitnessLogs[dateStr]) state.fitnessLogs[dateStr] = { steps: false, water: false, protein: false };
    state.fitnessLogs[dateStr][habitType] = !state.fitnessLogs[dateStr][habitType];
    saveState();
};

function renderFitnessList() {
    const container = document.getElementById('fitness-matrix');
    if(!container) return;
    
    // Header setup
    let html = `
        <div class="habit-day-col" style="align-items:flex-start; margin-right:12px;">
            <div style="height:28px;"></div>
            <div class="text-xs font-bold text-secondary flex-col align-center" style="height:28px; justify-content:center;">Steps <span style="font-size:0.65rem">(${state.fitnessTargets.steps})</span></div>
            <div class="text-xs font-bold text-secondary flex-col align-center" style="height:28px; justify-content:center;">Water <span style="font-size:0.65rem">(${state.fitnessTargets.water}L)</span></div>
            <div class="text-xs font-bold text-secondary flex-col align-center" style="height:28px; justify-content:center;">Protein <span style="font-size:0.65rem">(${state.fitnessTargets.protein}g)</span></div>
        </div>
    `;
    
    // Render last 7 days
    for (let i = 6; i >= 0; i--) {
        const dStr = getLocalISODate(-i);
        const dateObj = new Date(dStr);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = dateObj.getDate();
        
        const log = state.fitnessLogs[dStr] || { steps: false, water: false, protein: false };
        
        html += `
        <div class="habit-day-col">
            <div class="text-center" style="height:28px;">
                <div class="text-xs text-secondary font-bold">${dayName}</div>
                <div class="text-sm font-medium ${i===0 ? 'text-primary' : ''}">${dayNum}</div>
            </div>
            <div class="habit-circle ${log.steps ? 'done' : ''}" onclick="toggleFitnessHabit('${dStr}', 'steps')">${log.steps?'✓':''}</div>
            <div class="habit-circle ${log.water ? 'done' : ''}" onclick="toggleFitnessHabit('${dStr}', 'water')">${log.water?'✓':''}</div>
            <div class="habit-circle ${log.protein ? 'done' : ''}" onclick="toggleFitnessHabit('${dStr}', 'protein')">${log.protein?'✓':''}</div>
        </div>
        `;
    }
    
    container.innerHTML = html;
}

// --- MODULE: TASKS & NOTES ---
window.setTNView = function(view) {
    document.querySelectorAll('#view-tasks .seg-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-view-${view}`).classList.add('active');
    document.getElementById('tn-todo-area').style.display = view === 'todo' ? 'block' : 'none';
    document.getElementById('tn-notes-area').style.display = view === 'notes' ? 'block' : 'none';
};

window.saveTask = function(e) {
    e.preventDefault();
    const title = document.getElementById('task-title').value.trim();
    if(!title) return;
    state.tasks.push({
        id: 'tsk_' + Date.now(), title, 
        dueDate: document.getElementById('task-date').value || null,
        completed: false
    });
    document.getElementById('task-title').value = '';
    saveState(); closeAllModals();
};

window.toggleTask = function(id) {
    const t = state.tasks.find(x => x.id === id);
    if(t) { t.completed = !t.completed; saveState(); }
};

window.deleteTask = function(id) {
    state.tasks = state.tasks.filter(x => x.id !== id);
    saveState();
};

window.saveNote = function(e) {
    e.preventDefault();
    const id = document.getElementById('note-id').value || 'note_' + Date.now();
    const title = document.getElementById('note-title').value.trim();
    const content = document.getElementById('note-content').value.trim();
    if(!title) return;
    
    const existingIdx = state.notes.findIndex(x => x.id === id);
    const note = { id, title, content, updatedAt: new Date().toISOString() };
    if(existingIdx >= 0) state.notes[existingIdx] = note;
    else state.notes.push(note);
    
    document.getElementById('note-title').value = '';
    document.getElementById('note-content').value = '';
    saveState(); closeAllModals();
};

window.openNoteModal = function(id = '') {
    const n = state.notes.find(x => x.id === id);
    document.getElementById('note-id').value = id;
    document.getElementById('note-title').value = n ? n.title : '';
    document.getElementById('note-content').value = n ? n.content : '';
    document.getElementById('btn-delete-note').style.display = n ? 'block' : 'none';
    openModal('modal-note');
};

window.deleteNote = function() {
    const id = document.getElementById('note-id').value;
    state.notes = state.notes.filter(x => x.id !== id);
    saveState(); closeAllModals();
};

// --- DATA MANAGEMENT ---
window.savePerson = function(e) {
    e.preventDefault();
    const name = document.getElementById('person-name').value.trim();
    if (!name) return;
    state.people.push({ id: 'p_' + Date.now(), name });
    document.getElementById('person-name').value = '';
    saveState(); closeAllModals();
};

window.deletePerson = function(id) {
    const inUse = state.expenses.some(e => e.paidBy === id || (e.isSplit && e.splitData && e.splitData.some(s => s.personId === id)));
    if (inUse) { alert("Cannot delete this person. They are part of existing expenses."); return; }
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
    if (inUse) { alert("Cannot delete this category."); return; }
    state.categories = state.categories.filter(c => c.id !== id);
    saveState();
};

window.saveBudget = function(e) { 
    e.preventDefault(); 
    state.budget = roundToTwo(parseFloat(document.getElementById('budget-amount').value) || 0); 
    saveState(); closeAllModals(); 
};
window.removeBudget = function() { state.budget = 0; saveState(); closeAllModals(); };
window.clearAllData = function() { if(confirm("Delete ALL data?")) { localStorage.clear(); window.location.reload(); } };

window.exportCSV = function() {
    if (state.expenses.length === 0) return alert("No expenses to export.");
    let csvContent = "Date,Time,Description,Category,Paid By,Amount,Split Type,Participants,Tags,Notes,Created At,Updated At
";
    const sorted = [...state.expenses].sort((a,b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(e => {
        const catObj = state.categories.find(c => c.id === e.category);
        const payerObj = e.paidBy === 'you' ? {name:'You'} : state.people.find(p => p.id === e.paidBy);
        let pStr = '';
        if (e.isSplit && e.splitData) {
            pStr = `"${e.splitData.map(s => `${s.personId==='you'?'You':(state.people.find(p=>p.id===s.personId)?.name||'Unknown')} (₹${s.share.toFixed(2)})`).join(', ')}"`;
        }
        csvContent += `${e.date},${formatTime(e.updatedAt||e.createdAt)},"${e.desc.replace(/"/g,'""')}","${catObj?catObj.name:'Unknown'}","${payerObj?payerObj.name:'Unknown'}",${e.amount.toFixed(2)},${e.isSplit?e.splitType:'None'},${pStr},"${(e.tags||'').replace(/"/g,'""')}","${(e.notes||'').replace(/"/g,'""')}","${new Date(e.createdAt).toLocaleString()}","${new Date(e.updatedAt).toLocaleString()}"
`;
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
    a.download = `PocketSplit_Expenses_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
};

window.exportData = function() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: 'application/json' }));
    a.download = `PocketSplit_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
};

function validateImportedState(parsed) {
    if (!parsed || typeof parsed !== 'object') throw new Error("Invalid format.");
    if (parsed.expenses) parsed.expenses.forEach(e => {
        if (!e.id || isNaN(parseFloat(e.amount)) || !e.date) throw new Error("Corrupt expense data.");
    });
}

window.importData = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            validateImportedState(parsed);
            state = { ...state, ...parsed }; 
            saveState(); alert("Import successful!"); window.location.reload();
        } catch (err) { alert("Import failed."); }
    };
    reader.readAsText(file);
};

// --- RENDERERS ---
function renderAll() {
    renderHome();
    renderExpensesListFull();
    renderCategoriesModal();
    renderProjectsList();
    renderFitnessList();
    renderTasksAndNotes();
    if (document.getElementById('view-settlements').classList.contains('active')) renderSettlementsTab();
    if (document.getElementById('view-analytics').classList.contains('active')) renderAnalytics();
    
    // Auto-populate edit project modal targets
    if (document.getElementById('fit-tgt-steps')) {
        document.getElementById('fit-tgt-steps').value = state.fitnessTargets.steps;
        document.getElementById('fit-tgt-water').value = state.fitnessTargets.water;
        document.getElementById('fit-tgt-protein').value = state.fitnessTargets.protein;
    }
}

function renderHome() {
    const currentMonthStr = new Date().toISOString().slice(0,7); 
    let monthPersonalSpend = 0;
    
    state.expenses.forEach(exp => {
        if (exp.date.startsWith(currentMonthStr)) {
            const paidBy = exp.paidBy || 'you';
            if (!exp.isSplit) {
                if (paidBy === 'you') monthPersonalSpend += exp.amount;
            } else {
                const myShareObj = exp.splitData.find(s => s.personId === 'you');
                if (myShareObj) monthPersonalSpend += myShareObj.share;
            }
        }
    });
    
    document.getElementById('dash-month-spend').innerText = formatINR(monthPersonalSpend);
    if (state.budget > 0) {
        const left = state.budget - monthPersonalSpend;
        document.getElementById('dash-budget-status').innerHTML = `Budget left: <strong class="${left<0?'text-danger':''}">${formatINR(left)}</strong>`;
    }
    
    const pendingTasks = state.tasks.filter(t => !t.completed).length;
    document.getElementById('dash-tasks-pending').innerText = pendingTasks;
    
    // Recent Expenses
    const recent = document.getElementById('dash-expenses-list');
    const sortedExp = [...state.expenses].sort((a,b) => new Date(b.date) - new Date(a.date));
    recent.innerHTML = sortedExp.slice(0, 3).map(e => `
        <div class="list-item p-sm clickable border-bottom" onclick="switchTab('expenses')">
            <div class="expense-list-item-left">
                <h3 class="m-0 text-sm">${e.desc}</h3>
                <span class="text-xs text-secondary">${e.date}</span>
            </div>
            <strong class="text-primary text-sm">${formatINR(e.amount)}</strong>
        </div>
    `).join('') || '<p class="text-xs text-secondary">No expenses</p>';
    
    // Active Projects
    const activeProjs = state.projects.filter(p => p.status === 'Active');
    const plist = document.getElementById('dash-projects-list');
    plist.innerHTML = activeProjs.slice(0,2).map(p => {
        const spent = p.transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
        let pct = p.targetBudget ? Math.min(100, (spent/p.targetBudget)*100) : 0;
        return `
        <div class="card p-sm mb-xs clickable" onclick="openProjectDetail('${p.id}')">
            <div class="flex-between mb-xs"><span class="font-medium text-sm">${p.name}</span><span class="text-xs">${formatINR(spent)}</span></div>
            <div class="progress-bg"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
    `}).join('') || '<p class="text-xs text-secondary p-sm">No active projects</p>';
}

window.renderExpensesListFull = function() {
    const list = document.getElementById('expenses-list');
    if (!list) return;
    
    const searchInput = document.getElementById('expense-search');
    const monthInput = document.getElementById('expense-month');
    
    // Auto-populate month input if blank
    if (!monthInput.value) {
        monthInput.value = getLocalISODate().slice(0, 7);
    }
    
    const searchTerm = (searchInput?.value || '').toLowerCase();
    const monthTerm = monthInput.value || '';
    
    let filtered = state.expenses;
    if (searchTerm) filtered = filtered.filter(e => e.desc.toLowerCase().includes(searchTerm) || (e.tags||'').toLowerCase().includes(searchTerm));
    if (monthTerm) filtered = filtered.filter(e => e.date.startsWith(monthTerm));
    
    if (filtered.length === 0) { list.innerHTML = `<div class="empty-state">No expenses found.</div>`; return; }
    
    const grouped = {};
    filtered.forEach(exp => { if (!grouped[exp.date]) grouped[exp.date] = []; grouped[exp.date].push(exp); });
    const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
    
    list.innerHTML = sortedDates.map(dateStr => {
        const items = grouped[dateStr].sort((a,b) => new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt));
        const htmlItems = items.map(e => `
            <div class="card p-md flex-between align-center mb-sm clickable" onclick="editExpense('${e.id}')">
                <div class="expense-list-item-left">
                    <h3 class="m-0">${e.desc}</h3>
                    <div class="text-xs text-secondary mt-xs">${formatTime(e.updatedAt||e.createdAt)} ${e.isSplit?'<span class="text-primary ml-sm">Split</span>':''}</div>
                </div>
                <strong class="text-primary">${formatINR(e.amount)}</strong>
            </div>
        `).join('');
        return `<div class="mt-md mb-xs"><span class="text-xs font-bold text-secondary">${getRelativeDateLabel(dateStr).toUpperCase()}</span><div class="border-bottom mt-xs mb-sm"></div></div>${htmlItems}`;
    }).join('');
}

function getSettlementData(tagFilter = '') {
    let toReceiveTotal = 0; let toPayTotal = 0; let collectedTotal = 0;
    let peopleBalances = {}; 
    state.people.forEach(p => { peopleBalances[p.id] = { name: p.name, owesMe: 0, iOwe: 0, paid: 0 }; });

    state.expenses.forEach(exp => {
        if (tagFilter && !(exp.tags || '').toLowerCase().includes(tagFilter)) return;
        const paidBy = exp.paidBy || 'you';
        if (exp.isSplit && exp.splitData) {
            if (paidBy === 'you') {
                exp.splitData.forEach(s => {
                    if (s.personId !== 'you' && peopleBalances[s.personId]) {
                        if (s.isSettled) { peopleBalances[s.personId].paid += s.share; collectedTotal += s.share; } 
                        else { peopleBalances[s.personId].owesMe += s.share; toReceiveTotal += s.share; }
                    }
                });
            } else if (peopleBalances[paidBy]) {
                const myShareObj = exp.splitData.find(s => s.personId === 'you');
                if (myShareObj && myShareObj.share > 0 && !myShareObj.isSettled) {
                    peopleBalances[paidBy].iOwe += myShareObj.share; toPayTotal += myShareObj.share;
                }
            }
        }
    });
    return { toReceiveTotal, toPayTotal, collectedTotal, peopleBalances };
}

function renderSettlementsTab() {
    const container = document.getElementById('settlements-list-container');
    if (!container) return;
    const tagFilter = (document.getElementById('settlement-tag-search')?.value||'').trim().toLowerCase();
    const data = getSettlementData(tagFilter);
    
    document.getElementById('settlements-receive').innerText = formatINR(data.toReceiveTotal);
    document.getElementById('settlements-pay').innerText = formatINR(data.toPayTotal);
    document.getElementById('settlements-net').innerText = formatINR(data.toReceiveTotal - data.toPayTotal);
    
    if(settlementView === 'person') {
        container.innerHTML = Object.keys(data.peopleBalances).map(personId => {
            const p = data.peopleBalances[personId];
            if(p.owesMe===0 && p.iOwe===0 && p.paid===0) return '';
            const net = p.owesMe - p.iOwe;
            return `<div class="card mb-sm p-sm flex-between align-center">
                <span class="font-medium">${p.name}</span>
                <strong class="${net>0?'text-success':(net<0?'text-danger':'text-secondary')}">${net>0?`Owes ${formatINR(net)}`:net<0?`You owe ${formatINR(Math.abs(net))}`:'Settled'}</strong>
            </div>`;
        }).join('') || '<div class="empty-state">No balances.</div>';
    } else {
        let splitExps = state.expenses.filter(e => e.isSplit && e.splitData);
        if(tagFilter) splitExps = splitExps.filter(e => (e.tags||'').toLowerCase().includes(tagFilter));
        container.innerHTML = splitExps.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(exp => `
            <div class="card p-sm mb-sm flex-between align-center clickable" onclick="editExpense('${exp.id}')">
                <div><h3 class="m-0 text-sm">${exp.desc}</h3><div class="text-xs text-secondary">${exp.date}</div></div>
                <strong class="text-primary">${formatINR(exp.amount)}</strong>
            </div>
        `).join('') || '<div class="empty-state">No split expenses.</div>';
    }
}

function renderAnalytics() {
    const currentMonth = new Date().toISOString().slice(0,7); 
    let monthSpend = 0; let categoryTotals = {};
    state.categories.forEach(c => categoryTotals[c.id] = { name: c.name, color: c.color, amount: 0 });
    state.expenses.forEach(exp => {
        if (exp.date.startsWith(currentMonth)) {
            let myCost = exp.amount;
            if (exp.isSplit && exp.splitData) { const myS = exp.splitData.find(s=>s.personId==='you'); myCost = myS?myS.share:0; } 
            else if (exp.paidBy !== 'you') myCost = 0;
            monthSpend += myCost;
            if (categoryTotals[exp.category]) categoryTotals[exp.category].amount += myCost;
        }
    });
    document.getElementById('analytics-total').innerText = formatINR(monthSpend);
}
