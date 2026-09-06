/**
 * PocketSplit Core Logic - Patched Version
 */

// --- 1. ACCESS CODE & AUTHENTICATION (IN-MEMORY ONLY) ---
// Do not persist this in localStorage. When the app closes, this resets to false.
window.POCKETSPLIT_AUTH = { isUnlocked: false };

function initializeApp() {
    const savedCode = localStorage.getItem('pocketSplit_accessCode');
    if (savedCode && !window.POCKETSPLIT_AUTH.isUnlocked) {
        showAccessCodeScreen();
    } else {
        showHomeScreen();
        loadExistingData();
    }
}

function unlockApp(enteredCode) {
    const savedCode = localStorage.getItem('pocketSplit_accessCode');
    if (enteredCode === savedCode) {
        window.POCKETSPLIT_AUTH.isUnlocked = true;
        showHomeScreen();
    } else {
        alert('Incorrect Access Code'); // Replace with UI error
    }
}

function lockApp() {
    window.POCKETSPLIT_AUTH.isUnlocked = false;
    showAccessCodeScreen();
}

// --- 2. FINANCIAL CALCULATIONS & ROUNDING ---
// Use this for ALL currency math to prevent 100.00000000002 errors
function roundToTwo(num) {
    return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(amount);
}

// --- 3. SPLIT VALIDATION ---
function validateSplit(expenseAmount, splitType, splitData) {
    const totalExpense = roundToTwo(expenseAmount);
    
    if (splitType === 'percentage') {
        const totalPercent = splitData.reduce((sum, val) => sum + Number(val.share), 0);
        if (roundToTwo(totalPercent) !== 100.00) {
            throw new Error("Percentages must exactly equal 100%");
        }
    } else if (splitType === 'custom') {
        const totalCustom = splitData.reduce((sum, val) => sum + Number(val.share), 0);
        if (roundToTwo(totalCustom) !== totalExpense) {
            throw new Error(`Custom shares must equal the total amount.`);
        }
    }
    return true;
}

// --- 4. DATE HANDLING (TIMEZONE SAFE) ---
function parseLocalDate(dateString) {
    // Expects "YYYY-MM-DD"
    const parts = dateString.split('-');
    if (parts.length === 3) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date();
}

// --- 5. SAFE IMPORT / EXPORT ---
function exportData() {
    const data = localStorage.getItem('pocketsplit_data') || '{}';
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PocketSplit_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}

function importData(jsonString) {
    try {
        const parsed = JSON.parse(jsonString);
        if (!parsed.expenses || !parsed.people) {
            throw new Error("Invalid backup format");
        }
        localStorage.setItem('pocketsplit_data', JSON.stringify(parsed));
        alert("Import successful! Reloading...");
        window.location.reload();
    } catch (e) {
        alert("Import failed: The file is invalid. Your existing data was not changed.");
    }
}

// --- 6. DOUBLE SUBMISSION PREVENTION ---
function handleExpenseSubmit(event, formElement) {
    event.preventDefault();
    const btn = formElement.querySelector('button[type="submit"]');
    btn.disabled = true;
    
    try {
        // Execute save logic here
    } finally {
        setTimeout(() => { btn.disabled = false; }, 1000);
    }
}
