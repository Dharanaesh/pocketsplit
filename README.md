# PocketSplit 💸

PocketSplit is a premium, lightweight, mobile-first web application designed to track personal expenses, manage budgets, and seamlessly handle group splits. Built entirely with vanilla web technologies, it functions as an installable Progressive Web App (PWA) that respects your privacy by keeping all financial data strictly on your device.

## ✨ Features

### 📊 Dashboard & Analytics
* **Spending Overview:** Instantly see your personal spending, total amounts paid, and money you are owed for the current month.
* **Monthly Budgeting:** Set a monthly budget and track your remaining balance in real-time.
* **Visual Analytics:** A dynamic, auto-calculating pie chart breaks down your monthly spending by category.

### 🧾 Expense Management
* **Smart Timeline:** Expenses are neatly grouped by their actual date (e.g., *TODAY*, *YESTERDAY*, *7 Sep 2026*).
* **Time-Based Sorting:** Newly added or recently edited expenses automatically bubble to the top of their respective date groups.
* **Strict Currency Formatting:** All amounts are cleanly formatted to standard Indian Rupee (INR) rules with forced two-decimal precision to prevent floating-point math errors.

### 🤝 Advanced Settlements (Group Workflow)
PocketSplit's settlement engine is specifically designed around real-world group workflows (like Google Pay group chats):
* **By Expense View:** Track settlements per expense rather than just per person. 
* **Group Request Tracking:** Mark a single "GPay Request" as *Sent* or *Not Sent* for the entire group bill.
* **Individual Statuses:** Expand any split expense to toggle individual participants as *Pending* or *Paid*.
* **Filter States:** Quickly filter your settlement dashboard by *Need Request*, *Request Sent*, *Partially Paid*, or *Settled*.
* **By Person View:** Switch to a summary tab to see exactly how much each specific friend owes you in total.
* **Split Math Engine:** Support for Equal splits, Percentage-based splits (must equal 100%), and Custom exact-amount splits.

### 🔒 Privacy & Security
* **100% Local Storage:** There is no backend or database. Your financial data never leaves your browser.
* **Cold-Start App Lock:** Configure an Access Code. The app enforces a strict in-memory authentication state—if the app is completely closed and reopened, it requires your PIN before exposing any financial data.

### 📱 Progressive Web App (PWA)
* **Installable:** Add PocketSplit directly to your Android/iOS home screen.
* **Offline Capable:** Powered by a robust Service Worker that caches assets locally, allowing you to log expenses even without an internet connection.
* **Mobile-First UI:** Optimized for one-handed use with a bottom navigation bar, floating action buttons, and responsive touch-friendly cards.

---

## 🚀 Getting Started

Because PocketSplit is a client-side only application, getting it running is incredibly simple.

### Prerequisites
* A modern web browser (Chrome, Safari, Firefox).
* Optional: A local web server for testing Service Workers (like VS Code Live Server or Python's `http.server`).

### Installation
1. Clone the repository:
   ```bash
   git clone [https://github.com/Dharanaesh/pocketsplit.git](https://github.com/Dharanaesh/pocketsplit.git)
