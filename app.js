// --- Default State ---
const defaultCategories = [
    { id: 'c1', name: 'Food', color: '#ff3b30' },
    { id: 'c2', name: 'Transport', color: '#007aff' },
    { id: 'c3', name: 'Shopping', color: '#ffcc00' },
    { id: 'c4', name: 'Entertainment', color: '#af52de' },
    { id: 'c5', name: 'Bills', color: '#34c759' }
];

let data = {
    theme: 'dark',
    budget: '',
    friends: [],
    categories: [...defaultCategories],
    expenses: []
};

// --- Initialization ---
function init() {
    const stored = localStorage.getItem('trackit_pro');
    if (stored) {
        let parsed = JSON.parse(stored);
        data = { ...data, ...parsed };
    }
    
    applyTheme(data.theme);
    document.getElementById('theme-select').value = data.theme;
    document.getElementById('setting-budget').value = data.budget;

    // Set filter to current month
    const now = new Date();
    document.getElementById('expense-month-filter').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    renderAll();
}

function saveData() {
    localStorage.setItem('trackit_pro', JSON.stringify(data));
    renderAll();
}

// --- Theme ---
function changeTheme(val) {
    data.theme = val;
    applyTheme(val);
    saveData();
}
function applyTheme(val) {
    document.documentElement.setAttribute('data-theme', val);
    const metaTheme = document.getElementById('meta-theme-color');
    metaTheme.setAttribute('content', val === 'dark' ? '#000000' : '#ffffff');
}

// --- Navigation ---
function switchTab(tabId, btn) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`view-${tabId}`).classList.add('active');
    btn.classList.add('active');
    
    const titles = { 'dashboard': 'Dashboard', 'expenses': 'Expenses', 'manage': 'Manage', 'settings': 'Settings' };
    document.getElementById('header-title').innerText = titles[tabId];
}

function switchManageTab(tabId, btn) {
    document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.sub-view').forEach(v => v.style.display = 'none');
    btn.classList.add('active');
    document.getElementById(`manage-${tabId}`).style.display = 'block';
}

// --- Modals ---
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
window.onclick = function(event) { if (event.target.classList.contains('modal')) event.target.style.display = "none"; }

// --- Manage Data (Categories & Friends) ---
function handleAddCategory(e) {
    e.preventDefault();
    data.categories.push({
        id: 'cat_' + Date.now(),
        name: document.getElementById('category-name').value,
        color: document.getElementById('category-color').value
    });
    closeModal('modal-add-category');
    e.target.reset();
    saveData();
}

function deleteCategory(id) {
    if(confirm("Delete category? Expenses using this will keep the name but lose the color.")) {
        data.categories = data.categories.filter(c => c.id !== id);
        saveData();
    }
}

function handleAddFriend(e) {
    e.preventDefault();
    data.friends.push({ id: 'fr_' + Date.now(), name: document.getElementById('friend-name').value });
    closeModal('modal-add-friend');
    e.target.reset();
    saveData();
}

function saveBudget(val) {
    data.budget = val;
    saveData();
}

// --- Expense Management ---
function populateCategoryDropdown(selectId) {
    const select = document.getElementById(selectId);
    select.innerHTML = '<option value="" disabled selected>Select Category</option>';
    data.categories.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    });
}

function openExpenseModal(expenseId = null) {
    populateCategoryDropdown('exp-category');
    const form = document.getElementById('form-expense');
    form.reset();
    document.getElementById('split-friends-container').style.display = 'none';
    
    if (expenseId) {
        document.getElementById('expense-modal-title').innerText = "Edit Expense";
        const exp = data.expenses.find(e => e.id === expenseId);
        document.getElementById('exp-id').value = exp.id;
        document.getElementById('exp-amount').value = exp.totalPaid;
        document.getElementById('exp-desc').value = exp.desc;
        document.getElementById('exp-date').value = exp.date;
        document.getElementById('exp-category').value = exp.categoryId;
        
        if (exp.splits && exp.splits.length > 0) {
            document.getElementById('exp-is-split').checked = true;
            renderSplitFriendsList(exp.splits);
        }
    } else {
        document.getElementById('expense-modal-title').innerText = "Add Expense";
        document.getElementById('exp-id').value = '';
        document.getElementById('exp-date').valueAsDate = new Date();
    }
    openModal('modal-add-expense');
}

