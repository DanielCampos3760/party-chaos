const socket = io();
let currentRoom = null;
let timerInterval = null;

const endgameModal = document.getElementById('endgame-modal');
const winnerText = document.getElementById('winner-text');
const btnReplay = document.getElementById('btn-replay');
const btnExit = document.getElementById('btn-exit');
const replayStatus = document.getElementById('replay-status');

function createRoom() {
  const name = document.getElementById('player-name').value.trim();
  const avatar = document.getElementById('player-avatar').value;
  if (!name) return alert('Ingresa tu nombre.');
  socket.emit('createRoom', { playerName: name, avatar });
}

function joinRoom() {
  const name = document.getElementById('player-name').value.trim();
  const avatar = document.getElementById('player-avatar').value;
  const code = document.getElementById('room-code').value.trim().toUpperCase();
  if (!name || !code) return alert('Completa los campos.');
  socket.emit('joinRoom', { roomCode: code, playerName: name, avatar });
}

function startGame() {
  const gameId = document.getElementById('game-select').value;
  const timer = parseInt(document.getElementById('game-timer').value);
  socket.emit('startGame', { roomCode: currentRoom, gameId, timer });
}

socket.on('roomCreated', ({ roomCode, room }) => {
  currentRoom = roomCode;
  document.getElementById('display-code').innerText = roomCode;
  document.getElementById('login-card').classList.add('hidden');
  document.getElementById('lobby-card').classList.remove('hidden');
  document.getElementById('host-controls').classList.remove('hidden');
  updatePlayers(room.players);
});

socket.on('roomUpdated', (room) => {
  currentRoom = room.code;
  document.getElementById('display-code').innerText = room.code;
  document.getElementById('login-card').classList.add('hidden');
  document.getElementById('lobby-card').classList.remove('hidden');
  updatePlayers(room.players);
});

socket.on('gameStarted', ({ gameId, desc, timer }) => {
  document.getElementById('lobby-card').classList.add('hidden');
  document.getElementById('game-card').classList.remove('hidden');
  document.getElementById('game-title').innerText = gameId.replace('_', ' ').toUpperCase();
  document.getElementById('game-desc').innerText = desc;
  if (timer) startCountdown(timer);
});

socket.on('privateRole', ({ role, info }) => {
  document.getElementById('secret-box').innerHTML = `
    <div style="font-size: 0.9rem; color: var(--subtext);">TU ROL SECRETO:</div>
    <div style="font-size: 1.5rem; font-weight: 800; color: #a855f7; margin: 4px 0;">${role}</div>
    <div>${info ? info.description : ''}</div>
  `;
});

socket.on('privateWord', ({ word, isImpostor }) => {
  document.getElementById('secret-box').innerHTML = `
    <div style="font-size: 0.9rem; color: var(--subtext);">TU PALABRA CLAVE:</div>
    <div style="font-size: 1.5rem; font-weight: 800; color: ${isImpostor ? '#ef4444' : '#10b981'}; margin: 4px 0;">${word}</div>
  `;
});

socket.on('errorMsg', (msg) => alert(msg));

function updatePlayers(players) {
  document.getElementById('players-list').innerHTML = players.map(p => `<span class="player-badge">${p.avatar} ${p.name}</span>`).join('');
}

function startCountdown(seconds) {
  clearInterval(timerInterval);
  let left = seconds;
  const display = document.getElementById('game-timer-display');
  display.innerText = left + 's';
  timerInterval = setInterval(() => {
    left--;
    display.innerText = left + 's';
    if (left <= 0) {
      clearInterval(timerInterval);
      display.innerText = '¡TIEMPO!';
    }
  }, 1000);
}

// 1. Recibir evento de fin de juego desde el servidor
socket.on('gameOver', (data) => {
  winnerText.innerText = `El ganador es: ${data.winnerName}`;
  replayStatus.innerText = '';
  btnReplay.disabled = false;
  endgameModal.classList.remove('hidden');
});

// 2. Evento Botón: Jugar otra vez
btnReplay.addEventListener('click', () => {
  btnReplay.disabled = true;
  replayStatus.innerText = 'Esperando a que los demás jugadores acepten...';
  socket.emit('requestReplay');
});

// 3. Evento Botón: Salir al menú
btnExit.addEventListener('click', () => {
  endgameModal.classList.add('hidden');
  socket.emit('leaveRoom');
  // Redirigir al menú principal de tu app
  showScreen('main-menu-screen'); 
});

// 4. Escuchar reinicio de partida enviado por el servidor
socket.on('restartGame', (initialGameState) => {
  endgameModal.classList.add('hidden');
  // Función existente para renderizar el tablero desde cero
  initBoard(initialGameState); 
});

// 5. Notificación de actualización de votos de reinicio
socket.on('replayVoteUpdate', (data) => {
  replayStatus.innerText = `Votos para reiniciar: ${data.votes} / ${data.totalPlayers}`;
});