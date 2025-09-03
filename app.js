document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebaseConfig === 'undefined') {
        return alert('Erro crítico: A configuração do Firebase (firebase-config.js) não foi encontrada.');
    }

    // --- INICIALIZAÇÃO ---
    let unsubscribeFromTransactions = null;
    let authUIMode = 'login'; // 'login' ou 'signup'
    let monthlyChart = null;
    let isFirstDataLoad = true;
    let reportCategoryChart = null;
    let allTransactions = [];
    let reportBalanceChart = null;
    let lastFilteredTransactions = []; // For CSV export
    let userCategories = { income: [], expense: [] };
    let userBudgets = [];
    let userAccounts = [];
    let userGoals = [];
    let userInvestments = [];
    let userSettings = {};
    let isDraggableInitialized = false;
    let unsubscribeFromCategories, unsubscribeFromBudgets, unsubscribeFromGoals, unsubscribeFromAccounts, unsubscribeFromInvestments;
    let isSplitMode = false;
    let isSelectionModeActive = false;
    let selectedTransactionIds = new Set();
    let reportGrouping = 'day'; // 'day', 'week', 'month'
    const availableIcons = [
        'bx-store', 'bx-cart', 'bx-home-alt', 'bx-car', 'bx-health', 'bx-book-reader', 'bx-game', 'bx-camera-movie', 'bx-dollar-circle', 'bx-gift', 'bx-briefcase-alt-2', 'bx-bus', 'bx-restaurant', 'bx-wifi', 'bx-wallet', 'bx-credit-card', 'bx-football', 'bx-tshirt', 'bx-first-aid', 'bx-buildings', 'bx-plane-alt', 'bx-gas-pump', 'bx-money-withdraw', 'bx-receipt',
        'bx-flag' // Ícone para metas
    ];

    // --- ELEMENTOS DA UI ---
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    const loadingOverlay = document.getElementById('loading-overlay');

    // --- LÓGICA PRINCIPAL ---
    setupAuthListeners();
    auth.onAuthStateChanged(user => {
        if (user) {
            setupApp(user);
        } else {
            showLoginScreen();
        }
    });

    // --- SETUP DA TELA DE LOGIN ---
    function setupAuthListeners() {
        document.getElementById('login-google').onclick = async () => {
            try {
                const provider = new firebase.auth.GoogleAuthProvider();
                const result = await auth.signInWithPopup(provider);
                const idToken = await result.user.getIdToken();
                await loginWithServer(idToken);
            } catch (err) {
                showAuthError(getFriendlyAuthError(err));
            }
        };
        document.getElementById('auth-form').onsubmit = handleAuthFormSubmit;
    }

    function toggleAuthMode(mode) {
        hideAuthError();
        authUIMode = mode;
        const title = document.getElementById('form-title');
        const subtitle = document.getElementById('form-subtitle');
        const submitBtn = document.getElementById('auth-submit-btn');
        const confirmPassGroup = document.getElementById('confirm-password-group');
        const signupText = document.getElementById('signup-text');
        const loginText = document.getElementById('login-text');

        if (mode === 'signup') {
            title.textContent = 'Crie Sua Conta';
            subtitle.textContent = 'Comece a organizar suas finanças.';
            submitBtn.textContent = 'Criar Conta';
            confirmPassGroup.classList.remove('hidden');
            signupText.classList.add('hidden');
            loginText.classList.remove('hidden');
        } else {
            title.textContent = 'FINANCE JR';
            subtitle.textContent = 'Seu ecossistema financeiro.';
            submitBtn.textContent = 'Entrar';
            confirmPassGroup.classList.add('hidden');
            signupText.classList.remove('hidden');
            loginText.classList.add('hidden');
        }
    }

    async function handleAuthFormSubmit(e) {
        e.preventDefault();
        hideAuthError();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;

        try {
            if (authUIMode === 'login') {
                const userCredential = await auth.signInWithEmailAndPassword(email, password);
                const idToken = await userCredential.user.getIdToken();
                await loginWithServer(idToken);
            } else {
                const confirmPassword = document.getElementById('auth-confirm-password').value;
                if (password !== confirmPassword) {
                    return showAuthError('As senhas não conferem.');
                }
                if (password.length < 6) {
                    return showAuthError('A senha deve ter no mínimo 6 caracteres.');
                }
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                const idToken = await userCredential.user.getIdToken();
                await loginWithServer(idToken);
            }
        } catch (err) {
            showAuthError(getFriendlyAuthError(err));
        }
    }

    function showAuthError(message) {
        const errorDiv = document.getElementById('auth-error');
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }

    function hideAuthError() {
        document.getElementById('auth-error').classList.add('hidden');
    }

    // --- SETUP DO APP PÓS-LOGIN ---
    function setupApp(user) {
        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');

        setupAppEventListeners(user);

        listenToAllData(user);
        showPage('dashboard');
    }

    function showLoginScreen() {
        if (unsubscribeFromTransactions) unsubscribeFromTransactions();
        if (unsubscribeFromCategories) unsubscribeFromCategories();
        if (unsubscribeFromBudgets) unsubscribeFromBudgets();
        if (unsubscribeFromGoals) unsubscribeFromGoals();
        if (unsubscribeFromAccounts) unsubscribeFromAccounts();
        if (unsubscribeFromInvestments) unsubscribeFromInvestments();

        isFirstDataLoad = true;
        isDraggableInitialized = false;
        appContainer.classList.add('hidden');
        loginContainer.classList.remove('hidden');
        hideLoader();

        document.getElementById('signup-link').onclick = (e) => { e.preventDefault(); toggleAuthMode('signup'); };
        document.getElementById('login-link').onclick = (e) => { e.preventDefault(); toggleAuthMode('login'); };
    }

    function setupAppEventListeners(user) {
        document.getElementById('logout-button').onclick = () => auth.signOut();

        const toggleSidebar = () => body.classList.toggle('sidebar-open');
        document.getElementById('menu-toggle-btn').onclick = toggleSidebar;
        document.getElementById('sidebar-close-btn').onclick = toggleSidebar;
        document.getElementById('mobile-overlay').onclick = toggleSidebar;

        const firstName = user.displayName || user.email.split('@')[0];
        document.getElementById('user-greeting').textContent = `Olá, ${firstName}!`;
        if (user.photoURL) document.getElementById('user-avatar').src = user.photoURL;

        document.getElementById('app-container').addEventListener('click', (e) => {
            const target = e.target;
            const targetId = target.id;

            const navLink = target.closest('.nav-link');
            if (navLink) {
                e.preventDefault();
                showPage(navLink.dataset.page);
                if (window.innerWidth <= 992) body.classList.remove('sidebar-open');
                return;
            }

            const actionHandlers = {
                'add-income-btn': () => openModal('income'),
                'add-expense-btn': () => openModal('expense'),
                'add-transfer-btn': () => openTransferModal(),
                'add-category-btn': () => openCategoryModal(),
                'add-budget-btn': () => openBudgetModal(),
                'add-investment-btn': () => openInvestmentModal(),
                'add-account-btn': () => openAccountModal(),
                'add-goal-btn': () => openGoalModal(),
                'select-transactions-btn': toggleSelectionMode,
                'cancel-selection-btn': toggleSelectionMode,
                'bulk-delete-btn': handleBulkDelete,
                'export-csv-btn': exportReportToCSV,
                'split-transaction-btn': toggleSplitMode,
                'add-split-btn': () => addSplitRow(),
            };

            if (actionHandlers[targetId]) {
                actionHandlers[targetId]();
                return;
            }

            const modalCancelMap = {
                'cancel-transaction-btn': 'transaction-modal', 'transaction-modal': 'transaction-modal',
                'cancel-transfer-btn': 'transfer-modal', 'transfer-modal': 'transfer-modal',
                'cancel-category-btn': 'category-modal', 'category-modal': 'category-modal',
                'cancel-budget-btn': 'budget-modal', 'budget-modal': 'budget-modal',
                'cancel-investment-btn': 'investment-modal', 'investment-modal': 'investment-modal',
                'cancel-account-btn': 'account-modal', 'account-modal': 'account-modal',
                'cancel-goal-btn': 'goal-modal', 'goal-modal': 'goal-modal',
                'cancel-contribution-btn': 'contribution-modal', 'contribution-modal': 'contribution-modal',
            };

            if (modalCancelMap[targetId]) {
                if (target.classList.contains('modal-overlay') && target.id === modalCancelMap[targetId]) {
                    document.getElementById(modalCancelMap[targetId]).classList.add('hidden');
                } else if (target.id.startsWith('cancel-')) {
                    document.getElementById(modalCancelMap[targetId]).classList.add('hidden');
                }
                return;
            }
        });

        document.getElementById('transaction-form').onsubmit = (e) => { e.preventDefault(); saveTransaction(user.uid); };
        document.getElementById('transfer-form').onsubmit = (e) => { e.preventDefault(); saveTransfer(user.uid); };
        document.getElementById('category-form').onsubmit = (e) => { e.preventDefault(); saveCategory(user.uid); };
        document.getElementById('budget-form').onsubmit = (e) => { e.preventDefault(); saveBudget(user.uid); };
        document.getElementById('investment-form').onsubmit = (e) => { e.preventDefault(); saveInvestment(user.uid); };
        document.getElementById('account-form').onsubmit = (e) => { e.preventDefault(); saveAccount(user.uid); };
        document.getElementById('goal-form').onsubmit = (e) => { e.preventDefault(); saveGoal(user.uid); };
        document.getElementById('contribution-form').onsubmit = (e) => { e.preventDefault(); saveContribution(user.uid); };

        document.getElementById('main-page-content').addEventListener('input', (e) => {
            if (e.target.id === 'search-filter') applyFiltersAndRender();
            if (e.target.id === 'transaction-amount') updateSplitSummary();
        });
        document.getElementById('main-page-content').addEventListener('change', (e) => {
            const changeHandlers = {
                'category-filter': applyFiltersAndRender,
                'tag-filter': applyFiltersAndRender,
                'type-filter': applyFiltersAndRender,
                'report-start-date': generateReport,
                'report-end-date': generateReport,
                'report-type-filter': generateReport,
                'report-category-filter': generateReport,
            };
            if (changeHandlers[e.target.id]) changeHandlers[e.target.id]();
        });
    }

    async function showPage(pageId) {
        document.querySelectorAll('.nav-link').forEach(link => link.parentElement.classList.remove('active'));
        const activeLink = document.querySelector(`.nav-link[data-page="${pageId}"]`);
        activeLink.parentElement.classList.add('active');
        document.getElementById('page-title').textContent = activeLink.querySelector('span').textContent;
 
        await loadPageContent(pageId);
    }

    async function loadPageContent(pageId) {
        const contentContainer = document.getElementById('main-page-content');
        try {
            const response = await fetch(`pages/${pageId}.html`);
            if (!response.ok) throw new Error(`Página não encontrada: ${pageId}.html`);
            contentContainer.innerHTML = await response.text();

            const user = auth.currentUser;
            if (!user) return; 
 
            const pageInitializers = {
                'dashboard': updateDashboardMetrics,
                'lancamentos': applyFiltersAndRender,
                'relatorios': initializeReportsPage,
                'orcamentos': renderBudgetsPage,
                'categorias': renderCategoriesPage,
                'contas': renderAccountsPage,
                'metas': renderGoalsPage,
                'investimentos': renderInvestmentsPage,
            };

            if (pageInitializers[pageId]) {
                pageInitializers[pageId]();
            }

            document.querySelectorAll('.group-btn').forEach(btn => btn.onclick = handleReportGrouping);

        } catch (error) {
            console.error('Erro ao carregar página:', error);
            contentContainer.innerHTML = `<div class="content-card"><p>Erro ao carregar o conteúdo da página. Tente novamente.</p></div>`;
        }
    }

    function handleReportGrouping(e) {
        const btn = e.currentTarget;
        document.querySelector('.group-btn.active')?.classList.remove('active');
        btn.classList.add('active');
        reportGrouping = btn.dataset.group;
        generateReport();
    }

    function openModal(type, transaction = null) {
        const form = document.getElementById('transaction-form');
        form.reset();
        const modal = document.getElementById('transaction-modal');
        const title = document.getElementById('modal-title');
        const idInput = document.getElementById('transaction-id');
        const typeInput = document.getElementById('transaction-type');
        const categorySelect = document.getElementById('transaction-category');

        const accountSelect = document.getElementById('transaction-account');
        accountSelect.innerHTML = `<option value="" disabled selected>Selecione a conta</option>`;
        userAccounts.forEach(acc => {
            const option = document.createElement('option');
            option.value = acc.id;
            option.textContent = acc.name;
            accountSelect.appendChild(option);
        });

        const transactionType = transaction ? transaction.type : type;

        categorySelect.innerHTML = `<option value="" disabled selected>Selecione a categoria</option>`;
        const categories = userCategories[transactionType] || [];
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.name;
            option.textContent = cat.name;
            categorySelect.appendChild(option);
        });

        if (transaction) {
            title.textContent = 'Editar Lançamento';
            idInput.value = transaction.id;
            typeInput.value = transaction.type;
            document.getElementById('transaction-description').value = transaction.description;
            document.getElementById('transaction-amount').value = transaction.amount;
            document.getElementById('transaction-date').value = transaction.date;
            document.getElementById('transaction-tags').value = transaction.tags ? transaction.tags.join(', ') : '';
            accountSelect.value = transaction.accountId;

            if (transaction.isSplit) {
                toggleSplitMode(true);
                transaction.splits.forEach(split => addSplitRow(split));
                updateSplitSummary();
            } else {
                categorySelect.value = transaction.category;
            }

        } else {
            title.textContent = type === 'income' ? 'Adicionar Receita' : 'Adicionar Despesa';
            idInput.value = '';
            typeInput.value = type;
        }

        modal.classList.remove('hidden');
    }

    function closeModal() {
        document.getElementById('transaction-modal').classList.add('hidden');
        if (isSplitMode) {
            toggleSplitMode(true);
        }
    }

    async function saveTransaction(userId, extraData = {}) {
        if (!userId) {
            return showToast('Sua sessão expirou. Por favor, faça login novamente.', 'error');
        }

        const transactionId = document.getElementById('transaction-id').value;
        const type = document.getElementById('transaction-type').value;
        const description = document.getElementById('transaction-description').value;
        const amount = parseFloat(document.getElementById('transaction-amount').value);
        const date = document.getElementById('transaction-date').value;
        const category = document.getElementById('transaction-category').value;
        const accountId = document.getElementById('transaction-account').value;
        const tags = document.getElementById('transaction-tags').value.split(',').map(tag => tag.trim()).filter(Boolean);

        const transactionData = {
            userId: userId,
            type: type,
            description: description,
            amount: amount,
            date: date,
            accountId: accountId,
            tags: tags,
            ...extraData
        };

        if (isSplitMode) {
            const splitResult = getSplitData();
            if (splitResult.error) return showToast(splitResult.error, 'error');
            transactionData.isSplit = true;
            transactionData.splits = splitResult.splits;
        } else {
            transactionData.category = category;
        }

        if (!description || !amount || !date || amount <= 0 || (!transactionData.category && !transactionData.isSplit) || !accountId) {
            return showToast('Preencha todos os campos para salvar.', 'error');
        }

        const success = await saveData('transactions', transactionData, transactionId, 'save-transaction-btn');

        if (success) {
            closeModal();
        }
    }

    function deleteTransaction(transactionId) {
        if (confirm('Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.')) {
            db.collection('transactions').doc(transactionId).delete()
                .then(() => showToast('Lançamento excluído com sucesso!'))
                .catch(err => {
                    console.error('Erro ao excluir lançamento:', err);
                    showToast('Erro ao excluir lançamento.', 'error');
                });
        }
    }

    function toggleSplitMode(forceOff = false) {
        isSplitMode = forceOff ? false : !isSplitMode;

        document.getElementById('split-container').classList.toggle('hidden', !isSplitMode);
        document.getElementById('transaction-category').parentElement.classList.toggle('hidden', isSplitMode);
        document.getElementById('split-transaction-btn').innerHTML = isSplitMode ? "<i class='bx bx-git-commit'></i> Lançamento Simples" : "<i class='bx bx-git-commit'></i> Dividir Lançamento";

        const splitList = document.getElementById('split-list');
        if (isSplitMode && splitList.children.length === 0) {
            addSplitRow();
            addSplitRow();
        } else if (!isSplitMode) {
            splitList.innerHTML = '';
        }
        updateSplitSummary();
    }

    function addSplitRow(split = null) {
        const splitList = document.getElementById('split-list');
        const newRow = document.createElement('div');
        newRow.className = 'split-entry';

        const transactionType = document.getElementById('transaction-type').value;
        const categories = userCategories[transactionType] || [];
        const categoryOptions = categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

        newRow.innerHTML = `
            <div class="input-group">
                <i class="bx bx-category"></i>
                <select class="split-category">${categoryOptions}</select>
            </div>
            <div class="input-group">
                <i class="bx bx-dollar"></i>
                <input type="number" class="split-amount" placeholder="Valor" step="0.01" min="0.01">
            </div>
            <button type="button" class="action-btn delete" title="Remover"><i class="bx bxs-trash"></i></button>
        `;

        if (split) {
            newRow.querySelector('.split-category').value = split.category;
            newRow.querySelector('.split-amount').value = split.amount;
        }

        newRow.querySelector('.delete').onclick = () => { newRow.remove(); updateSplitSummary(); };
        newRow.querySelectorAll('input, select').forEach(el => el.addEventListener('input', updateSplitSummary));
        splitList.appendChild(newRow);
    }

    function updateSplitSummary() {
        if (!isSplitMode) {
            document.getElementById('split-summary').innerHTML = '';
            return;
        }
        const totalAmount = parseFloat(document.getElementById('transaction-amount').value) || 0;
        let splitTotal = 0;
        document.querySelectorAll('.split-amount').forEach(input => {
            splitTotal += parseFloat(input.value) || 0;
        });

        const remaining = totalAmount - splitTotal;
        const summaryEl = document.getElementById('split-summary');
        summaryEl.innerHTML = `
            <span>Total Dividido: R$ ${splitTotal.toFixed(2).replace('.',',')}</span> | 
            <span class="remaining ${remaining < 0 ? 'negative' : (remaining > 0 ? 'positive' : '')}">
                Restante: R$ ${remaining.toFixed(2).replace('.',',')}
            </span>
        `;
    }

    function getSplitData() {
        const totalAmount = parseFloat(document.getElementById('transaction-amount').value) || 0;
        const splits = [];
        let splitTotal = 0;

        document.querySelectorAll('.split-entry').forEach(row => {
            const category = row.querySelector('.split-category').value;
            const amount = parseFloat(row.querySelector('.split-amount').value);
            if (category && amount > 0) {
                splits.push({ category, amount });
                splitTotal += amount;
            }
        });

        if (splits.length === 0) return { error: 'Adicione pelo menos uma divisão válida.' };
        if (Math.abs(totalAmount - splitTotal) > 0.001) return { error: 'A soma das divisões deve ser igual ao valor total.' };
        return { splits };
    }

    function toggleSelectionMode() {
        isSelectionModeActive = !isSelectionModeActive;
        const bulkActionBar = document.getElementById('bulk-action-bar');

        if (isSelectionModeActive) {
            bulkActionBar.classList.remove('hidden');
            setTimeout(() => bulkActionBar.classList.add('visible'), 10);
        } else {
            bulkActionBar.classList.remove('visible');
            setTimeout(() => bulkActionBar.classList.add('hidden'), 300);
        }

        selectedTransactionIds.clear();
        updateSelectionCount();
        renderAllTransactions(lastFilteredTransactions);
    }

    function updateSelectionCount() {
        document.getElementById('selection-count').textContent = `${selectedTransactionIds.size} itens selecionados`;
    }

    async function handleBulkDelete() {
        const idsToDelete = Array.from(selectedTransactionIds);
        if (idsToDelete.length === 0) {
            return showToast('Nenhum item selecionado.', 'error');
        }

        if (confirm(`Tem certeza que deseja excluir os ${idsToDelete.length} lançamentos selecionados?`)) {
            const batch = db.batch();
            idsToDelete.forEach(id => {
                const docRef = db.collection('transactions').doc(id);
                batch.delete(docRef);
            });
            await batch.commit();
            showToast(`${idsToDelete.length} lançamentos excluídos com sucesso.`);
            toggleSelectionMode();
        }
    }

    async function listenToAllData(user) {
        try {
            await Promise.all([
                listenForCategories(user),
                listenForBudgets(user),
                listenForAccounts(user),
                listenForGoals(user),
                listenForInvestments(user)
            ]);

            unsubscribeFromTransactions = db.collection('transactions').where('userId', '==', user.uid).orderBy('date', 'desc')
                .onSnapshot(snapshot => {
                    allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    applyFiltersAndRender();
                    updateDashboardMetrics();
                    populateFilters();
                    if (isFirstDataLoad) {
                        loadAndApplyUserSettings(user);
                        hideLoader();
                        isFirstDataLoad = false;
                    }
                }, error => {
                    console.error("Erro ao carregar transações do Firestore:", error);
                    showToast('Não foi possível carregar os lançamentos. Verifique o console.', 'error');
                });
        } catch (error) {
            console.error("Erro ao carregar dados iniciais:", error);
            showToast('Não foi possível carregar os dados iniciais. Tente recarregar a página.', 'error');
        }
    }

    function populateFilters() {
        const allUserCategories = [...userCategories.income, ...userCategories.expense]
            .map(c => c.name)
            .sort();

        const allTags = [...new Set(allTransactions.flatMap(tx => tx.tags || []))].sort();

        const populateSelect = (selectElementId, options, defaultOptionText) => {
            const selectElement = document.getElementById(selectElementId);
            if (!selectElement) return;

            const currentVal = selectElement.value;
            selectElement.innerHTML = `<option value="all">${defaultOptionText}</option>`;
            options.forEach(opt => {
                if (opt) {
                    const option = document.createElement('option');
                    option.value = opt;
                    option.textContent = opt;
                    selectElement.appendChild(option);
                }
            });
            if (Array.from(selectElement.options).some(opt => opt.value === currentVal)) {
                selectElement.value = currentVal;
            }
        };

        populateSelect('category-filter', allUserCategories, 'Todas as Categorias');
        populateSelect('report-category-filter', allUserCategories, 'Todas as Categorias');
        populateSelect('tag-filter', allTags, 'Todas as Tags');
    }

    function applyFiltersAndRender() {
        // Verifica se os filtros existem na página atual antes de prosseguir.
        const searchFilterElement = document.getElementById('search-filter');
        if (!searchFilterElement) return;

        const searchTerm = document.getElementById('search-filter').value.toLowerCase();
        const category = document.getElementById('category-filter').value;
        const tag = document.getElementById('tag-filter').value;
        const type = document.getElementById('type-filter').value;

        const filteredTransactions = allTransactions.filter(tx => {
            const searchMatch = tx.description.toLowerCase().includes(searchTerm);
            const categoryMatch = (category === 'all') || (tx.category === category);
            const tagMatch = (tag === 'all') || (tx.tags && tx.tags.includes(tag));
            const typeMatch = (type === 'all') || (tx.type === type);
            return searchMatch && categoryMatch && tagMatch && typeMatch;
        });

        lastFilteredTransactions = filteredTransactions;

        renderAllTransactions(filteredTransactions);
    }

    function renderDashboardTransactions(transactions) {
        renderTransactionList(document.getElementById('dashboard-transactions-list'), transactions, "Nenhuma transação recente.", false);
    }

    function renderAllTransactions(transactions) {
        renderTransactionList(document.getElementById('all-transactions-list'), transactions, "Nenhuma transação registrada.", true);
    }

    function renderTransactionList(element, transactions, emptyMessage, showActions) {
        if (!element) return;
        element.innerHTML = '';
        if (transactions.length === 0) {
            element.innerHTML = `<li class="empty-state"><p>${emptyMessage}</p></li>`;
            return;
        }

        transactions.forEach(tx => {
            const item = document.createElement('li');
            const isIncome = tx.type === 'income';
            const category = userCategories[tx.type].find(c => c.name === tx.category);
            const iconClass = category && category.icon ? category.icon : (isIncome ? 'bx-trending-up' : 'bx-trending-down');
            const isSplit = tx.isSplit;
            const isTransfer = tx.category === 'Transferência';
            const finalIconClass = isTransfer ? 'bx-transfer' : iconClass;

            const isAllTransactionsList = element.id === 'all-transactions-list';
            const canSelect = isSelectionModeActive && isAllTransactionsList;

            const canShowActions = showActions && !canSelect && !isTransfer && !isSplit;
            const actionsHTML = canShowActions ? `
                <div class="transaction-actions">
                    <button class="action-btn edit" title="Editar"><i class='bx bxs-edit-alt'></i></button>
                    <button class="action-btn delete" title="Excluir"><i class='bx bxs-trash'></i></button>
                </div>
            ` : '';

            const categoryTag = tx.category && !isSplit ? `<span class="category ${isTransfer ? 'transfer-tag' : ''}">${tx.category}</span>` : '';
            const splitTag = isSplit ? `<span class="category split-tag">Dividido</span>` : '';
            const tagsHTML = tx.tags && tx.tags.length > 0 ? tx.tags.map(tag => `<span class="tag">${tag}</span>`).join('') : '';

            item.innerHTML = `
                <div class="transaction-item">
                <div class="transaction-icon-container">
                    <i class='bx ${finalIconClass}'></i>
                    <input type="checkbox" class="transaction-checkbox" data-id="${tx.id}">
                </div>
                    <div class="transaction-details">
                        <div class="d-flex align-items-center">
                            <span>${tx.description}</span>
                            ${categoryTag}${splitTag}${tagsHTML}
                        </div>
                        <small>${new Date(tx.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</small>
                    </div>
                </div>
                <div class="d-flex align-items-center">
                    <span class="transaction-amount ${isIncome ? 'income' : 'expense'}">
                        ${isIncome ? '+' : '-'} R$ ${tx.amount.toFixed(2).replace('.',',')}
                    </span>
                    ${actionsHTML}
                </div>
            `;

            if (canSelect) {
                item.classList.add('selection-mode');
                const checkbox = item.querySelector('.transaction-checkbox');
            
                if (selectedTransactionIds.has(tx.id)) {
                    item.classList.add('selected');
                    checkbox.checked = true;
                }

                item.addEventListener('click', (e) => {
                    if (e.target.closest('.transaction-actions')) return;

                    if (e.target !== checkbox) {
                        checkbox.checked = !checkbox.checked;
                    }
                
                    if (checkbox.checked) {
                        selectedTransactionIds.add(tx.id);
                        item.classList.add('selected');
                    } else {
                        selectedTransactionIds.delete(tx.id);
                        item.classList.remove('selected');
                    }
                    updateSelectionCount();
                });
            }

            element.appendChild(item);

            if (canShowActions) {
                item.querySelector('.edit').addEventListener('click', () => openModal(null, tx));
                item.querySelector('.delete').addEventListener('click', () => deleteTransaction(tx.id));
            }
        });
    }

    function updateDashboardMetrics() {
        if (!userAccounts.length) return;
        let totalFromAccounts = 0;

        const accountsWithDetails = userAccounts.map(account => {
            if (account.accountType === 'credit-card') {
                const invoice = calculateOpenInvoice(account, allTransactions);
                totalFromAccounts -= invoice.amount;
                return { ...account, ...invoice };
            }
            const balanceChange = allTransactions
                .filter(tx => tx.accountId === account.id)
                .reduce((sum, tx) => sum + (tx.type === 'income' ? tx.amount : -tx.amount), 0);
            const currentBalance = (account.initialBalance || 0) + balanceChange;
            totalFromAccounts += currentBalance;
            return { ...account, currentBalance };
        });

        const totalFromInvestments = userInvestments.reduce((sum, inv) => sum + (inv.amount || 0), 0);
        const totalPatrimony = totalFromAccounts + totalFromInvestments;

        const balanceEl = document.getElementById('balance');
        if (balanceEl) balanceEl.textContent = `R$ ${totalPatrimony.toFixed(2).replace('.',',')}`;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const monthlySummary = allTransactions.reduce((acc, tx) => {
            const [year, month] = tx.date.split('-').map(Number);
            if (year === currentYear && (month - 1) === currentMonth) {
                if (tx.type === 'income') {
                    acc.monthlyIncome += tx.amount;
                } else {
                    acc.monthlyExpense += tx.amount;
                }
            }
            return acc;
        }, { monthlyIncome: 0, monthlyExpense: 0 });

        const monthlyIncomeEl = document.getElementById('monthly-income');
        const monthlyExpenseEl = document.getElementById('monthly-expense');
        if (monthlyIncomeEl) monthlyIncomeEl.textContent = `R$ ${monthlySummary.monthlyIncome.toFixed(2).replace('.',',')}`;
        if (monthlyExpenseEl) monthlyExpenseEl.textContent = `R$ ${monthlySummary.monthlyExpense.toFixed(2).replace('.',',')}`;

        renderDashboardTransactions(allTransactions.slice(0, 5));
        renderAccountsOnDashboard(accountsWithDetails);
        renderBudgetsOnDashboard(allTransactions, userBudgets);
        renderGoalsOnDashboard(userGoals);
        updateChart(monthlySummary.monthlyIncome, monthlySummary.monthlyExpense);
    }

    function getExpandedTransactionsForCategories(transactions) {
        const expanded = [];
        transactions.forEach(tx => {
            if (tx.isSplit) {
                tx.splits.forEach(split => {
                    expanded.push({
                        ...tx,
                        category: split.category,
                        amount: split.amount,
                    });
                });
            } else {
                expanded.push(tx);
            }
        });
        return expanded;
    }

    function listenForCategories(user) {
        return new Promise((resolve, reject) => {
            unsubscribeFromCategories = db.collection('categories').where('userId', '==', user.uid)
                .onSnapshot(async (snapshot) => {
                    if (snapshot.empty && user) {
                        await createDefaultCategories(user.uid);
                    } else {
                        userCategories = { income: [], expense: [] };
                        snapshot.docs.forEach(doc => {
                            const category = { id: doc.id, ...doc.data() };
                            if (userCategories[category.type]) {
                                userCategories[category.type].push(category);
                            }
                        });
                        userCategories.income.sort((a, b) => a.name.localeCompare(b.name));
                        userCategories.expense.sort((a, b) => a.name.localeCompare(b.name));
                        renderCategoriesPage();
                        populateFilters();
                    }
                    resolve();
                }, err => {
                    console.error("Erro ao carregar categorias:", err);
                    showToast('Não foi possível carregar as categorias.', 'error');
                    reject(err);
                });
        });
    }

    async function createDefaultCategories(userId) {
        const defaultCats = {
            income: [{name: 'Salário'}, {name: 'Freelance'}, {name: 'Investimentos'}, {name: 'Vendas'}, {name: 'Outras Receitas'}],
            expense: [{name: 'Alimentação'}, {name: 'Moradia'}, {name: 'Transporte'}, {name: 'Saúde'}, {name: 'Educação'}, {name: 'Lazer'}, {name: 'Assinaturas'}, {name: 'Compras'}, {name: 'Impostos'}, {name: 'Outras Despesas'},
                      {name: 'Metas', icon: 'bx-flag'}]
        };
        const batch = db.batch();
        Object.keys(defaultCats).forEach(type => {
            defaultCats[type].forEach(cat => {
                const ref = db.collection('categories').doc();
                batch.set(ref, { userId, name: cat.name, type, icon: cat.icon || '' });
            });
        });
        await batch.commit();
    }

    function renderCategoriesPage() {
        const renderCategoryItem = (cat) => {
            const iconHTML = cat.icon ? `<i class='bx ${cat.icon} list-item-icon'></i>` : '';
            const element = document.createElement('li');
            element.innerHTML = `
                <div class="d-flex align-items-center">${iconHTML}<span>${cat.name}</span></div>
                <div class="transaction-actions actions-always-visible">
                    <button class="action-btn edit" title="Editar"><i class='bx bxs-edit-alt'></i></button>
                    <button class="action-btn delete" title="Excluir"><i class='bx bxs-trash'></i></button>
                </div>`;
            element.querySelector('.edit').onclick = () => openCategoryModal(cat);
            element.querySelector('.delete').onclick = () => deleteCategory(cat.id);
            return element;
        };

        renderList({ element: document.getElementById('income-categories-list'), items: userCategories.income, renderItem: renderCategoryItem, emptyMessage: 'Nenhuma categoria de receita.' });
        renderList({ element: document.getElementById('expense-categories-list'), items: userCategories.expense, renderItem: renderCategoryItem, emptyMessage: 'Nenhuma categoria de despesa.' });
    }

    function openCategoryModal(category = null) {
        const modal = document.getElementById('category-modal');
        const form = document.getElementById('category-form');
        form.reset();
        document.getElementById('category-modal-title').textContent = category ? 'Editar Categoria' : 'Nova Categoria';        
        document.getElementById('category-id').value = category?.id || '';
        document.getElementById('category-icon-input').value = category?.icon || '';
        if (category) {
            document.getElementById('category-name').value = category.name;
            document.getElementById('category-type').value = category.type;
        }
        renderIconPicker(category ? category.icon : null);
        modal.classList.remove('hidden');
    }

    function renderIconPicker(selectedIcon) {
        const picker = document.getElementById('icon-picker');
        const iconInput = document.getElementById('category-icon-input');
        picker.innerHTML = '';

        availableIcons.forEach(iconClass => {
            const item = document.createElement('div');
            item.className = 'icon-picker-item';
            if (iconClass === selectedIcon) {
                item.classList.add('selected');
            }
            item.innerHTML = `<i class='bx ${iconClass}'></i>`;
            item.onclick = () => {
                const currentSelected = picker.querySelector('.selected');
                if (currentSelected) {
                    currentSelected.classList.remove('selected');
                }
                item.classList.add('selected');
                iconInput.value = iconClass;
            };
            picker.appendChild(item);
        });
    }

    async function saveCategory(userId) {
        const id = document.getElementById('category-id').value;
        const name = document.getElementById('category-name').value.trim();
        const type = document.getElementById('category-type').value;
        const icon = document.getElementById('category-icon-input').value;
        if (!name) return showToast('O nome da categoria é obrigatório.', 'error');

        if (!id) {
            const existingCategory = userCategories[type].find(cat => cat.name.toLowerCase() === name.toLowerCase());
            if (existingCategory) {
                return showToast(`A categoria "${name}" já existe.`, 'error');
            }
        }

        const data = { userId, name, type, icon };
        const success = await saveData('categories', data, id, 'save-category-btn');

        if (success) {
            document.getElementById('category-modal').classList.add('hidden');
        }
    }

    function deleteCategory(id) {
        if (confirm('Tem certeza? Excluir uma categoria não afeta os lançamentos já existentes.')) {
            db.collection('categories').doc(id).delete()
              .then(() => showToast('Categoria excluída.'))
              .catch(err => showToast('Erro ao excluir categoria.', 'error'));
        }
    }

    function listenForBudgets(user) {
        const now = new Date();
        const monthId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        return new Promise((resolve, reject) => {
            unsubscribeFromBudgets = db.collection('budgets').where('userId', '==', user.uid).where('month', '==', monthId)
                .onSnapshot(snapshot => {
                    userBudgets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    renderBudgetsPage();
                    renderBudgetsOnDashboard(allTransactions, userBudgets);
                    resolve();
                }, err => {
                    console.error("Erro ao carregar orçamentos:", err);
                    showToast('Não foi possível carregar os orçamentos.', 'error');
                    reject(err);
                });
        });
    }

    function renderBudgetsOnDashboard(transactions, budgets) {
        const list = document.getElementById('dashboard-budgets-list');
        if (!list) return;
        list.innerHTML = '';
        if (budgets.length === 0) {
            list.innerHTML = `<li class="empty-state"><p>Nenhum orçamento definido para este mês.</p></li>`;
            return;
        }

        const now = new Date();
        const allTxThisMonth = transactions.filter(tx => {
            const [year, month] = tx.date.split('-').map(Number);
            return year === now.getFullYear() && (month - 1) === now.getMonth();
        });
        const expensesThisMonth = getExpandedTransactionsForCategories(allTxThisMonth)
            .filter(tx => tx.type === 'expense');

        budgets.forEach(budget => {
            const spent = expensesThisMonth
                .filter(tx => tx.category === budget.category)
                .reduce((acc, tx) => acc + tx.amount, 0);
            
            const percentage = Math.min((spent / budget.amount) * 100, 100);
            const isOver = spent > budget.amount;
            const isWarning = !isOver && percentage > 80;

            const item = document.createElement('li');
            item.className = 'budget-item';
            item.innerHTML = `
                <div class="budget-info">
                    <span>${budget.category}</span>
                    <span class="spent">R$ ${spent.toFixed(2).replace('.',',')} / R$ ${budget.amount.toFixed(2).replace('.',',')}</span>
                </div>
                <div class="budget-progress-bar">
                    <div class="budget-progress ${isOver ? 'over' : (isWarning ? 'warning' : '')}" style="width: ${percentage}%;"></div>
                </div>
            `;
            list.appendChild(item);
        });
    }

    function renderBudgetsPage() {
        const renderBudgetItem = (budget) => {
            const element = document.createElement('li');
            element.innerHTML = `
                <span>${budget.category}</span>
                <div class="d-flex align-items-center">
                    <span class="list-item-value">R$ ${budget.amount.toFixed(2).replace('.',',')}</span>
                    <div class="transaction-actions actions-always-visible">
                        <button class="action-btn edit" title="Editar Orçamento"><i class='bx bxs-edit-alt'></i></button>
                        <button class="action-btn delete" title="Excluir Orçamento"><i class='bx bxs-trash'></i></button>
                    </div>
                </div>`;
            element.querySelector('.edit').onclick = () => openBudgetModal(budget);
            element.querySelector('.delete').onclick = () => deleteBudget(budget.id);
            return element;
        };
        renderList({ element: document.getElementById('budgets-list'), items: userBudgets, renderItem: renderBudgetItem, emptyMessage: 'Nenhum orçamento definido para o mês atual.' });
    }

    function openBudgetModal(budget = null) {
        const modal = document.getElementById('budget-modal');
        const form = document.getElementById('budget-form');
        form.reset();
        document.getElementById('budget-modal-title').textContent = budget ? 'Editar Orçamento' : 'Novo Orçamento';
        document.getElementById('budget-id').value = budget ? budget.id : '';

        const categorySelect = document.getElementById('budget-category');
        categorySelect.innerHTML = `<option value="" disabled selected>Selecione a categoria</option>`;
        userCategories.expense.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.name;
            option.textContent = cat.name;
            categorySelect.appendChild(option);
        });

        if (budget) {
            categorySelect.value = budget.category;
            document.getElementById('budget-amount').value = budget.amount;
            categorySelect.disabled = true;
        } else {
            categorySelect.disabled = false;
        }

        modal.classList.remove('hidden');
    }

    async function saveBudget(userId) {
        const id = document.getElementById('budget-id').value;
        const category = document.getElementById('budget-category').value;
        const amount = parseFloat(document.getElementById('budget-amount').value);
        if (!category || !amount || amount <= 0) return showToast('Preencha todos os campos.', 'error');

        const now = new Date();
        const monthId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        if (!id) {
            const existingBudget = userBudgets.find(b => b.category === category);
            if (existingBudget) {
                return showToast(`Já existe um orçamento para a categoria "${category}" este mês.`, 'error');
            }
        }

        const data = { userId, category, amount, month: monthId };
        const finalData = id ? { amount: data.amount } : data;

        const success = await saveData('budgets', finalData, id, 'save-budget-btn');

        if (success) {
            document.getElementById('budget-modal').classList.add('hidden');
        }
    }

    function deleteBudget(id) {
        if (confirm('Tem certeza que deseja excluir este orçamento?')) {
            db.collection('budgets').doc(id).delete()
              .then(() => showToast('Orçamento excluído com sucesso.'))
              .catch(err => {
                  console.error('Erro ao excluir orçamento:', err);
                  showToast('Erro ao excluir orçamento.', 'error');
              });
        }
    }

    function listenForAccounts(user) {
        return new Promise((resolve, reject) => {
            unsubscribeFromAccounts = db.collection('accounts').where('userId', '==', user.uid)
                .orderBy('createdAt', 'asc')
                .onSnapshot(async (snapshot) => {
                    if (snapshot.empty && user) {
                        await createDefaultAccount(user.uid);
                    } else {
                        userAccounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        renderAccountsPage();
                        updateDashboardMetrics();
                    }
                    resolve();
                }, err => {
                    console.error("Erro ao carregar contas:", err);
                    showToast('Não foi possível carregar as contas.', 'error');
                    reject(err);
                });
        });
    }

    async function createDefaultAccount(userId) {
        const defaultAccount = {
            userId,
            name: 'Carteira',
            initialBalance: 0,
        };
        await saveData('accounts', defaultAccount, null, null);
    }

    function renderAccountsPage() {
        const accountsWithDetails = userAccounts.map(account => {
             if (account.accountType === 'credit-card') {
                return { ...account, ...calculateOpenInvoice(account, allTransactions) };
            }
            return account;
        });
        
        const renderAccountItem = (acc) => {
            const element = document.createElement('li');
            const isCreditCard = acc.accountType === 'credit-card';
            element.innerHTML = `
                <span><i class='bx bxs-bank list-item-icon'></i>${acc.name}</span>
                <div class="transaction-actions actions-always-visible">
                    ${isCreditCard ? `<button class="action-btn pay" title="Pagar Fatura"><i class='bx bx-dollar-circle'></i></button>` : ''}
                    <button class="action-btn edit" title="Editar"><i class='bx bxs-edit-alt'></i></button>
                    <button class="action-btn delete" title="Excluir"><i class='bx bxs-trash'></i></button>
                </div>`;
            element.querySelector('.edit').onclick = () => openAccountModal(acc);
            element.querySelector('.delete').onclick = () => deleteAccount(acc.id);
            return element;
        };
        renderList({ element: document.getElementById('accounts-list'), items: accountsWithDetails, renderItem: renderAccountItem, emptyMessage: 'Nenhuma conta criada.' });
    }

    function openAccountModal(account = null) {
        const modal = document.getElementById('account-modal');
        const form = document.getElementById('account-form');
        form.reset();

        const typeSelect = document.getElementById('account-type');
        const ccFields = document.getElementById('credit-card-fields');
        const initialBalanceInput = document.getElementById('account-initial-balance');

        const handleAccountTypeChange = () => {
            const isCredit = typeSelect.value === 'credit-card';
            ccFields.classList.toggle('hidden', !isCredit);
            initialBalanceInput.placeholder = isCredit ? 'Fatura anterior em aberto (se houver)' : 'Saldo Inicial';
        };

        typeSelect.onchange = handleAccountTypeChange;

        document.getElementById('account-modal-title').textContent = account ? 'Editar Conta' : 'Nova Conta';
        document.getElementById('account-id').value = account ? account.id : '';
        if (account) {
            document.getElementById('account-name').value = account.name;
            document.getElementById('account-initial-balance').value = account.initialBalance;
            initialBalanceInput.disabled = true;
            typeSelect.value = account.accountType || 'checking';
            typeSelect.disabled = true;
            if (account.accountType === 'credit-card') {
                document.getElementById('account-closing-day').value = account.closingDay;
                document.getElementById('account-due-day').value = account.dueDay;
            }
        } else {
            initialBalanceInput.disabled = false;
            typeSelect.disabled = false;
            typeSelect.value = 'checking';
        }
        handleAccountTypeChange();
        modal.classList.remove('hidden');
    }

    async function saveAccount(userId) {
        const id = document.getElementById('account-id').value;
        const name = document.getElementById('account-name').value.trim();
        const initialBalance = parseFloat(document.getElementById('account-initial-balance').value);
        const accountType = document.getElementById('account-type').value;

        if (!name) return showToast('O nome da conta é obrigatório.', 'error');

        const data = { userId, name, initialBalance, accountType };

        if (accountType === 'credit-card') {
            data.closingDay = parseInt(document.getElementById('account-closing-day').value);
            data.dueDay = parseInt(document.getElementById('account-due-day').value);
            if (!data.closingDay || !data.dueDay || data.closingDay < 1 || data.dueDay < 1) {
                return showToast('Para cartões de crédito, os dias de fechamento e vencimento são obrigatórios.', 'error');
            }
        }

        const finalData = id ? { name, closingDay: data.closingDay, dueDay: data.dueDay } : data;

        const success = await saveData('accounts', finalData, id, 'save-account-btn');

        if (success) {
            document.getElementById('account-modal').classList.add('hidden');
        }
    }

    function deleteAccount(id) {
        if (allTransactions.some(tx => tx.accountId === id)) {
            return showToast('Não é possível excluir contas que possuem lançamentos.', 'error');
        }
        if (confirm('Tem certeza que deseja excluir esta conta?')) {
            db.collection('accounts').doc(id).delete()
              .then(() => showToast('Conta excluída.'))
              .catch(err => showToast('Erro ao excluir conta.', 'error'));
        }
    }

    function renderAccountsOnDashboard(accountsWithDetails) {
        const list = document.getElementById('dashboard-accounts-list');
        if (!list) return;
        list.innerHTML = '';
        if (accountsWithDetails.length === 0) {
            list.innerHTML = `<li class="empty-state"><p>Crie sua primeira conta.</p></li>`;
            return;
        }
        accountsWithDetails.forEach(acc => {
            const item = document.createElement('li');
            item.className = 'account-item-dashboard';

            if (acc.accountType === 'credit-card') {
                item.innerHTML = `
                    <span class="name">${acc.name}</span>
                    <div class="balance credit">
                        <span>R$ ${acc.amount.toFixed(2).replace('.',',')}</span>
                        <small>Vence em: ${acc.dueDate.toLocaleDateString('pt-BR')}</small>
                    </div>
                `;
            } else {
                item.innerHTML = `
                    <span class="name">${acc.name}</span>
                    <span class="balance">R$ ${acc.currentBalance.toFixed(2).replace('.',',')}</span>
                `;
            }
            list.appendChild(item);
        });
    }

    function calculateOpenInvoice(account, transactions) {
        const now = new Date();
        const closingDay = account.closingDay;
        let invoiceEndDate, invoiceStartDate;

        if (now.getDate() > closingDay) {
            invoiceEndDate = new Date(now.getFullYear(), now.getMonth() + 1, closingDay);
            invoiceStartDate = new Date(now.getFullYear(), now.getMonth(), closingDay + 1);
        } else {
            invoiceEndDate = new Date(now.getFullYear(), now.getMonth(), closingDay);
            invoiceStartDate = new Date(now.getFullYear(), now.getMonth() - 1, closingDay + 1);
        }

        const transactionsInPeriod = transactions.filter(tx => {
            if (tx.accountId !== account.id) return false;
            const txDate = new Date(tx.date + 'T00:00:00');
            return txDate >= invoiceStartDate && txDate <= invoiceEndDate;
        });

        const invoiceTransactions = getExpandedTransactionsForCategories(transactionsInPeriod);

        const invoiceAmount = invoiceTransactions.reduce((sum, tx) => {
            return sum + (tx.type === 'expense' ? tx.amount : -tx.amount);
        }, 0);

        const totalDue = (account.initialBalance || 0) + invoiceAmount;

        return {
            amount: Math.max(0, totalDue),
            dueDate: new Date(invoiceEndDate.getFullYear(), invoiceEndDate.getMonth(), account.dueDay)
        };
    }

    function openTransferModal() {
        if (userAccounts.length < 2) {
            return showToast('Você precisa de pelo menos duas contas para fazer uma transferência.', 'error');
        }
        const modal = document.getElementById('transfer-modal');
        const form = document.getElementById('transfer-form');
        form.reset();

        const fromSelect = document.getElementById('transfer-from-account');
        const toSelect = document.getElementById('transfer-to-account');
        
        fromSelect.innerHTML = '<option value="" disabled selected>Conta de Origem</option>';
        toSelect.innerHTML = '<option value="" disabled selected>Conta de Destino</option>';

        userAccounts.forEach(acc => {
            const fromOption = document.createElement('option');
            fromOption.value = acc.id;
            fromOption.textContent = acc.name;
            fromSelect.appendChild(fromOption);

            const toOption = document.createElement('option');
            toOption.value = acc.id;
            toOption.textContent = acc.name;
            toSelect.appendChild(toOption);
        });

        document.getElementById('transfer-date').valueAsDate = new Date();
        modal.classList.remove('hidden');
    }

    async function saveTransfer(userId) {
        const fromAccountId = document.getElementById('transfer-from-account').value;
        const toAccountId = document.getElementById('transfer-to-account').value;
        const amount = parseFloat(document.getElementById('transfer-amount').value);
        const date = document.getElementById('transfer-date').value;
        const description = document.getElementById('transfer-description').value.trim();

        if (!fromAccountId || !toAccountId || !amount || amount <= 0) {
            return showToast('Preencha todos os campos obrigatórios.', 'error');
        }

        if (fromAccountId === toAccountId) {
            return showToast('A conta de origem e destino não podem ser a mesma.', 'error');
        }

        const fromAccount = userAccounts.find(acc => acc.id === fromAccountId);
        const toAccount = userAccounts.find(acc => acc.id === toAccountId);
        const transferId = db.collection('transactions').doc().id;

        const baseTransaction = { userId, amount, date, category: 'Transferência', transferId };

        const expenseTransaction = { ...baseTransaction, accountId: fromAccountId, type: 'expense', description: description || `Transferência para ${toAccount.name}` };
        const incomeTransaction = { ...baseTransaction, accountId: toAccountId, type: 'income', description: description || `Transferência de ${fromAccount.name}` };

        const batch = db.batch();
        const expenseRef = db.collection('transactions').doc();
        const incomeRef = db.collection('transactions').doc();
        batch.set(expenseRef, expenseTransaction);
        batch.set(incomeRef, incomeTransaction);

        try {
            await batch.commit();
            document.getElementById('transfer-modal').classList.add('hidden');
            showToast('Transferência realizada com sucesso!');
        } catch (err) {
            console.error("Erro ao realizar transferência:", err);
            showToast('Ocorreu um erro ao realizar a transferência.', 'error');
        }
    }

    function listenForGoals(user) {
        return new Promise((resolve, reject) => {
            unsubscribeFromGoals = db.collection('goals').where('userId', '==', user.uid)
                .onSnapshot(snapshot => {
                    userGoals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    userGoals.sort((a, b) => (a.createdAt?.toDate() || 0) - (b.createdAt?.toDate() || 0));
                    renderGoalsPage();
                    renderGoalsOnDashboard(userGoals);
                    resolve();
                }, err => {
                    console.error("Erro ao carregar metas:", err);
                    showToast('Não foi possível carregar as metas.', 'error');
                    reject(err);
                });
        });
    }

    function renderGoalsOnDashboard(goals) {
        const list = document.getElementById('dashboard-goals-list');
        if (!list) return;
        list.innerHTML = '';
        if (!goals || goals.length === 0) {
            list.innerHTML = `<li class="empty-state"><p>Nenhuma meta ativa.</p></li>`;
            return;
        }

        const sortedGoals = [...goals].sort((a, b) => {
            const progressA = (a.currentAmount || 0) / (a.targetAmount || 1);
            const progressB = (b.currentAmount || 0) / (b.targetAmount || 1);
            return progressB - progressA;
        });
        const goalsToShow = sortedGoals.slice(0, 3);

        goalsToShow.forEach(goal => {
            const saved = goal.currentAmount || 0;
            const target = goal.targetAmount;
            const percentage = target > 0 ? Math.min((saved / target) * 100, 100) : 0;

            const item = document.createElement('li');
            item.className = 'goal-item-dashboard';
            item.innerHTML = `
                <div class="goal-info-dashboard">
                    <span>${goal.name}</span>
                    <span class="progress-text">${percentage.toFixed(0)}%</span>
                </div>
                <div class="budget-progress-bar">
                    <div class="budget-progress" style="width: ${percentage}%;"></div>
                </div>
            `;
            list.appendChild(item);
        });
    }

    function renderGoalsPage() {
        const list = document.getElementById('goals-list');
        if (!list) return;
        list.innerHTML = '';

        if (userGoals.length === 0) {
            list.innerHTML = `<li class="empty-state" style="border: none; padding: 0;"><p>Nenhuma meta criada ainda.</p></li>`;
            return;
        }

        userGoals.forEach(goal => {
            const item = document.createElement('li');
            item.className = 'goal-item';
            const saved = goal.currentAmount || 0;
            const target = goal.targetAmount;
            const percentage = Math.min((saved / target) * 100, 100);

            item.innerHTML = `
                <div class="goal-header">
                    <h4>${goal.name}</h4>
                    <div class="transaction-actions actions-always-visible">
                        <button class="action-btn edit" title="Editar Meta"><i class='bx bxs-edit-alt'></i></button>
                        <button class="action-btn delete" title="Excluir Meta"><i class='bx bxs-trash'></i></button>
                    </div>
                </div>
                <div class="budget-progress-bar">
                    <div class="budget-progress" style="width: ${percentage}%;"></div>
                </div>
                <div class="goal-progress-info">
                    <span>R$ ${saved.toFixed(2).replace('.',',')} / R$ ${target.toFixed(2).replace('.',',')}</span>
                    <span>${percentage.toFixed(0)}%</span>
                </div>
                <div class="goal-actions">
                    <button class="btn-primary contribute-btn">Contribuir</button>
                </div>
            `;
            item.querySelector('.edit').onclick = () => openGoalModal(goal);
            item.querySelector('.delete').onclick = () => deleteGoal(goal.id);
            item.querySelector('.contribute-btn').onclick = () => openContributionModal(goal);
            list.appendChild(item);
        });
    }

    function openGoalModal(goal = null) {
        const modal = document.getElementById('goal-modal');
        document.getElementById('goal-form').reset();
        document.getElementById('goal-modal-title').textContent = goal ? 'Editar Meta' : 'Nova Meta';
        document.getElementById('goal-id').value = goal ? goal.id : '';
        if (goal) {
            document.getElementById('goal-name').value = goal.name;
            document.getElementById('goal-target-amount').value = goal.targetAmount;
        }
        modal.classList.remove('hidden');
    }

    async function saveGoal(userId) {
        const id = document.getElementById('goal-id').value;
        const name = document.getElementById('goal-name').value.trim();
        const targetAmount = parseFloat(document.getElementById('goal-target-amount').value);

        if (!name || !targetAmount || targetAmount <= 0) {
            return showToast('Preencha todos os campos.', 'error');
        }

        const data = { userId, name, targetAmount };
        if (!id) {
            data.currentAmount = 0;
        }

        const success = await saveData('goals', data, id, 'save-goal-btn');

        if (success) {
            document.getElementById('goal-modal').classList.add('hidden');
        }
    }

    function deleteGoal(id) {
        if (confirm('Tem certeza que deseja excluir esta meta? As contribuições não serão excluídas, mas ficarão na categoria "Metas".')) {
            db.collection('goals').doc(id).delete()
              .then(() => showToast('Meta excluída.'))
              .catch(err => showToast('Erro ao excluir meta.', 'error'));
        }
    }

    function openContributionModal(goal) {
        const modal = document.getElementById('contribution-modal');
        document.getElementById('contribution-form').reset();
        document.getElementById('contribution-goal-id').value = goal.id;
        document.getElementById('contribution-modal-title').textContent = `Contribuir para "${goal.name}"`;

        const accountSelect = document.getElementById('contribution-account');
        accountSelect.innerHTML = `<option value="" disabled selected>Debitar da conta...</option>`;
        userAccounts.forEach(acc => {
            const option = document.createElement('option');
            option.value = acc.id;
            option.textContent = acc.name;
            accountSelect.appendChild(option);
        });

        modal.classList.remove('hidden');
    }

    async function saveContribution(userId) {
        const goalId = document.getElementById('contribution-goal-id').value;
        const amount = parseFloat(document.getElementById('contribution-amount').value);
        const accountId = document.getElementById('contribution-account').value;
        if (!goalId || !amount || amount <= 0 || !accountId) return showToast('Preencha todos os campos.', 'error');

        const goalRef = db.collection('goals').doc(goalId);
        const transactionRef = db.collection('transactions').doc();
        const goal = userGoals.find(g => g.id === goalId);

        const batch = db.batch();
        batch.update(goalRef, { currentAmount: firebase.firestore.FieldValue.increment(amount) });
        batch.set(transactionRef, { userId, type: 'expense', description: `Contribuição para meta: ${goal.name}`, category: 'Metas', amount, date: new Date().toISOString().split('T')[0], accountId: accountId });

        await batch.commit().then(() => {
            document.getElementById('contribution-modal').classList.add('hidden');
            showToast('Contribuição registrada com sucesso!');
        }).catch(err => {
            console.error("Erro ao salvar contribuição:", err);
            showToast('Erro ao registrar contribuição.', 'error');
        });
    }

    function listenForInvestments(user) {
        return new Promise((resolve, reject) => {
            unsubscribeFromInvestments = db.collection('investments').where('userId', '==', user.uid)
                .onSnapshot(snapshot => {
                    userInvestments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    userInvestments.sort((a, b) => (a.createdAt?.toDate() || 0) - (b.createdAt?.toDate() || 0));
                    renderInvestmentsPage();
                    updateDashboardMetrics();
                    resolve();
                }, err => {
                    console.error("Erro ao carregar investimentos:", err);
                    showToast('Não foi possível carregar os investimentos.', 'error');
                    reject(err);
                });
        });
    }

    function renderInvestmentsPage() {
        const renderInvestmentItem = (inv) => {
            const element = document.createElement('li');
            element.innerHTML = `
                <div class="d-flex flex-column list-item-details-column">
                    <span style="font-weight: 600;">${inv.name}</span>
                    <small style="color: var(--text-dark);">${inv.type}</small>
                </div>
                <div class="d-flex align-items-center">
                    <span class="list-item-value">R$ ${inv.amount.toFixed(2).replace('.',',')}</span>
                    <div class="transaction-actions actions-always-visible">
                        <button class="action-btn edit" title="Editar Investimento"><i class='bx bxs-edit-alt'></i></button>
                        <button class="action-btn delete" title="Excluir Investimento"><i class='bx bxs-trash'></i></button>
                    </div>
                </div>`;
            element.querySelector('.edit').onclick = () => openInvestmentModal(inv);
            element.querySelector('.delete').onclick = () => deleteInvestment(inv.id);
            return element;
        };
        renderList({ element: document.getElementById('investments-list'), items: userInvestments, renderItem: renderInvestmentItem, emptyMessage: 'Nenhum investimento cadastrado.' });
    }

    function openInvestmentModal(investment = null) {
        const modal = document.getElementById('investment-modal');
        const form = document.getElementById('investment-form');
        form.reset();
        document.getElementById('investment-modal-title').textContent = investment ? 'Editar Investimento' : 'Novo Investimento';
        document.getElementById('investment-id').value = investment ? investment.id : '';
        if (investment) {
            document.getElementById('investment-name').value = investment.name;
            document.getElementById('investment-type').value = investment.type;
            document.getElementById('investment-amount').value = investment.amount;
        }
        modal.classList.remove('hidden');
    }

    async function saveInvestment(userId) {
        const id = document.getElementById('investment-id').value;
        const name = document.getElementById('investment-name').value.trim();
        const type = document.getElementById('investment-type').value.trim();
        const amount = parseFloat(document.getElementById('investment-amount').value);

        if (!name || !type || !amount || amount <= 0) {
            return showToast('Preencha todos os campos.', 'error');
        }

        const data = { userId, name, type, amount };
        const success = await saveData('investments', data, id, 'save-investment-btn');

        if (success) {
            document.getElementById('investment-modal').classList.add('hidden');
        }
    }

    function deleteInvestment(id) {
        if (confirm('Tem certeza que deseja excluir este investimento?')) {
            db.collection('investments').doc(id).delete()
              .then(() => showToast('Investimento excluído.'))
              .catch(err => {
                  console.error('Erro ao excluir investimento:', err);
                  showToast('Erro ao excluir investimento.', 'error');
              });
        }
    }

    function initializeReportsPage() {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        document.getElementById('report-start-date').valueAsDate = firstDay;
        document.getElementById('report-end-date').valueAsDate = lastDay;

        generateReport();
    }

    function generateReport() {
        const startDate = document.getElementById('report-start-date').value;
        const endDate = document.getElementById('report-end-date').value;
        const type = document.getElementById('report-type-filter').value;
        const category = document.getElementById('report-category-filter').value;

        if (!startDate || !endDate) return;

        const filtered = allTransactions.filter(tx => {
            const dateMatch = tx.date >= startDate && tx.date <= endDate;
            const typeMatch = (type === 'all') || (tx.type === type);
            const categoryMatch = (category === 'all') || (tx.category === category);
            return dateMatch && typeMatch && categoryMatch;
        });

        lastFilteredTransactions = filtered;

        renderReportSummary(filtered);
        renderReportCategoryChart(filtered);
        renderBalanceEvolutionChart(allTransactions, startDate, endDate);
        renderTransactionList(document.getElementById('report-transactions-list'), filtered, "Nenhum lançamento encontrado para os filtros selecionados.", true);
    }

    function renderReportSummary(transactions) {
        const summary = transactions.reduce((acc, tx) => {
            if (tx.type === 'income') {
                acc.income += tx.amount;
            } else {
                acc.expense += tx.amount;
            }
            return acc;
        }, { income: 0, expense: 0 });

        const netBalance = summary.income - summary.expense;

        document.getElementById('report-total-income').textContent = `R$ ${summary.income.toFixed(2).replace('.',',')}`;
        document.getElementById('report-total-expense').textContent = `R$ ${summary.expense.toFixed(2).replace('.',',')}`;
        document.getElementById('report-net-balance').textContent = `R$ ${netBalance.toFixed(2).replace('.',',')}`;
    }

    function renderReportCategoryChart(transactions) {
        const expenseData = transactions
            .filter(tx => tx.type === 'expense')
            .reduce((acc, tx) => {
                acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
                return acc;
            }, {});

        const chartCanvas = document.getElementById('report-chart');
        const emptyState = document.getElementById('report-chart-empty');

        if (Object.keys(expenseData).length === 0) {
            chartCanvas.classList.add('hidden');
            emptyState.classList.remove('hidden');
            if (reportCategoryChart) reportCategoryChart.destroy();
            reportCategoryChart = null;
            return;
        }

        chartCanvas.classList.remove('hidden');
        emptyState.classList.add('hidden');

        const labels = Object.keys(expenseData);
        const data = Object.values(expenseData);

        if (reportCategoryChart) reportCategoryChart.destroy();

        reportCategoryChart = new Chart(chartCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Despesas por Categoria',
                    data: data,
                    backgroundColor: 'rgba(100, 255, 218, 0.6)',
                    borderColor: 'rgba(100, 255, 218, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { x: { ticks: { color: '#8892b0' } }, y: { ticks: { color: '#8892b0' } } }
            }
        });
    }

    function getGroupKey(date, grouping) {
        if (grouping === 'month') return date.toISOString().slice(0, 7);
        if (grouping === 'week') {
            const firstDay = new Date(date.setDate(date.getDate() - date.getDay()));
            return firstDay.toISOString().slice(0, 10);
        }
        return date.toISOString().slice(0, 10);
    }

    function renderBalanceEvolutionChart(allTxs, startDateStr, endDateStr) {
        const chartCanvas = document.getElementById('balance-evolution-chart');
        const emptyState = document.getElementById('balance-evolution-chart-empty');

        const initialPatrimony = userAccounts.reduce((sum, acc) => sum + (acc.initialBalance || 0), 0);
        const prePeriodChange = allTxs
            .filter(tx => tx.date < startDateStr)
            .reduce((acc, tx) => acc + (tx.type === 'income' ? tx.amount : -tx.amount), 0);
        let currentBalance = initialPatrimony + prePeriodChange;

        const groupedChanges = allTxs
            .filter(tx => tx.date >= startDateStr && tx.date <= endDateStr)
            .reduce((acc, tx) => {
                const change = tx.type === 'income' ? tx.amount : -tx.amount;
                const groupKey = getGroupKey(new Date(tx.date + 'T00:00:00'), reportGrouping);
                acc[groupKey] = (acc[groupKey] || 0) + change;
                return acc;
            }, {});

        const labels = [];
        const data = [];
        const accumulatedGroups = {};
        const start = new Date(startDateStr + 'T00:00:00');
        const end = new Date(endDateStr + 'T00:00:00');

        for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
            const groupKey = getGroupKey(new Date(d), reportGrouping);

            if (!accumulatedGroups[groupKey]) {
                let label = '';
                if (reportGrouping === 'day') {
                    label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                } else if (reportGrouping === 'week') {
                    label = `Semana ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
                } else {
                    label = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
                }
                labels.push(label);

                if (groupedChanges[groupKey]) {
                    currentBalance += groupedChanges[groupKey];
                }
                data.push(currentBalance);
                accumulatedGroups[groupKey] = true;
            }
        }

        if (labels.length < 2) {
            chartCanvas.classList.add('hidden');
            emptyState.classList.remove('hidden');
            if (reportBalanceChart) {
                reportBalanceChart.destroy();
                reportBalanceChart = null;
            }
            return;
        }

        chartCanvas.classList.remove('hidden');
        emptyState.classList.add('hidden');

        if (reportBalanceChart) reportBalanceChart.destroy();

        reportBalanceChart = new Chart(chartCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Saldo',
                    data: data,
                    fill: true,
                    backgroundColor: 'rgba(100, 255, 218, 0.1)',
                    borderColor: 'rgba(100, 255, 218, 1)',
                    tension: 0.1
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#8892b0' } }, y: { ticks: { color: '#8892b0' } } } }
        });
    }

    function exportReportToCSV() {
        if (lastFilteredTransactions.length === 0) {
            return showToast('Não há dados filtrados para exportar.', 'error');
        }

        const headers = ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor'];

        const rows = lastFilteredTransactions.map(tx => {
            const type = tx.type === 'income' ? 'Receita' : 'Despesa';
            const amount = tx.amount.toFixed(2).replace('.', ',');
            const date = new Date(tx.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            const description = `"${tx.description.replace(/"/g, '""')}"`;
            return [date, description, tx.category, type, amount].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `relatorio_financeiro_${new Date().toISOString().split('T')[0]}.csv`);
        link.click();
    }

    function updateChart(income, expense) {
        const chartCanvas = document.getElementById('monthly-chart');
        if (!chartCanvas) return; // Se o gráfico não está na página atual, não faz nada.
        const ctx = chartCanvas.getContext('2d');
        const isLightTheme = body.classList.contains('light-theme');

        const chartData = {
            labels: ['Receitas', 'Despesas'],
            datasets: [{
                data: [income, expense],
                backgroundColor: [
                    isLightTheme ? 'rgba(40, 167, 69, 0.8)' : 'rgba(100, 255, 218, 0.8)',
                    isLightTheme ? 'rgba(220, 53, 69, 0.8)' : 'rgba(255, 123, 123, 0.8)'
                ],
                borderColor: [
                    isLightTheme ? '#ffffff' : '#0a192f'
                ],
                borderWidth: 2
            }]
        };

        if (monthlyChart) {
            monthlyChart.data = chartData;
            monthlyChart.update();
        } else {
            monthlyChart = new Chart(ctx, {
                type: 'doughnut',
                data: chartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    cutout: '70%',
                    plugins: { legend: { position: 'bottom', labels: { color: isLightTheme ? '#333' : '#8892b0' } } }
                }
            });
        }
    }

    async function loadAndApplyUserSettings(user) {
        const settingsDoc = await db.collection('user_settings').doc(user.uid).get();
        if (settingsDoc.exists) {
            userSettings = settingsDoc.data();
            if (userSettings.dashboardOrder) {
                applyDashboardOrder(userSettings.dashboardOrder);
            }
        }
        initializeDraggableDashboard(user);
    }

    function applyDashboardOrder(order) {
        const grid = document.querySelector('.dashboard-grid');
        const items = {};
        grid.childNodes.forEach(node => {
            if (node.nodeType === 1 && node.dataset.id) {
                items[node.dataset.id] = node;
            }
        });

        order.forEach(id => {
            if (items[id]) {
                grid.appendChild(items[id]);
            }
        });
    }

    function initializeDraggableDashboard(user) {
        if (isDraggableInitialized) return;

        const grid = document.querySelector('.dashboard-grid');
        new Sortable(grid, {
            animation: 150,
            handle: '.grid-item h3',
            ghostClass: 'sortable-ghost-class',
            onEnd: (evt) => {
                const newOrder = [...evt.to.children].map(item => item.dataset.id);
                db.collection('user_settings').doc(user.uid).set({ dashboardOrder: newOrder }, { merge: true });
            }
        });

        isDraggableInitialized = true;
    }

    function renderList({ element, items, renderItem, emptyMessage }) {
        if (!element) return;
        element.innerHTML = '';
        if (items.length === 0) {
            element.innerHTML = `<li class="empty-state"><p>${emptyMessage}</p></li>`;
            return;
        }
        items.forEach(item => element.appendChild(renderItem(item)));
    }

    async function saveData(collectionName, data, docId, buttonId) {
        const button = document.getElementById(buttonId);
        if (button) button.classList.add('btn-loading');

        try {
            const isNew = !docId;

            if (isNew) {
                data.createdAt = new Date().toISOString();
                await db.collection(collectionName).add(data);
            } else {
                await db.collection(collectionName).doc(docId).update(data);
            }

            showToast(`${collectionName.slice(0, -1)} ${isNew ? 'salva' : 'atualizada'} com sucesso!`);
            return true;

        } catch (error) {
            console.error(`Erro ao salvar em ${collectionName}:`, error);
            showToast(`Erro ao salvar ${collectionName.slice(0, -1)}. Verifique o console.`, 'error');
            return false;
        } finally {
            if (button) button.classList.remove('btn-loading');
        }
    }
});
