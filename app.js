// SUPABASE INITIALIZATION
const SUPABASE_URL = "https://gglpmgfopukzskedsijd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_fvAtS8_-Yrk8viNFZGUR4w_6PaCKdh_";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentTeam = null;
let pphLogs = [];

// AUTHENTICATION LISTENERS
document.getElementById('btn-login').addEventListener('click', handleLogin);
document.getElementById('btn-signup').addEventListener('click', handleSignUp);

async function handleSignUp() {
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const fullName = document.getElementById('auth-fullname').value;

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return alert("Signup failed: " + error.message);

  if (data.user) {
    await supabase.from('team_members').insert([{ id: data.user.id, email, full_name: fullName }]);
    alert("Signup successful! Please select your team next.");
    initApp(data.user);
  }
}

async function handleLogin() {
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return alert("Login failed: " + error.message);

  initApp(data.user);
}

async function initApp(user) {
  currentUser = user;
  document.getElementById('auth-screen').classList.add('hidden');
  
  const { data: member } = await supabase.from('team_members').select('*').eq('id', user.id).single();
  const userName = member ? member.full_name : user.email;
  document.getElementById('user-display-name').innerText = userName;
  document.getElementById('user-badge').innerText = `👤 ${userName}`;

  document.getElementById('team-select-screen').classList.remove('hidden');
}

