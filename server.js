const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// Cargar bases de datos locales
const rolesData = JSON.parse(fs.readFileSync('./data/roles.json'));
const impostorWords = JSON.parse(fs.readFileSync('./data/impostor_words.json'));
const triviaQuestions = JSON.parse(fs.readFileSync('./data/trivia_questions.json'));

const rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function assignRolesWitchHunt(players) {
  const count = players.length;
  let numWitches = count >= 8 ? 2 : 1;
  let rolesPool = Array(numWitches).fill('Bruja');
  rolesPool.push('Cazador');
  if (count >= 6) rolesPool.push('Guardián');
  if (count >= 7) rolesPool.push('Juez');
  while (rolesPool.length < count) rolesPool.push('Aldeano');

  for (let i = rolesPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rolesPool[i], rolesPool[j]] = [rolesPool[j], rolesPool[i]];
  }

  players.forEach((p, idx) => {
    p.role = rolesPool[idx];
    p.alive = true;
  });
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ playerName, avatar }) => {
    const code = generateRoomCode();
    rooms[code] = {
      code,
      host: socket.id,
      state: 'LOBBY',
      players: [{ id: socket.id, name: playerName, avatar: avatar || '🎮', role: null, alive: true }]
    };
    socket.join(code);
    socket.emit('roomCreated', { roomCode: code, room: rooms[code] });
  });

  // Voto para reiniciar partida
  socket.on('requestReplay', () => {
    const roomId = socket.roomId; // Asumiendo que guardas el roomId en el socket
    const room = rooms[roomId];

    if (!room) return;

    if (!room.replayVotes) {
      room.replayVotes = new Set();
    }

    room.replayVotes.add(socket.id);

    // Notificar avance de votos a la sala
    io.to(roomId).emit('replayVoteUpdate', {
      votes: room.replayVotes.size,
      totalPlayers: room.players.length
    });

    // Si todos los jugadores votaron reiniciar
    if (room.replayVotes.size >= room.players.length) {
      room.replayVotes.clear();
      
      // Reiniciar estado interno del juego
      room.gameState = resetGameState(room.players);

      // Emitir orden de reinicio a todos los clientes de la sala
      io.to(roomId).emit('restartGame', room.gameState);
    }
  });

  // Salir de la sala
  socket.on('leaveRoom', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];

    if (room) {
      // Remover jugador de la lista
      room.players = room.players.filter(p => p.id !== socket.id);
      socket.leave(roomId);
      socket.roomId = null;

      // Limpiar sala si queda vacía
      if (room.players.length === 0) {
        delete rooms[roomId];
      } else {
        // Notificar a los jugadores restantes la salida
        io.to(roomId).emit('playerLeft', { playerId: socket.id });
      }
    }
  });

  socket.on('joinRoom', ({ roomCode, playerName, avatar }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];
    if (!room) return socket.emit('errorMsg', 'La sala no existe.');
    if (room.state !== 'LOBBY') return socket.emit('errorMsg', 'La partida ya inició.');

    room.players.push({ id: socket.id, name: playerName, avatar: avatar || '🎲', role: null, alive: true });
    socket.join(code);
    io.to(code).emit('roomUpdated', room);
  });

  socket.on('startGame', ({ roomCode, gameId, timer }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.state = 'PLAYING';

    if (gameId === 'witch_hunt') {
      assignRolesWitchHunt(room.players);
      io.to(roomCode).emit('gameStarted', { gameId, desc: 'Caza de Brujas: Revisa tu rol secreto.', timer: timer || 60 });
      room.players.forEach(p => {
        const roleInfo = rolesData.find(r => r.role === p.role);
        io.to(p.id).emit('privateRole', { role: p.role, info: roleInfo });
      });
    } else if (gameId === 'impostor') {
      const pair = impostorWords[Math.floor(Math.random() * impostorWords.length)];
      const impostorIdx = Math.floor(Math.random() * room.players.length);
      io.to(roomCode).emit('gameStarted', { gameId, desc: 'El Impostor: Encuentra a quien miente.', timer: timer || 60 });
      room.players.forEach((p, idx) => {
        const isImpostor = idx === impostorIdx;
        io.to(p.id).emit('privateWord', {
          word: isImpostor ? "¡ERES EL IMPOSTOR!" : pair.pair[0],
          isImpostor
        });
      });
    } else if (gameId === 'time_bomb') {
      const question = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
      io.to(roomCode).emit('gameStarted', { gameId, desc: `Bomba de Tiempo: ${question}`, timer: 30 });
    }
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        if (room.players.length === 0) delete rooms[code];
        else io.to(code).emit('roomUpdated', room);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[PARTY CHAOS] Servidor ejecutándose en puerto ${PORT}`);
});