function renderSplitFriendsList(existingSplits = []) {
    const isSplit = document.getElementById('exp-is-split').checked;
    const container = document.getElementById('split-friends-container');
    const list = document.getElementById('split-friends-list');
    
    if (!isSplit) {
        container.style.display = 'none';
        return;
    }
    
    if (data.friends.length === 0) {
        alert("Add friends in the Manage tab first!");
        document.getElementById('exp-is-split').checked = false;
        return;
    }
    
    container.style.display = 'block';
    list.innerHTML = '';
    
    data.friends.forEach(f => {
        const existing = existingSplits.find(s => s.friendId === f.id);
        const isChecked = existing ? 'checked' : '';
        const amt = existing ? existing.amount : '';
        const gpay = existing && existing.gpay ? 'checked' : '';
        
        list.innerHTML += `
            <div class="split-friend-row">
                <input type="checkbox" class="split-friend-check" value="${f.id}" ${isChecked} onchange="updateCalcSpend()">
                <div style="flex-grow:1; font-weight:500;">${f.name}</div>
                <input type="number" class="split-friend-amt" data-id="${f.id}" placeholder="₹ amount" value="${amt}" oninput="updateCalcSpend()" style="width: 90px;">
                <label style="font-size:0.7em; display:flex; align-items:center; gap:3px;">
                    <input type="checkbox" class="split-friend-gpay" data-id="${f.id}" ${gpay}> GPay
                </label>
            </div>
        `;
    });
    updateCalcSpend();
}

function updateCalcSpend() {
    const total = parseFloat(document.getElementById('exp-amount').value) || 0;
    let friendsOwe = 0;
    
    document.querySelectorAll('.split-friend-row').forEach(row => {
        const check = row.querySelector('.split-friend-check');
        const amtInput = row.querySelector('.split-friend-amt');
        if (check.checked) {
            friendsOwe += parseFloat(amtInput.value) || 0;
        }
    });
    
    const mySpend = total - friendsOwe;
    document.getElementById('calculated-my-spend').innerText = `₹${mySpend}`;
}

// Ensure calculation updates if total changes
document.getElementById('exp-amount').addEventListener('input', updateCalcSpend);

function handleExpenseSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('exp-id').value || 'exp_' + Date.now();
    const totalPaid = parseFloat(document.getElementById('exp-amount').value);
    
    const isSplit = document.getElementById('exp-is-split').checked;
    let splits = [];
    let totalOwedByFriends = 0;
    
    if (isSplit) {
        document.querySelectorAll('.split-friend-row').forEach(row => {
            const check = row.querySelector('.split-friend-check');
            if (check.checked) {
                const fId = check.value;
                const amt = parseFloat(row.querySelector('.split-friend-amt').value) || 0;
                const gpay = row.querySelector('.split-friend-gpay').checked;
                
                // Keep settlement status if editing an existing expense
                let settled = false;
                const existingExp = data.expenses.find(ex => ex.id === id);
                if(existingExp && existingExp.splits) {
                    const exSplit = existingExp.splits.find(s => s.friendId === fId);
                    if(exSplit) settled = exSplit.settled;
                }

                splits.push({ friendId: fId, amount: amt, gpay: gpay, settled: settled });
                totalOwedByFriends += amt;
            }
        });
    }

    const mySpend = totalPaid - totalOwedByFriends;

    const expenseObj = {
        id: id,
        desc: document.getElementById('exp-desc').value,
        date: document.getElementById('exp-date').value,
        categoryId: document.getElementById('exp-category').value,
        totalPaid: totalPaid,
        mySpend: mySpend,
        splits: splits
    };

    // Update or Add
    const idx = data.expenses.findIndex(ex => ex.id === id);
    if (idx > -1) {
        data.expenses[idx] = expenseObj;
    } else {
        data.expenses.push(expenseObj);
    }

    saveData();
    closeModal('modal-add-expense');
}

