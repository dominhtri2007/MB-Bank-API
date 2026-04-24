const scannerStatus = document.getElementById("scanner-status");
const lastRefresh = document.getElementById("last-refresh");
const defaultAccount = document.getElementById("default-account");
const accountSelect = document.getElementById("account-select");
const accountInput = document.getElementById("account-input");
const loadButton = document.getElementById("load-button");
const keywordInput = document.getElementById("keyword-input");
const transactionsBody = document.getElementById("transactions-body");
const apiPreview = document.getElementById("api-preview");
const tableTitle = document.getElementById("table-title");
const errorBox = document.getElementById("error-box");
const summaryCount = document.getElementById("summary-count");
const summaryIn = document.getElementById("summary-in");
const summaryOut = document.getElementById("summary-out");

let selectedAccount = "";
let allTransactions = [];

function formatNumber(value) {
    const numeric = Number(value || 0);
    return new Intl.NumberFormat("vi-VN").format(numeric);
}

function formatDate(value) {
    if (!value) return "-";
    return value;
}

function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
}

function clearError() {
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
}

function buildRow(transaction) {
    const typeClass = transaction.direction === "in" ? "type-in" : "type-out";
    const beneficiary = transaction.benAccountName || transaction.benAccountNo || transaction.beneficiaryAccount || "-";
    const description = transaction.description || transaction.addDescription || "-";

    return `
        <tr>
            <td>${formatDate(transaction.transactionDate)}</td>
            <td><span class="type-badge ${typeClass}">${transaction.direction}</span></td>
            <td class="mono">${formatNumber(transaction.amount)}</td>
            <td class="description-cell">${description}</td>
            <td>${transaction.bankName || "-"}</td>
            <td>${beneficiary}</td>
            <td class="mono">${transaction.refNo || "-"}</td>
        </tr>
    `;
}

function renderTransactions() {
    const keyword = keywordInput.value.trim().toLowerCase();
    const filtered = allTransactions.filter((transaction) => {
        if (!keyword) return true;
        const text = [
            transaction.description,
            transaction.addDescription,
            transaction.refNo,
            transaction.bankName,
            transaction.benAccountName,
            transaction.benAccountNo,
            transaction.beneficiaryAccount,
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return text.includes(keyword);
    });

    let totalIn = 0;
    let totalOut = 0;
    for (const transaction of filtered) {
        if (transaction.direction === "in") {
            totalIn += Number(transaction.amount || 0);
        } else {
            totalOut += Number(transaction.amount || 0);
        }
    }

    summaryCount.textContent = String(filtered.length);
    summaryIn.textContent = formatNumber(totalIn);
    summaryOut.textContent = formatNumber(totalOut);

    transactionsBody.innerHTML = filtered.map(buildRow).join("") || `
        <tr>
            <td colspan="7">Khong co giao dich phu hop.</td>
        </tr>
    `;
}

async function loadAccounts() {
    const response = await fetch("/api/accounts");
    const payload = await response.json();

    scannerStatus.textContent = payload.running ? "Running" : "Stopped";
    lastRefresh.textContent = payload.last_refresh || "-";
    defaultAccount.textContent = payload.default_account || "-";
    if (payload.last_error) {
        showError(payload.last_error);
    }

    accountSelect.innerHTML = "";
    for (const account of payload.accounts) {
        const option = document.createElement("option");
        option.value = account.acctNo;
        option.textContent = `${account.acctNo} | ${account.acctAlias || account.acctNm || "No alias"}`;
        accountSelect.appendChild(option);
    }

    if (!selectedAccount) {
        selectedAccount = payload.default_account || (payload.accounts[0] && payload.accounts[0].acctNo) || "";
    }

    if (selectedAccount) {
        accountSelect.value = selectedAccount;
        accountInput.value = selectedAccount;
    }
}

async function loadTransactions() {
    if (!selectedAccount) return;

    const query = encodeURIComponent(selectedAccount);
    apiPreview.textContent = `/api/bank?${selectedAccount}`;
    tableTitle.textContent = `Transactions for ${selectedAccount}`;

    const response = await fetch(`/api/bank?${query}`);
    const payload = await response.json();

    if (!response.ok) {
        throw new Error(payload.detail || "Khong the tai giao dich");
    }

    scannerStatus.textContent = payload.scanner_running ? "Running" : "Stopped";
    lastRefresh.textContent = payload.last_refresh || "-";
    defaultAccount.textContent = payload.default_account || "-";
    if (payload.last_error) {
        showError(payload.last_error);
    }

    allTransactions = payload.transactions || [];
    renderTransactions();
}

async function refreshData() {
    try {
        clearError();
        await loadAccounts();
        await loadTransactions();
    } catch (error) {
        showError(error.message);
    }
}

loadButton.addEventListener("click", async () => {
    const entered = accountInput.value.trim();
    selectedAccount = entered || accountSelect.value;
    await refreshData();
});

accountSelect.addEventListener("change", async (event) => {
    selectedAccount = event.target.value;
    accountInput.value = selectedAccount;
    await refreshData();
});

keywordInput.addEventListener("input", () => {
    renderTransactions();
});

refreshData();
setInterval(refreshData, 5000);
