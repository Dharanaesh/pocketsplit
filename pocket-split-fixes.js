/**
 * POCKETSPLIT - AUDIT FIXES & HARDENING
 * Merge these functions into your main application code or include this script before your main JS.
 */

// 1. IN-MEMORY AUTHENTICATION (CRITICAL FIX)
// Replaces localStorage persistence for app unlock state.
window.POCKETSPLIT_AUTH = { isUnlocked: false };

function checkAuthOnLoad() {
    const savedCode = localStorage.getItem('pocketSplit_accessCode');
    // If a code is set and the in-memory flag is false, require unlock
    if (savedCode && !window.POCKETSPLIT_AUTH.isUnlocked) {
        showScreen('access-code-screen');
    } else {
        showScreen('home-screen');
        loadData(); // Your existing function
    }
}

function unlockApp(enteredCode) {
    const savedCode = localStorage.getItem('pocketSplit_accessCode');
    if (enteredCode === savedCode) {
        window.POCKETSPLIT_AUTH.isUnlocked = true;
        showScreen('home-screen');
        loadData();
    } else {
        alert('Incorrect Access Code'); // Replace with your UI error display
    }
}

function lockApp() {
    window.POCKETSPLIT_AUTH.isUnlocked = false;
    showScreen('access-code-screen');
}


// 2. FINANCIAL ENGINE: ROUNDING & VALIDATION
function roundAmount(num) {
    return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

function validateSplitSubmission(expenseAmount, splitType, splitData) {
    const totalExpense = roundAmount(expenseAmount);
    
    if (splitType === 'percentage') {
        const totalPercent = splitData.reduce((sum, val) => sum + Number(val), 0);
        if (roundAmount(totalPercent) !== 100.00) {
            throw new Error("Percentages must exactly equal 100%");
        }
    } 
    else if (splitType === 'custom') {
        const totalCustom = splitData.reduce((sum, val) => sum + Number(val), 0);
        if (roundAmount(totalCustom) !== totalExpense) {
            throw new Error(`Custom shares (₹${totalCustom}) must equal the expense total (₹${totalExpense})`);
        }
    }
    return true;
}


// 3. SAFE IMPORT HANDLER
function handleImportSafe(jsonString) {
    try {
        const parsedData = JSON.parse(jsonString);
        
        // Schema verification
        if (!parsedData.expenses || !parsedData.people || !parsedData.categories) {
            throw new Error("Missing required data tables (expenses, people, categories).");
        }
        
        // Only overwrite AFTER validation succeeds
        localStorage.setItem('pocketsplit_data', JSON.stringify(parsedData));
        alert("Import successful. Reloading app.");
        window.location.reload();
        
    } catch (error) {
        alert("Unable to import this backup. The file format is invalid and your existing data was not changed.");
        console.error("Import failed:", error.message);
    }
}


// 4. DOUBLE SUBMISSION PREVENTION & DATE FIX
function bindSafeSubmit(formId, processFunction) {
    const form = document.getElementById(formId);
    if (!form) return;
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        if (btn) {
            btn.disabled = true;
            btn.dataset.originalText = btn.textContent;
            btn.textContent = 'Saving...';
        }
        
        try {
            processFunction();
        } finally {
            if (btn) {
                setTimeout(() => { 
                    btn.disabled = false; 
                    btn.textContent = btn.dataset.originalText; 
                }, 500);
            }
        }
    });
}

function getLocalDate(dateString) {
    // Prevents timezone shift (e.g., UTC -> IST date boundary bug)
    // Input format: "2026-09-01"
    const parts = dateString.split('-');
    if (parts.length === 3) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date(dateString); // fallback
}

// 5. DEPENDENCY DELETION CHECK (Prevents breaking historical expenses)
function canDeleteEntity(entityId, entityType, allExpenses) {
    // entityType: 'person' or 'category'
    for (let i = 0; i < allExpenses.length; i++) {
        const exp = allExpenses[i];
        if (entityType === 'category' && exp.categoryId === entityId) {
            return false;
        }
        if (entityType === 'person') {
            if (exp.paidBy === entityId || (exp.splitData && exp.splitData.some(s => s.personId === entityId))) {
                return false;
            }
        }
    }
    return true;
}