function deleteExpense(id) {
    if(confirm("Are you sure you want to delete this expense?")) {
        data.expenses = data.expenses.filter(e => e.id !== id);
        saveData();
    }
}

// --- Splits Actions ---
function toggleSettled(expId, friendId) {
    const exp = data.expenses.find(e => e.id === expId);
    if(exp && exp.splits) {
        const split = exp.splits.find(s => s.friendId === friendId);
        if(split) {
            split.settled = !split.settled;
            saveData();
        }
    }
}

// --- Rendering ---
function renderAll() {
    renderDashboard();
    renderExpenses();
    renderManage();
}

function renderManage() {
    // Categories
    const catList = document.getElementById('categories-list');
    catList.innerHTML = '';
    data.categories.forEach(c => {
        catList.innerHTML += `
            <div class="list-item flex-between">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:16px; height:16px; border-radius:50%; background:${c.color};"></div>
                    <strong>${c.name}</strong>
                </div>
                <button class="icon-btn" onclick="deleteCategory('${c.id}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;
    });

    // Friends & Splits
    const friendList = document.getElementById('splits-list');
    friendList.innerHTML = '';
    
    if(data.friends.length === 0) {
        friendList.innerHTML = `<p class="text-muted text-center py-3">No friends added.</p>`;
        return;
    }

    data.friends.forEach(f => {
        let owesMe = 0;
        let detailsHtml = '';
        
        data.expenses.forEach(ex => {
            if(ex.splits) {
                const split = ex.splits.find(s => s.friendId === f.id && !s.settled);
                if (split) {
                    owesMe += split.amount;
                    const badge = split.gpay ? '<span class="badge badge-done">GPay Req</span>' : '<span class="badge badge-pending">GPay Pend</span>';
                    detailsHtml += `
                        <div style="background:var(--bg-color); padding:8px; border-radius:6px; margin-top:6px; font-size:0.9em;" class="flex-between">
                            <div>
                                <div>${ex.desc} <span class="text-muted text-sm">(${ex.date})</span></div>
                                <div class="text-primary font-weight-bold">₹${split.amount} ${badge}</div>
                            </div>
                            <button class="btn-outline-small" style="color:var(--green); border-color:var(--green);" onclick="toggleSettled('${ex.id}', '${f.id}')">Settle</button>
                        </div>
                    `;
                }
            }
        });

        friendList.innerHTML += `
            <div class="card" style="padding:12px; margin-bottom:10px;">
                <div class="flex-between">
                    <h4>${f.name}</h4>
                    <span class="text-green font-weight-bold">Owes ₹${owesMe}</span>
                </div>
                ${detailsHtml}
            </div>
        `;
    });
}

function renderExpenses() {
    const filter = document.getElementById('expense-month-filter').value;
    const list = document.getElementById('expense-list');
    list.innerHTML = '';

    const filtered = data.expenses.filter(e => e.date.startsWith(filter)).reverse();

    if (filtered.length === 0) {
        list.innerHTML = `<p class="text-muted text-center" style="margin-top:40px;">No expenses logged this month.</p>`;
        return;
    }

    filtered.forEach(exp => {
        const cat = data.categories.find(c => c.id === exp.categoryId) || { name: 'Unknown', color: '#888' };
        
        let splitsText = '';
        if(exp.splits && exp.splits.length > 0) {
            const names = exp.splits.map(s => {
                const f = data.friends.find(fr => fr.id === s.friendId);
                return f ? f.name : '?';
            }).join(', ');
            splitsText = `<div class="text-sm mt-2" style="color:var(--primary);">Split w/ ${names} (My Spend: ₹${exp.mySpend})</div>`;
        }

        list.innerHTML += `
            <div class="list-item">
                <div class="list-item-header">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="width:12px; height:12px; border-radius:50%; background:${cat.color};"></div>
                        <span class="list-item-title">${exp.desc}</span>
                    </div>
                    <span class="list-item-amount">₹${exp.totalPaid}</span>
                </div>
                <div class="list-item-subtitle">${exp.date} • ${cat.name}</div>
                ${splitsText}
                <div class="action-icons">
                    <button class="icon-btn" onclick="openExpenseModal('${exp.id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="icon-btn text-danger" onclick="deleteExpense('${exp.id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        `;
    });
}

function renderDashboard() {
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    let monthMySpend = 0;
    let monthTotalPaid = 0;
    let allTimeOwed = 0;
    let catTotals = {};

    data.expenses.forEach(ex => {
        // Calculate owed regardless of month
        if(ex.splits) {
            ex.splits.forEach(s => {
                if(!s.settled) allTimeOwed += s.amount;
            });
        }

        // Current month calculations
        if (ex.date.startsWith(currentMonthStr)) {
            monthMySpend += ex.mySpend;
            monthTotalPaid += ex.totalPaid;
            
            if(!catTotals[ex.categoryId]) catTotals[ex.categoryId] = 0;
            catTotals[ex.categoryId] += ex.mySpend; // Analytics based on MY actual spend
        }
    });

    document.getElementById('dash-my-spend').innerText = `₹${monthMySpend}`;
    document.getElementById('dash-total-paid').innerText = `₹${monthTotalPaid}`;
    document.getElementById('dash-total-owed').innerText = `₹${allTimeOwed}`;

    // Budget
    const budget = parseFloat(data.budget);
    const budgetStatus = document.getElementById('budget-status');
    const budgetFill = document.getElementById('budget-fill');
    
    if (budget > 0) {
        const pct = Math.min((monthMySpend / budget) * 100, 100);
        budgetFill.style.width = `${pct}%`;
        budgetFill.style.background = pct >= 90 ? 'var(--danger)' : 'var(--primary)';
        const remaining = budget - monthMySpend;
        budgetStatus.innerText = remaining >= 0 ? `₹${remaining} remaining` : `₹${Math.abs(remaining)} over budget`;
    } else {
        budgetFill.style.width = '0%';
        budgetStatus.innerText = 'No budget set in settings';
    }

    // Analytics Chart (CSS Conic Gradient)
    const pie = document.getElementById('category-pie');
    const legend = document.getElementById('category-legend');
    legend.innerHTML = '';
    
    if (monthMySpend === 0) {
        pie.style.background = 'var(--border)';
        legend.innerHTML = '<span class="text-muted">No personal spend this month.</span>';
        return;
    }

    let gradientString = '';
    let startPct = 0;
    
    Object.keys(catTotals).forEach(catId => {
        const cat = data.categories.find(c => c.id === catId) || { name: 'Unknown', color: '#888' };
        const amt = catTotals[catId];
        const pct = (amt / monthMySpend) * 100;
        const endPct = startPct + pct;
        
        gradientString += `${cat.color} ${startPct}% ${endPct}%, `;
        startPct = endPct;

        legend.innerHTML += `
            <div class="legend-item">
                <div><span class="legend-color" style="background:${cat.color};"></span> ${cat.name}</div>
                <strong>₹${amt}</strong>
            </div>
        `;
    });

    pie.style.background = `conic-gradient(${gradientString.slice(0, -2)})`;
}

// --- Export / Import ---
function exportData() {
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TrackItPro_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (importedData.expenses) {
                data = { ...data, ...importedData };
                saveData();
                alert("Data imported successfully!");
                renderAll();
            } else {
                alert("Invalid backup file format.");
            }
        } catch (err) {
            alert("Error reading file.");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// Start
window.onload = init;