function selectTeam(teamName) {
  currentTeam = teamName;
  document.getElementById('team-select-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  document.getElementById('current-team-title').innerText = `${teamName} Workspace`;

  loadTeamData();
  subscribeToChat();
}

function switchTeam() {
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('team-select-screen').classList.remove('hidden');
}

async function logout() {
  await supabase.auth.signOut();
  location.reload();
}

// -------------------------------------------------------------
// 1. PPH CALCULATOR LOGIC
// -------------------------------------------------------------
async function calculatePPH() {
  const lines = parseFloat(document.getElementById('pph-lines').value) || 0;
  const mins = parseFloat(document.getElementById('pph-mins').value) || 0;
  const secs = parseFloat(document.getElementById('pph-secs').value) || 0;

  const totalSeconds = (mins * 60) + secs;
  if (totalSeconds <= 0 || lines <= 0) return alert("Please enter valid lines and time.");

  const pph = (lines / totalSeconds) * 3600;
  document.getElementById('latest-pph').innerText = pph.toFixed(1);

  pphLogs.push({ lines, seconds: totalSeconds, pph });
  await supabase.from('pph_logs').insert([{ user_id: currentUser.id, lines, seconds: totalSeconds, pph }]);

  updateCumulativePPH();
  renderPPHLogs();
}

function updateCumulativePPH() {
  if (pphLogs.length === 0) return;
  const totalLines = pphLogs.reduce((acc, curr) => acc + curr.lines, 0);
  const totalSecs = pphLogs.reduce((acc, curr) => acc + curr.seconds, 0);

  const cumulativePPH = (totalLines / totalSecs) * 3600;
  document.getElementById('cumulative-pph').innerText = cumulativePPH.toFixed(1);
}

function renderPPHLogs() {
  const list = document.getElementById('pph-log-list');
  list.innerHTML = pphLogs.map((log, index) => 
    `<li>Batch ${index + 1}: ${log.lines} lines in ${Math.floor(log.seconds / 60)}m ${log.seconds % 60}s ➔ <strong>${log.pph.toFixed(1)} PPH</strong></li>`
  ).join('');
}

// -------------------------------------------------------------
// 2. COACHING SCHEDULE & BULK IMPORT
// -------------------------------------------------------------
async function bulkImportCoaching() {
  const input = document.getElementById('csv-coaching-input').value.trim();
  if (!input) return alert("Please paste CSV entries.");

  const team_id = await awaitGetTeamId();
  const lines = input.split('\n');
  const records = [];

  lines.forEach(line => {
    const parts = line.split(',').map(s => s.trim());
    if (parts.length >= 4) {
      records.push({ team_id, member_name: parts[0], schedule_date: parts[1], time_slot: parts[2], topic: parts[3] });
    }
  });

  if (records.length === 0) return alert("Invalid CSV format. Use: Name, YYYY-MM-DD, Time, Topic");

  const { error } = await supabase.from('coaching_schedules').insert(records);
  if (error) alert("Error importing: " + error.message);
  else {
    alert("Bulk import completed!");
    document.getElementById('csv-coaching-input').value = "";
    loadCoachingSchedules();
  }
}

async function loadCoachingSchedules() {
  const team_id = await awaitGetTeamId();
  const { data } = await supabase.from('coaching_schedules').select('*').eq('team_id', team_id);
  const tbody = document.getElementById('coaching-table-body');
  tbody.innerHTML = (data || []).map(row => `
    <tr>
      <td>${row.member_name}</td>
      <td>${row.schedule_date}</td>
      <td>${row.time_slot}</td>
      <td>${row.topic}</td>
    </tr>
  `).join('');
}

// -------------------------------------------------------------
// 3. IC EXTENSION REPORT LOGIC
// -------------------------------------------------------------
async function addICReport() {
  const member_name = document.getElementById('ic-member').value;
  const status = document.getElementById('ic-status').value;
  const reason = document.getElementById('ic-reason').value;

  if (!member_name) return alert("Enter member name");

  const team_id = await awaitGetTeamId();
  await supabase.from('ic_extensions').insert([{ team_id, member_name, status, reason }]);
  
  document.getElementById('ic-member').value = "";
  document.getElementById('ic-reason').value = "";
  loadICReports();
}

async function loadICReports() {
  const team_id = await awaitGetTeamId();
  const { data } = await supabase.from('ic_extensions').select('*').eq('team_id', team_id);
  
  const extendedList = document.getElementById('ic-extended-list');
  const requiredList = document.getElementById('ic-required-list');

  extendedList.innerHTML = '';
  requiredList.innerHTML = '';

  (data || []).forEach(item => {
    const li = `<li><strong>${item.member_name}</strong> - ${item.reason}</li>`;
    if (item.status === 'Extended') extendedList.innerHTML += li;
    else requiredList.innerHTML += li;
  });
}

let cachedTeamId = null;
async function awaitGetTeamId() {
  if (cachedTeamId) return cachedTeamId;
  const { data } = await supabase.from('teams').select('id').eq('name', currentTeam).single();
  cachedTeamId = data ? data.id : null;
  return cachedTeamId;
}

// -------------------------------------------------------------
// 4. TEAM CHAT BUBBLE LOGIC (REAL-TIME)
// -------------------------------------------------------------
function toggleChat() {
  document.getElementById('chat-window').classList.toggle('hidden');
}

function handleChatKey(e) {
  if (e.key === 'Enter') sendChatMessage();
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  const sender_name = document.getElementById('user-display-name').innerText;
  const team_id = await awaitGetTeamId();

  await supabase.from('team_chats').insert([{ team_id, user_id: currentUser.id, sender_name, message }]);
  input.value = '';
}

async function loadChatMessages() {
  const team_id = await awaitGetTeamId();
  const { data } = await supabase.from('team_chats').select('*').eq('team_id', team_id).order('created_at', { ascending: true });
  
  const chatBody = document.getElementById('chat-messages');
  chatBody.innerHTML = (data || []).map(m => `
    <div class="chat-message">
      <div class="chat-sender">${m.sender_name}</div>
      <div>${m.message}</div>
    </div>
  `).join('');
  chatBody.scrollTop = chatBody.scrollHeight;
}

function subscribeToChat() {
  loadChatMessages();
  supabase
    .channel('public:team_chats')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_chats' }, payload => {
      if (payload.new.team_id === cachedTeamId) {
        loadChatMessages();
      }
    })
    .subscribe();
}

async function loadTeamData() {
  cachedTeamId = null;
  loadCoachingSchedules();
  loadICReports();
}
