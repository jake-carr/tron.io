const path = require('path');
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const port = 3000;

// Server
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static(path.join(__dirname, '/public/')));

server.listen(port, () => {
  console.log(`Server is up on port ${port}.`);
});

// Global list of rooms (called lobbies on front-end)
const rooms = {};

/**
 * Will make the socket leave any rooms that it is a part of
 * @param socket A connected socket.io socket
 */
const leaveRooms = (socket) => {
  const roomsToDelete = [];
  for (const id in rooms) {
    const room = rooms[id];
    // check to see if the socket is in the current room
    if (room.socketIds.includes(socket.id)) {
      socket.leave(id);
      // remove the socket from the room object
      room.socketIds = room.socketIds.filter((i) => i !== socket.id);
    }
    // Prepare to delete any rooms that are now empty
    if (room.socketIds.length == 0) {
      roomsToDelete.push(room);
    }
  }

  // Delete all the empty rooms
  for (const room of roomsToDelete) {
    delete rooms[room.id];
  }
};

// Socket.io
io.on('connection', (socket) => {
  console.log(`User ${socket.id} connected to the server.`);

  /**
   * Fire the game if the lobby has two connected players.
   */
  socket.on('GAME_START_REQUEST', (roomId, host, guest) => {
    const room = rooms[roomId];
    const connections = room.socketIds;
    if (!room) return;
    if (
      connections.includes(host.socketID) &&
      connections.includes(guest.socketID)
    ) {
      io.in(room.name).emit('GAME_START', host, guest);
    }
  });

  /**
   * Quick fire a new game in an existing lobby, with current names & most recent score.
   */

  socket.on('GAME_RESTART_REQUEST', (roomId, gameState) => {
    const room = rooms[roomId];
    if (!room) return;

    io.in(room.name).emit('GAME_RESTART', gameState);
  });

  socket.on('GAME_UPDATE', (roomId, gameState) => {
    // Recieves true game state from host client on an interval and emits it to the lobby.
    const room = rooms[roomId];
    if (!room) return;

    io.in(room.name).emit('GAME_TICK', gameState);
  });

  /**
   * Handles incoming direction change requests
   * @param isRed whether they are the host of their room;
   * @param direction string 'LEFT', 'RIGHT', 'UP' or 'DOWN'
   * Emits updated game state with the player's new direction
   */
  socket.on(
    'directionChange',
    (roomId, isRed, gameState, direction) => {
      const room = rooms[roomId];
      if (!room) return;

      const { red, blue } = gameState;
      let gameUpdate = { ...gameState };

      if (isRed) {
        if (red.isTurning) {
          return;
        }
        red.isTurning = true;

        let dx = red.dx;
        let dy = red.dy;

        const goingUp = dy === -10;
        const goingDown = dy === 10;
        const goingRight = dx === 10;
        const goingLeft = dx === -10;

        if (direction === 'LEFT' && !goingRight) {
          gameUpdate.red.dx = -10;
          gameUpdate.red.dy = 0;
        }
        if (direction === 'UP' && !goingDown) {
          gameUpdate.red.dx = 0;
          gameUpdate.red.dy = -10;
        }
        if (direction === 'RIGHT' && !goingLeft) {
          gameUpdate.red.dx = 10;
          gameUpdate.red.dy = 0;
        }
        if (direction === 'DOWN' && !goingUp) {
          gameUpdate.red.dx = 0;
          gameUpdate.red.dy = 10;
        }
      } else {
        if (blue.isTurning) {
          return;
        }
        blue.isTurning = true;

        let dx = blue.dx;
        let dy = blue.dy;

        const goingUp = dy === -10;
        const goingDown = dy === 10;
        const goingRight = dx === 10;
        const goingLeft = dx === -10;

        if (direction === 'LEFT' && !goingRight) {
          gameUpdate.blue.dx = -10;
          gameUpdate.blue.dy = 0;
        }
        if (direction === 'UP' && !goingDown) {
          gameUpdate.blue.dx = 0;
          gameUpdate.blue.dy = -10;
        }
        if (direction === 'RIGHT' && !goingLeft) {
          gameUpdate.blue.dx = 10;
          gameUpdate.blue.dy = 0;
        }
        if (direction === 'DOWN' && !goingUp) {
          gameUpdate.blue.dx = 0;
          gameUpdate.blue.dy = 10;
        }
      }

      io.in(room.name).emit('GAME_TICK', gameUpdate);
    },
  );

  /**
   * Handles the game ending.
   */
  socket.on('GAME_END_NOTICE', (roomId, { winner, reason }) => {
    const room = rooms[roomId];
    if (!room) return;

    console.log(`Game in ${room.name} is ending!`);
    console.log(`Winner: ${winner}`);
    console.log(`Reason: ${reason}`);

    io.in(room.name).emit('GAME_END', { winner, reason });
  });

  /**
   * Gets fired when someone wants to get the list of rooms
   */
  socket.on('getRoomNames', (callback) => {
    const roomNames = [];
    for (const id in rooms) {
      const { name } = rooms[id];
      const room = { name, id };
      roomNames.push(room);
    }

    callback(roomNames);
  });

  /**
   * Gets fired when a user wants to create a new room.
   * Optional @param roomName; defaults to a random unique name if none provided.
   */
  socket.on('createRoom', (roomName = uuidv4(), user, callback) => {
    const room = {
      id: uuidv4(),
      name: roomName,
      socketIds: [],
      host: {
        socketId: socket.id,
        name: user.username,
        user: user,
      },
      isHost: function (id) {
        return id == host.socketId;
      },
    };
    socket.username = user.username;

    rooms[room.id] = room;
    console.log(`User ${socket.username} created room ${roomName}`);

    // have the socket join the room they've just created.
    socket.join(room.name);
    socket.roomId = room.id;
    room.socketIds.push(socket.id);

    console.log(`User ${socket.username} joined ${roomName}`);
    callback(room);
  });

  /**
   * Gets fired when a player has joined a room.
   */
  socket.on('joinRoom', (roomId, callback) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.socketIds.length == 2) {
      callback('Error: Room Full');
    } else {
      socket.join(room.name);
      room.socketIds.push(socket.id);
      callback(room);
    }
  });

  socket.on('guestJoinedOrLeft', (roomId, guest) => {
    const lobby = rooms[roomId];
    if (!lobby) return;

    if (guest == 'GONE') {
      // Re-render the lobby on host side when a guest leaves.
      socket.to(lobby.name).emit('renderGuest', 'GONE');
    } else {
      // Update guest object with server/game info, then send back to the host & render it.
      guest.socketID = socket.id;
      guest.room = lobby;
      guest.hosting = false;
      socket.to(lobby.name).emit('renderGuest', guest);
    }
  });

  /**
   * Gets fired when a player leaves a room.
   */
  socket.on('leaveRoom', () => {
    leaveRooms(socket);
  });

  /**
   * When a host closes their room, delete it from global room list and send guests back to landing page.
   */
  socket.on('roomClosed', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    socket.to(room.name).emit('BACK_TO_LANDING');
    leaveRooms(socket);
    delete rooms[roomId];
  });

  /**
   * Gets fired when a player disconnects from the server.
   */
  socket.on('disconnect', () => {
    console.log(`user ${socket.username} disconnected`);
    leaveRooms(socket);
  });
});
