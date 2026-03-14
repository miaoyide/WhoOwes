const SUPABASE_URL = 'https://naagujwufjeqsgwmyrcv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hYWd1and1ZmplcXNnd215cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjc0MTcsImV4cCI6MjA4ODkwMzQxN30.6MFjNVe2zz1lwGVYx9BSFco7hEZTjvBueGQABrq1apM';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const PRESET_MEMBERS = ["ㄉ","ㄊ","ㄌ","ㄐㄅ","ㄅㄐ","ㄌㄇ","ㄩ","ㄏ"];

let currentEventId = '';
let expenses = [];
let members = [];
let selectedParticipants = [...members];
let selectedPayers = [];
let payerEqualSplit = true;
let participantEqualSplit = true;
let isDeleting = false;
let modalMembers = [];
let editingEventId = '';
let editModalCurrentMembers = [];
let titleClickCount = 0;
let titleClickTimer = null;
let editMode = false;

function showLoading() {
    document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

function handleTitleClick() {
    titleClickCount++;
    clearTimeout(titleClickTimer);
    titleClickTimer = setTimeout(() => { titleClickCount = 0; }, 2000);
    if (titleClickCount >= 5) {
        titleClickCount = 0;
        clearTimeout(titleClickTimer);
        toggleEditMode();
    }
}

function toggleEditMode() {
    editMode = !editMode;
    document.body.classList.toggle('edit-mode', editMode);
}

window.onload = async function () {
    showLoading();
    document.getElementById('itemDate').value = new Date().toISOString().split('T')[0];
    await fetchEvents();
    await fetchExpenses();

    _supabase.channel('custom-all-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => fetchExpenses())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => fetchEvents())
        .subscribe();

    render();
    hideLoading();
};

async function fetchEvents() {
    const { data, error } = await _supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('抓取行程失敗:', error);
        return;
    }

    const select = document.getElementById('eventSelect');
    if (data.length > 0) {
        select.innerHTML = data.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
        if (!currentEventId) currentEventId = data[0].id;
        select.value = currentEventId;
    } else {
        select.innerHTML = '<option value="">請先建立行程</option>';
    }

    renderEventGrid(data);
    hideLoading();
}

function showPage(page) {
    const home = document.getElementById('homePage');
    const detail = document.getElementById('detailPage');

    if (page === 'home') {
        showLoading();
        home.style.display = 'block';
        detail.style.display = 'none';
        fetchEvents();
    } else {
        home.style.display = 'none';
        detail.style.display = 'block';
    }
}

async function renderEventGrid(events) {
    const grid = document.getElementById('eventGrid');
    grid.innerHTML = '';

    for (const trip of events) {
        const { data } = await _supabase
            .from('expenses')
            .select('amount')
            .eq('event_id', trip.id);

        const count = data ? data.length : 0;
        const total = data ? data.reduce((sum, e) => sum + parseFloat(e.amount), 0) : 0;

        const card = document.createElement('div');
        card.className = 'event-card';
        card.innerHTML = `
            <button class="edit-event-btn" title="編輯行程">✎</button>
            <button class="delete-event-btn" title="刪除行程">×</button>
            <div class="event-card-content">
                <h3>${trip.name}</h3>
                <p class="event-card-meta">${count} 筆消費・總計 $${Math.round(total)}</p>
            </div>
        `;
        card.querySelector('.event-card-content').onclick = () => enterEvent(trip.id);
        card.querySelector('.edit-event-btn').onclick = (e) => {
            e.stopPropagation();
            openEditEventModal(trip.id, trip.name, trip.members || []);
        };
        card.querySelector('.delete-event-btn').onclick = (e) => {
            e.stopPropagation();
            deleteEvent(trip.id);
        };
        grid.appendChild(card);
    }
}

function enterEvent(id) {
    showLoading();
    currentEventId = id;
    const select = document.getElementById('eventSelect');
    if (select) select.value = id;
    fetchExpenses();
    showPage('detail');
    window.scrollTo(0, 0);
}

function renderModalMemberChips() {
    document.getElementById('modalMemberChips').innerHTML = modalMembers.map(name => `
        <div class="member-chip-tag">
            ${name}<span class="chip-remove" onclick="removeModalMember('${name}')">×</span>
        </div>
    `).join('');
}

function removeModalMember(name) {
    modalMembers = modalMembers.filter(m => m !== name);
    renderModalMemberChips();
}

function promptNewEvent() {
    modalMembers = [...PRESET_MEMBERS];
    document.getElementById('newEventName').value = '';
    document.getElementById('modalNewMember').value = '';
    renderModalMemberChips();
    document.getElementById('newEventModal').style.display = 'flex';
    setTimeout(() => document.getElementById('newEventName').focus(), 100);
}

function addModalMember() {
    const input = document.getElementById('modalNewMember');
    const name = input.value.trim();
    if (!name) return;
    if (modalMembers.includes(name)) { alert('這個名字已經存在囉！'); return; }
    modalMembers.push(name);
    input.value = '';
    renderModalMemberChips();
}

function closeNewEventModal() {
    document.getElementById('newEventModal').style.display = 'none';
}

async function confirmNewEvent() {
    const name = document.getElementById('newEventName').value.trim();
    if (!name) return alert('請輸入行程名稱');

    closeNewEventModal();

    const { data, error } = await _supabase
        .from('events')
        .insert([{ name, members: modalMembers }])
        .select()
        .single();

    if (error) {
        alert('建立失敗：' + error.message);
    } else {
        await fetchEvents();
        enterEvent(data.id);
    }
}

async function deleteEvent(id) {
    if (!confirm("確定要刪除此行程嗎？相關帳目也會一起消失喔！")) return;

    await _supabase.from('expenses').delete().eq('event_id', id);
    const { error } = await _supabase.from('events').delete().eq('id', id);

    if (error) {
        alert('刪除失敗：' + error.message);
    } else {
        if (currentEventId === id) {
            currentEventId = '';
            expenses = [];
            members = [];
            selectedParticipants = [];
        }
        fetchEvents();
    }
}

function openEditEventModal(id, name, currentMembers) {
    editingEventId = id;
    editModalCurrentMembers = [...currentMembers];
    document.getElementById('editEventName').value = name;
    document.getElementById('editNewMember').value = '';
    renderEditMemberChips();
    document.getElementById('editEventModal').style.display = 'flex';
    setTimeout(() => document.getElementById('editEventName').focus(), 100);
}

function renderEditMemberChips() {
    document.getElementById('editMemberChips').innerHTML = editModalCurrentMembers.map(name => `
        <div class="member-chip-tag">
            ${name}<span class="chip-remove" onclick="removeEditMember('${name}')">×</span>
        </div>
    `).join('');
}

function removeEditMember(name) {
    editModalCurrentMembers = editModalCurrentMembers.filter(m => m !== name);
    renderEditMemberChips();
}

function addEditMember() {
    const input = document.getElementById('editNewMember');
    const name = input.value.trim();
    if (!name) return;
    if (editModalCurrentMembers.includes(name)) { alert('這個名字已經存在囉！'); return; }
    editModalCurrentMembers.push(name);
    input.value = '';
    renderEditMemberChips();
}

function closeEditEventModal() {
    document.getElementById('editEventModal').style.display = 'none';
}

async function confirmEditEvent() {
    const name = document.getElementById('editEventName').value.trim();
    if (!name) return alert('請輸入行程名稱');

    closeEditEventModal();

    const { error } = await _supabase
        .from('events')
        .update({ name, members: editModalCurrentMembers })
        .eq('id', editingEventId);

    if (error) {
        alert('儲存失敗：' + error.message);
    } else {
        await fetchEvents();
        if (currentEventId === editingEventId) await fetchExpenses();
    }
}

function changeEvent(eventId) {
    currentEventId = eventId;
    fetchExpenses();
}

async function fetchExpenses() {
    const select = document.getElementById('eventSelect');
    if (!select || !select.value) return;
    currentEventId = select.value;

    const [{ data: eventData }, { data, error }] = await Promise.all([
        _supabase.from('events').select('members').eq('id', currentEventId).single(),
        _supabase.from('expenses').select('*').eq('event_id', currentEventId).order('date', { ascending: false })
    ]);

    if (error) {
        console.error("抓取失敗:", error);
        return;
    }

    expenses = data;

    const allNames = new Set(eventData?.members || []);
    expenses.forEach(ex => {
        if (ex.payer) allNames.add(ex.payer);
        if (ex.participants) ex.participants.forEach(p => allNames.add(p));
    });
    members = Array.from(allNames);

    if (selectedParticipants.length === 0) {
        selectedParticipants = [...members];
    } else {
        selectedParticipants = selectedParticipants.filter(p => members.includes(p));
        members.forEach(m => {
            if (!selectedParticipants.includes(m)) selectedParticipants.push(m);
        });
    }

    if (selectedPayers.length === 0 && members.length > 0) {
        selectedPayers = [members[0]];
    } else {
        selectedPayers = selectedPayers.filter(p => members.includes(p));
        if (selectedPayers.length === 0 && members.length > 0) selectedPayers = [members[0]];
    }

    participantEqualSplit = true;
    payerEqualSplit = true;

    render();
    hideLoading();
}

async function addExpense() {
    const btn = document.getElementById('submitBtn');
    const payers = [...selectedPayers];
    const participants = [...selectedParticipants];
    const desc = document.getElementById('itemDesc').value.trim();
    const amount = parseFloat(document.getElementById('itemAmount').value);
    const date = document.getElementById('itemDate').value;

    if (!desc || isNaN(amount)) return alert("請填寫項目與金額");
    if (!currentEventId) return alert("請先選擇一個行程");
    if (payers.length === 0) return alert("請至少選擇一位付款人");
    if (participants.length === 0) return alert("請至少選擇一位分攤成員");

    let payerAmounts;
    if (!payerEqualSplit && payers.length > 1) {
        payerAmounts = payers.map(p => {
            const input = document.querySelector(`.payer-amount-input[data-payer="${p}"]`);
            return parseFloat(input?.value) || 0;
        });
        const total = Math.round(payerAmounts.reduce((s, a) => s + a, 0) * 100) / 100;
        if (Math.abs(total - amount) > 0.01) return alert(`付款金額總和（$${total}）與總金額（$${amount}）不符`);
    } else {
        payerAmounts = payers.map(() => amount / payers.length);
    }

    let participantAmounts;
    if (!participantEqualSplit && participants.length > 1) {
        participantAmounts = participants.map(p => {
            const input = document.querySelector(`.participant-amount-input[data-participant="${p}"]`);
            return parseFloat(input?.value) || 0;
        });
        const total = Math.round(participantAmounts.reduce((s, a) => s + a, 0) * 100) / 100;
        if (Math.abs(total - amount) > 0.01) return alert(`分攤金額總和（$${total}）與總金額（$${amount}）不符`);
    } else {
        participantAmounts = participants.map(() => amount / participants.length);
    }

    btn.disabled = true;
    btn.innerText = "同步中...";

    const { error } = await _supabase
        .from('expenses')
        .insert([{ description: desc, amount, payer: payers[0], payers, payer_amounts: payerAmounts, participants, participant_amounts: participantAmounts, date, event_id: currentEventId }]);

    if (error) {
        alert("同步失敗：" + error.message);
    } else {
        document.getElementById('itemDesc').value = '';
        document.getElementById('itemAmount').value = '';
        await fetchExpenses();
    }

    btn.disabled = false;
    btn.innerText = "新增一筆消費";
}

async function deleteItem(id, desc) {
    if (isDeleting) return;
    if (!confirm(`確定刪除「${desc}」？`)) return;

    isDeleting = true;
    const { error } = await _supabase.from('expenses').delete().eq('id', id);
    if (error) {
        alert('刪除失敗：' + error.message);
    } else {
        await fetchExpenses();
    }
    isDeleting = false;
}

function getPayerAmounts(item) {
    const payers = item.payers || [item.payer];
    if (item.payer_amounts && item.payer_amounts.length === payers.length) {
        return { payers, amounts: item.payer_amounts };
    }
    const equal = parseFloat(item.amount) / payers.length;
    return { payers, amounts: payers.map(() => equal) };
}

function getParticipantAmounts(item) {
    const participants = item.participants || [];
    if (item.participant_amounts && item.participant_amounts.length === participants.length) {
        return { participants, amounts: item.participant_amounts };
    }
    const equal = parseFloat(item.amount) / participants.length;
    return { participants, amounts: participants.map(() => equal) };
}

function renderParticipantChips() {
    const selector = document.getElementById('memberSelector');
    if (!selector) return;

    let html = members.map(m =>
        `<div class="member-chip ${selectedParticipants.includes(m) ? 'active' : ''}" onclick="toggleParticipant('${m}')">${m}</div>`
    ).join('');

    if (selectedParticipants.length > 1) {
        html += `
            <div class="payer-split-toggle">
                <label>
                    <input type="checkbox" id="participantEqualSplitCheck" ${participantEqualSplit ? 'checked' : ''} onchange="toggleParticipantEqualSplit()">
                    均分
                </label>
            </div>`;

        if (!participantEqualSplit) {
            html += `<div class="payer-amounts">` +
                selectedParticipants.map(p =>
                    `<div class="payer-amount-row">
                        <span class="payer-amount-name">${p}</span>
                        <input type="number" class="participant-amount-input" data-participant="${p}" placeholder="$" oninput="updateParticipantAmountHint()">
                    </div>`
                ).join('') +
                `<div class="payer-amount-hint" id="participantAmountHint"></div>` +
            `</div>`;
        }
    }

    selector.innerHTML = html;
    updateParticipantLabel();
}

function toggleParticipantEqualSplit() {
    participantEqualSplit = document.getElementById('participantEqualSplitCheck').checked;
    renderParticipantChips();
}

function updateParticipantAmountHint() {
    const totalInput = parseFloat(document.getElementById('itemAmount').value) || 0;
    const filled = Array.from(document.querySelectorAll('.participant-amount-input'))
        .reduce((sum, el) => sum + (parseFloat(el.value) || 0), 0);
    const remaining = Math.round((totalInput - filled) * 100) / 100;
    const hint = document.getElementById('participantAmountHint');
    if (!hint) return;
    hint.textContent = remaining === 0 ? '✓ 金額已分配完畢' : `剩餘未分配：$${remaining}`;
    hint.style.color = remaining === 0 ? 'var(--success)' : 'var(--danger)';
}

function render() {
    renderParticipantChips();
    renderPayerChips();

    const list = document.getElementById('expenseList');
    list.innerHTML = '';
    document.getElementById('settlementReport').innerHTML = '';

    if (expenses.length === 0) {
        document.body.classList.add('has-no-data');
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <p>目前還沒有任何帳目喔！</p>
                <span>快在上方輸入第一筆支出吧</span>
            </div>
        `;
        return;
    }

    document.body.classList.remove('has-no-data');

    // 計算每人結餘
    const balances = {};
    members.forEach(m => balances[m] = 0);
    expenses.forEach(item => {
        const { payers: ip, amounts: ia } = getPayerAmounts(item);
        ip.forEach((p, i) => { if (balances[p] !== undefined) balances[p] += ia[i]; });

        const { participants: iparts, amounts: partAmounts } = getParticipantAmounts(item);
        iparts.forEach((p, i) => { if (balances[p] !== undefined) balances[p] -= partAmounts[i]; });
    });

    // 計算結清建議
    const creditors = [];
    const debtors = [];
    for (const name in balances) {
        const bal = balances[name];
        if (bal > 0.01) creditors.push({ name, amount: Math.ceil(bal) });
        if (bal < -0.01) debtors.push({ name, amount: Math.ceil(-bal) });
    }

    const transactions = [];
    while (creditors.length && debtors.length) {
        const creditor = creditors[0];
        const debtor = debtors[0];
        const amount = Math.min(creditor.amount, debtor.amount);
        transactions.push({ from: debtor.name, to: creditor.name, amount });
        creditor.amount -= amount;
        debtor.amount -= amount;
        if (creditor.amount === 0) creditors.shift();
        if (debtor.amount === 0) debtors.shift();
    }

    document.getElementById('settlementReport').innerHTML = transactions.length === 0
        ? '<div class="report-item">✅ 大家都結清了！</div>'
        : transactions.map(t => `
            <div class="report-item">
                <span><b>${t.from}</b> → <b>${t.to}</b></span>
                <span class="status-minus">付 $${t.amount}</span>
            </div>
        `).join('');

    // 計算代墊與應付
    const paid = {};
    const spent = {};
    members.forEach(m => { paid[m] = 0; spent[m] = 0; });
    expenses.forEach(item => {
        const { payers: ip, amounts: ia } = getPayerAmounts(item);
        ip.forEach((p, i) => { if (paid[p] !== undefined) paid[p] += ia[i]; });

        const { participants: iparts, amounts: partAmounts } = getParticipantAmounts(item);
        iparts.forEach((p, i) => { if (spent[p] !== undefined) spent[p] += partAmounts[i]; });
    });

    const totalAmount = expenses.reduce((sum, item) => sum + parseFloat(item.amount), 0);

    document.getElementById('detailReport').innerHTML = `
        <div class="detail-table">
            <div class="detail-header">
                <span>姓名</span>
                <span>代墊</span>
                <span>應付</span>
                <span>結餘</span>
            </div>
            ${members.map(m => {
                const balance = paid[m] - spent[m];
                return `
                <div class="detail-row">
                    <span>${m}</span>
                    <span>$${Math.round(paid[m])}</span>
                    <span>$${spent[m].toFixed(1)}</span>
                    <span class="${balance > 0 ? 'status-plus' : balance < 0 ? 'status-minus' : ''}">
                        ${balance > 0 ? '+' : ''}$${balance.toFixed(1)}
                    </span>
                </div>`;
            }).join('')}
            <div class="detail-footer">
                <span><b>總計</b></span>
                <span><b>$${Math.round(totalAmount)}</b></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;

    // 按日期分組渲染帳目列表
    const grouped = {};
    expenses.forEach(item => {
        const date = item.date || '未知日期';
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(item);
    });

    const rows = [];
    Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(date => {
        rows.push(`<div class="date-group-header">${date}</div>`);
        grouped[date].forEach(item => {
            const { payers: ip, amounts: ia } = getPayerAmounts(item);
            const { participants: iparts, amounts: partAmounts } = getParticipantAmounts(item);

            const payerEq = ip.every((_, i) => Math.abs(ia[i] - ia[0]) < 0.01);
            const partEq = iparts.every((_, i) => Math.abs(partAmounts[i] - partAmounts[0]) < 0.01);

            const payerStr = payerEq
                ? `<b>${ip.join('、')}</b>`
                : ip.map((p, i) => `<b>${p}</b> $${Math.round(ia[i])}`).join('、');

            const partStr = partEq
                ? iparts.join('、')
                : iparts.map((p, i) => `<b>${p}</b> $${Math.round(partAmounts[i])}`).join('、');

            rows.push(`<div class="list-item">
                <div class="item-info">
                    <div class="item-desc">${item.description}</div>
                    <div class="item-sub">買單：${payerStr}<br>${iparts.length} 人${partEq ? '均分' : '分攤'}：${partStr}</div>
                </div>
                <div class="item-price">$${Math.round(item.amount)}<span class="delete-btn" onclick="deleteItem(${item.id}, '${item.description}')">×</span></div>
            </div>`);
        });
    });
    list.innerHTML = rows.join('');
}

function switchTab(tab, e) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    document.getElementById('settlementReport').style.display = tab === 'settlement' ? 'block' : 'none';
    document.getElementById('detailReport').style.display = tab === 'detail' ? 'block' : 'none';
}

function renderPayerChips() {
    const payerSelector = document.getElementById('payerSelector');
    if (!payerSelector) return;

    let html = members.map(m =>
        `<div class="payer-chip member-chip ${selectedPayers.includes(m) ? 'active' : ''}" onclick="togglePayer('${m}')">${m}</div>`
    ).join('');

    if (selectedPayers.length > 1) {
        html += `
            <div class="payer-split-toggle">
                <label>
                    <input type="checkbox" id="payerEqualSplitCheck" ${payerEqualSplit ? 'checked' : ''} onchange="togglePayerEqualSplit()">
                    均分
                </label>
            </div>`;

        if (!payerEqualSplit) {
            html += `<div class="payer-amounts">` +
                selectedPayers.map(p =>
                    `<div class="payer-amount-row">
                        <span class="payer-amount-name">${p}</span>
                        <input type="number" class="payer-amount-input" data-payer="${p}" placeholder="$" oninput="updatePayerAmountHint()">
                    </div>`
                ).join('') +
                `<div class="payer-amount-hint" id="payerAmountHint"></div>` +
            `</div>`;
        }
    }

    payerSelector.innerHTML = html;
    updatePayerLabel();
}

function togglePayer(name) {
    if (selectedPayers.includes(name)) {
        if (selectedPayers.length > 1) selectedPayers = selectedPayers.filter(p => p !== name);
    } else {
        selectedPayers.push(name);
    }
    renderPayerChips();
}

function togglePayerEqualSplit() {
    payerEqualSplit = document.getElementById('payerEqualSplitCheck').checked;
    renderPayerChips();
}

function updatePayerAmountHint() {
    const totalInput = parseFloat(document.getElementById('itemAmount').value) || 0;
    const filled = Array.from(document.querySelectorAll('.payer-amount-input'))
        .reduce((sum, el) => sum + (parseFloat(el.value) || 0), 0);
    const remaining = Math.round((totalInput - filled) * 100) / 100;
    const hint = document.getElementById('payerAmountHint');
    if (!hint) return;
    hint.textContent = remaining === 0 ? '✓ 金額已分配完畢' : `剩餘未分配：$${remaining}`;
    hint.style.color = remaining === 0 ? 'var(--success)' : 'var(--danger)';
}

function updatePayerLabel() {
    const count = selectedPayers.length;
    const label = count <= 1 ? '付款人（可複選）'
        : payerEqualSplit ? `付款人（已選 ${count} 人，均分）`
        : `付款人（已選 ${count} 人，自訂金額）`;
    document.getElementById('payerLabel').innerText = label;
}

function updateParticipantLabel() {
    const count = selectedParticipants.length;
    const label = count <= 1 ? `分攤成員（已選 ${count} 人）`
        : participantEqualSplit ? `分攤成員（已選 ${count} 人，均分）`
        : `分攤成員（已選 ${count} 人，自訂金額）`;
    document.getElementById('participantLabel').innerText = label;
}

function toggleParticipant(name) {
    selectedParticipants = selectedParticipants.includes(name)
        ? selectedParticipants.filter(m => m !== name)
        : [...selectedParticipants, name];
    renderParticipantChips();
}

async function clearData() {
    if (confirm("⚠️ 警告：這會刪除所有行程與帳目，且無法復原！確定要清空嗎？")) {
        await _supabase.from('expenses').delete().gt('id', 0);
        await _supabase.from('events').delete().gt('id', 0);

        currentEventId = '';
        expenses = [];
        members = [];
        selectedParticipants = [];

        alert("雲端資料已清空！頁面將自動重新整理。");
        location.reload();
    }
}

document.getElementById('editNewMember').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') addEditMember();
});

document.getElementById('modalNewMember').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') addModalMember();
});

// PWA 安裝
let _installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _installPrompt = e;
    document.getElementById('installBtn').style.display = 'block';
});

async function installApp() {
    if (!_installPrompt) return;
    _installPrompt.prompt();
    const { outcome } = await _installPrompt.userChoice;
    if (outcome === 'accepted') {
        document.getElementById('installBtn').style.display = 'none';
        _installPrompt = null;
    }
}

window.addEventListener('appinstalled', () => {
    document.getElementById('installBtn').style.display = 'none';
    _installPrompt = null;
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
}
