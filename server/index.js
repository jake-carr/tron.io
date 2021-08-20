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

const game = path.join(__dirname, '/../public');
app.use(express.static(game));

server.listen(port, () => {
  console.log(`Server is up on port ${port}.`);
});

// Global list of rooms (lobbies)
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
   * Fire the game if the lobby has two connected players
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

  socket.on('GAME_UPDATE', (roomId, gameState) => {
    // Recieves true game state from host client on an interval and emits it to the lobby.
    const room = rooms[roomId];
    if (!room) return;

    io.in(room.name).emit('GAME_TICK', gameState);
  });

  /**
   * Gets fired every time a player changes direction.
   * @param direction Processed arrow key press indicating which way to move
   */
  socket.on('CHANGE_DIR', (roomId, userId, direction) => {
    const room = rooms[roomId];
    // const connections = room.socketIds;
    // if (!room) return;
    // if (
    //   connections.includes(host.socketID) &&
    //   connections.includes(guest.socketID)
    // ) {
    //   io.in(room.name).emit('GAME_START', host, guest);
    // }
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
    console.log(`user ${socket.username} created room ${roomName}`);

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
    }
    socket.join(room.name);
    room.socketIds.push(socket.id);
    callback(room);
  });

  socket.on('guestJoined', (roomId, guest) => {
    const lobby = rooms[roomId];
    if (!lobby) return;
    if (guest) {
      // Update guest object with server/game info then send it back to the lobby
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
   * Gets fired when a player disconnects from the server.
   */
  socket.on('disconnect', () => {
    console.log(`user ${socket.username} disconnected`);
    leaveRooms(socket);
  });
});
