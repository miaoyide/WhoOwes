const SUPABASE_URL = 'https://naagujwufjeqsgwmyrcv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hYWd1and1ZmplcXNnd215cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjc0MTcsImV4cCI6MjA4ODkwMzQxN30.6MFjNVe2zz1lwGVYx9BSFco7hEZTjvBueGQABrq1apM';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const PRESET_MEMBERS = ["ㄉ","ㄊ","ㄌ","ㄐㄅ","ㄅㄐ","ㄌㄇ","ㄩ","ㄏ"];

let currentEventId = '';
let expenses = [];
let members = [];
let selectedParticipants = [...members];
let isDeleting = false;
let modalMembers = [];
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
            <button class="delete-event-btn" title="刪除行程">×</button>
            <div class="event-card-content">
                <h3>${trip.name}</h3>
                <p class="event-card-meta">${count} 筆消費・總計 $${Math.round(total)}</p>
            </div>
        `;
        card.querySelector('.event-card-content').onclick = () => enterEvent(trip.id);
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

function promptNewEvent() {
    modalMembers = [];
    const container = document.getElementById('modalMemberChips');
    container.innerHTML = PRESET_MEMBERS.map(name => `
        <div class="member-chip active" onclick="this.classList.toggle('active')">${name}</div>
    `).join('');
    document.getElementById('newEventName').value = '';
    document.getElementById('modalNewMember').value = '';
    document.getElementById('newEventModal').style.display = 'flex';
    setTimeout(() => document.getElementById('newEventName').focus(), 100);
}

function addModalMember() {
    const input = document.getElementById('modalNewMember');
    const name = input.value.trim();
    if (!name) return;

    const savedMembers = JSON.parse(localStorage.getItem('whoowes_preset_members') || '[]');
    if (savedMembers.includes(name) || modalMembers.includes(name)) {
        alert('這個名字已經存在囉！');
        return;
    }

    modalMembers.push(name);
    input.value = '';

    const container = document.getElementById('modalMemberChips');
    const chip = document.createElement('div');
    chip.className = 'member-chip active';
    chip.innerText = name;
    chip.onclick = function() { this.classList.toggle('active'); };
    container.appendChild(chip);
}

function closeNewEventModal() {
    document.getElementById('newEventModal').style.display = 'none';
}

async function confirmNewEvent() {
    const name = document.getElementById('newEventName').value.trim();
    if (!name) return alert('請輸入行程名稱');

    const selectedMembers = Array.from(document.querySelectorAll('#modalMemberChips .member-chip.active'))
        .map(chip => chip.innerText);

    closeNewEventModal();

    const { data, error } = await _supabase
        .from('events')
        .insert([{ name, members: selectedMembers }])
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

    render();
    hideLoading();
}

async function addExpense() {
    const btn = document.getElementById('submitBtn');
    const payer = document.getElementById('itemPayerSelect').value;
    const desc = document.getElementById('itemDesc').value.trim();
    const amount = parseFloat(document.getElementById('itemAmount').value);
    const date = document.getElementById('itemDate').value;
    const participants = Array.from(document.querySelectorAll('.member-chip.active'))
        .map(chip => chip.innerText);

    if (!desc || isNaN(amount)) return alert("請填寫項目與金額");
    if (!currentEventId) return alert("請先選擇一個行程");
    if (participants.length === 0) return alert("請至少選擇一位分攤成員");

    btn.disabled = true;
    btn.innerText = "同步中...";

    const { error } = await _supabase
        .from('expenses')
        .insert([{ description: desc, amount, payer, participants, date, event_id: currentEventId }]);

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

function render() {
    const selector = document.getElementById('memberSelector');
    selector.innerHTML = members.map(m =>
        `<div class="member-chip ${selectedParticipants.includes(m) ? 'active' : ''}" onclick="toggleParticipant('${m}')">${m}</div>`
    ).join('');

    updateParticipantLabel();

    const payerSelect = document.getElementById('itemPayerSelect');
    const prev = payerSelect.value;
    payerSelect.innerHTML = members.map(m => `<option value="${m}" ${m === prev ? 'selected' : ''}>${m}</option>`).join('');

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
        if (balances[item.payer] !== undefined) balances[item.payer] += parseFloat(item.amount);
        const perPerson = item.amount / item.participants.length;
        item.participants.forEach(p => {
            if (balances[p] !== undefined) balances[p] -= perPerson;
        });
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
        if (paid[item.payer] !== undefined) paid[item.payer] += parseFloat(item.amount);
        const perPerson = parseFloat(item.amount) / item.participants.length;
        item.participants.forEach(p => {
            if (spent[p] !== undefined) spent[p] += perPerson;
        });
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
            rows.push(`<div class="list-item">
                <div class="item-info">
                    <div class="item-desc">${item.description}</div>
                    <div class="item-sub">買單：<b>${item.payer}</b> <br> ${item.participants.length} 人分攤: ${item.participants.join(', ')}</div>
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

function updateParticipantLabel() {
    document.getElementById('participantLabel').innerText = `分攤成員（已選 ${selectedParticipants.length} 人）`;
}

function toggleParticipant(name) {
    selectedParticipants = selectedParticipants.includes(name)
        ? selectedParticipants.filter(m => m !== name)
        : [...selectedParticipants, name];
    render();
    updateParticipantLabel();
}

async function addNewMember() {
    const input = document.getElementById('newMemberName');
    const name = input.value.trim();
    if (!name) return;

    if (members.includes(name)) {
        alert('這個名字已經存在囉！');
        return;
    }

    members.push(name);
    selectedParticipants.push(name);
    input.value = '';

    await _supabase
        .from('events')
        .update({ members })
        .eq('id', currentEventId);

    render();
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

document.getElementById('newMemberName').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') addNewMember();
});
