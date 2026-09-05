// State Management
let data = {
    expenses: [],
    friends: []
};

// Initialize App
function init() {
    loadData();
    
    // Set default dates
    document.getElementById('exp-date').valueAsDate = new Date();
    
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('expense-month-filter').value = monthStr;

    populateFriendsDropdown();
    renderAll();
}

// Data Persistence
function loadData() {
    const stored = localStorage.getItem('trackit_data');
    if (stored) {
        data = JSON.parse(stored);
        // Ensure arrays exist if migrating from older version
        if (!data.expenses) data.expenses = [];
        if (!data.friends) data.friends = [];
    }
}

function saveData() {
    localStorage.setItem('trackit_data', JSON.stringify(data));
    renderAll();
}

// Navigation
function switchTab(tabId, btnElement) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(`view-${tabId}`).classList.add('active');
    btnElement.classList.add('active');
    
    const titles = {
        'dashboard': 'Dashboard',
        'expenses': 'Expenses',
        'splits': 'Friends & Splits',
        'settings': 'Settings'
    };
    document.getElementById('header-title').innerText = titles[tabId];
    
    renderAll(); // Refresh data when switching tabs
}

// Modals
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) event.target.style.display = "none";
}

// Form Handlers
function toggleSplitFields() {
    const isSplit = document.getElementById('exp-is-split').checked;
    document.getElementById('split-fields').style.display = isSplit ? 'block' : 'none';
    if(isSplit && data.friends.length === 0) {
        alert("Please add friends first in the Splits tab!");
        document.getElementById('exp-is-split').checked = false;
        document.getElementById('split-fields').style.display = 'none';
    }
}

function handleAddFriend(e) {
    e.preventDefault();
    const name = document.getElementById('friend-name').value.trim();
    if (!name) return;
    
    data.friends.push({ id: Date.now().toString(), name: name });
    saveData();
    populateFriendsDropdown();
    closeModal('modal-add-friend');
    document.getElementById('form-friend').reset();
}

function populateFriendsDropdown() {
    const select = document.getElementById('exp-split-person');
    select.innerHTML = '';
    data.friends.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name;
        select.appendChild(opt);
    });
}

function handleExpenseSubmit(e) {
    e.preventDefault();
    
    const isSplit = document.getElementById('exp-is-split').checked;
    
    const newExpense = {
        id: Date.now().toString(),
        amount: parseFloat(document.getElementById('exp-amount').value),
        desc: document.getElementById('exp-desc').value,
        date: document.getElementById('exp-date').value,
        category: document.getElementById('exp-category').value,
        split: null
    };

    if (isSplit) {
        newExpense.split = {
            friendId: document.getElementById('exp-split-person').value,
            amountOwed: parseFloat(document.getElementById('exp-split-amount').value),
            gpayRequested: document.getElementById('exp-gpay-status').checked,
            settled: false
        };
    }

    data.expenses.push(newExpense);
    saveData();
    closeModal('modal-add-expense');
    document.getElementById('form-expense').reset();
    document.getElementById('exp-date').valueAsDate = new Date();
    document.getElementById('split-fields').style.display = 'none';
}

function toggleGpayStatus(expenseId) {
    const exp = data.expenses.find(e => e.id === expenseId);
    if (exp && exp.split) {
        exp.split.gpayRequested = !exp.split.gpayRequested;
        saveData();
    }
}

function markSettled(expenseId) {
    const exp = data.expenses.find(e => e.id === expenseId);
    if (exp && exp.split) {
        exp.split.settled = true;
        saveData();
    }
}

function deleteExpense(expenseId) {
    if(confirm("Delete this expense?")) {
        data.expenses = data.expenses.filter(e => e.id !== expenseId);
        saveData();
    }
}

// Rendering Logic
function renderAll() {
    renderDashboard();
    renderExpenses();
    renderSplits();
}

function renderDashboard() {
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    let totalSpend = 0;
    let totalOwed = 0;
    const catTotals = {};

    data.expenses.forEach(exp => {
        if (exp.date.startsWith(currentMonthPrefix)) {
            totalSpend += exp.amount;
            
            // Calc categories
            if (!catTotals[exp.category]) catTotals[exp.category] = 0;
            catTotals[exp.category] += exp.amount;
        }
        
        // Owed calculation (all time, unsettled)
        if (exp.split && !exp.split.settled) {
            totalOwed += exp.split.amountOwed;
        }
    });

    document.getElementById('dash-total-spend').innerText = `₹${totalSpend}`;
    document.getElementById('dash-total-owed').innerText = `₹${totalOwed}`;

    // Render category bars
    const barsContainer = document.getElementById('category-bars');
    barsContainer.innerHTML = '';
    
    const sortedCats = Object.keys(catTotals).sort((a,b) => catTotals[b] - catTotals[a]);
    
    sortedCats.forEach(cat => {
        const catAmt = catTotals[cat];
        const percentage = totalSpend > 0 ? Math.round((catAmt / totalSpend) * 100) : 0;
        
        barsContainer.innerHTML += `
            <div class="cat-bar-container">
                <div class="cat-label">
                    <span>${cat}</span>
                    <span>₹${catAmt} (${percentage}%)</span>
                </div>
                <div class="cat-track">
                    <div class="cat-fill" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    });
}

function renderExpenses() {
    const filter = document.getElementById('expense-month-filter').value;
    const list = document.getElementById('expense-list');
    list.innerHTML = '';

    const filtered = data.expenses.filter(e => e.date.startsWith(filter)).reverse(); // newest first

    if (filtered.length === 0) {
        list.innerHTML = `<p class="text-muted" style="text-align:center; margin-top:20px;">No expenses logged this month.</p>`;
        return;
    }

    filtered.forEach(exp => {
        let splitHtml = '';
        if (exp.split) {
            const friend = data.friends.find(f => f.id === exp.split.friendId)?.name || 'Unknown';
            const status = exp.split.settled ? '<span class="badge-gpay-done">Settled</span>' : 
                           (exp.split.gpayRequested ? '<span class="badge-gpay-done">GPay Req Sent</span>' : '<span class="badge-gpay-pending">GPay Pending</span>');
            
            splitHtml = `<div style="font-size: 0.85em; margin-top:5px; color: var(--secondary);">
                            Split w/ ${friend}: Owed ₹${exp.split.amountOwed} ${status}
                         </div>`;
        }

        list.innerHTML += `
            <div class="list-item" onclick="if(confirm('Delete expense?')) deleteExpense('${exp.id}')">
                <div class="list-item-left">
                    <h4>${exp.desc}</h4>
                    <div class="text-muted">${exp.date} &bull; ${exp.category}</div>
                    ${splitHtml}
                </div>
                <div class="list-item-right">
                    <h3>₹${exp.amount}</h3>
                </div>
            </div>
        `;
    });
}

function renderSplits() {
    const list = document.getElementById('splits-list');
    list.innerHTML = '';

    if (data.friends.length === 0) {
        list.innerHTML = `<p class="text-muted" style="text-align:center;">No friends added yet.</p>`;
        return;
    }

    data.friends.forEach(friend => {
        // Find all unsettled expenses for this friend
        const owedExps = data.expenses.filter(e => e.split && e.split.friendId === friend.id && !e.split.settled);
        
        let totalOwed = 0;
        let detailsHtml = '';

        owedExps.forEach(exp => {
            totalOwed += exp.split.amountOwed;
            const gpayAction = exp.split.gpayRequested ? 
                `<button class="btn-small" style="background:#555; color:white;" onclick="toggleGpayStatus('${exp.id}')">Cancel GPay Req</button>` :
                `<button class="btn-small" style="background:var(--secondary);" onclick="toggleGpayStatus('${exp.id}')">Request on GPay</button>`;

            detailsHtml += `
                <div style="background: #2a2a2a; padding: 10px; border-radius: 6px; margin-top: 8px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:0.9em;">${exp.desc}</div>
                        <div class="text-muted">₹${exp.split.amountOwed} &bull; ${exp.date}</div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:5px;">
                        ${gpayAction}
                        <button class="btn-small" style="background:var(--green); color:white;" onclick="markSettled('${exp.id}')">Mark Settled</button>
                    </div>
                </div>
            `;
        });

        list.innerHTML += `
            <div class="card" style="margin-bottom:10px;">
                <div class="flex-between">
                    <h3>${friend.name}</h3>
                    <h3 class="text-green">Owes ₹${totalOwed}</h3>
                </div>
                <div style="margin-top:10px;">
                    ${owedExps.length === 0 ? '<span class="text-muted">All settled up!</span>' : detailsHtml}
                </div>
            </div>
        `;
    });
}

// Data Management
function exportData() {
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TrackIt_Backup_${new Date().toISOString().split('T')[0]}.json`;
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
            if (importedData.expenses && importedData.friends) {
                data = importedData;
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
    event.target.value = ''; // Reset input
}

function clearAllData() {
    if (confirm("WARNING: This will delete ALL your data permanently! Are you sure?")) {
        if (confirm("Are you absolutely sure? Make sure you exported a backup!")) {
            localStorage.removeItem('trackit_data');
            data = { expenses: [], friends: [] };
            saveData();
            alert("Data cleared.");
        }
    }
}

// Boot up
window.onload = init;
